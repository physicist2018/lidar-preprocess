// ---------------------------------------------------------------------------
// Purely molecular scattering profiles for lidar channel anchoring
// ("молекулярная привязка").
//
// Meteorology file format (fixed by the user):
//   whitespace-separated columns; the first three are used:
//   1) pressure in hectopascals, 2) height in meters, 3) temperature in
//   degrees Celsius. Extra columns are ignored.
// ---------------------------------------------------------------------------

/** Boltzmann constant, J/K. */
export const KB = 1.380649e-23;

/**
 * Molecular extinction-to-backscatter ratio: alpha_m = LRM * beta_m.
 * For pure Rayleigh scattering LRM = 8*pi/3.
 */
export const LRM = (8 * Math.PI) / 3;

/** Reference air molecule number density at 101325 Pa / 288.15 K, m^-3. */
const NS_REF = 2.546939e25;

/** Air refractive index at optical wavelengths (dimensionless). */
const AIR_N = 1.0003;

/** King correction factor for the depolarization of air molecules. */
const KING_FACTOR = 1.05;

/**
 * Parse a meteodata file with the guaranteed column layout:
 * pressure (hPa), height (m), temperature (degC) as the first three
 * whitespace-separated columns. Returns the meteo profiles with converted
 * SI units (Pa, m, K), or an object with an `error` message.
 * @param {string} text
 * @returns {{ error: string } | { heights: Float64Array, press: Float64Array, temp: Float64Array, nRows: number }}
 */
export function parseMeteoFile(text) {
	/** @type {Array<{ P: number, H: number, T: number }>} */
	const rows = [];
	const lines = text.split(/\r\n|\n|\r/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line === '') continue;
		if (line.startsWith('#') || line.startsWith('%') || line.startsWith(';')) continue;
		const tokens = line.split(/\s+/);
		if (tokens.length < 3) {
			return {
				error: `Строка ${i + 1}: ожидается не менее 3 столбцов (давление в гПа, высота в м, температура в °C).`
			};
		}
		const p = Number(tokens[0]);
		const h = Number(tokens[1]);
		const t = Number(tokens[2]);
		if (!Number.isFinite(p) || !Number.isFinite(h) || !Number.isFinite(t)) {
			return {
				error: `Строка ${i + 1}: первые три столбца должны быть числами (давление в гПа, высота в м, температура в °C).`
			};
		}
		if (!(p > 0)) {
			return { error: `Строка ${i + 1}: давление должно быть положительным.` };
		}
		rows.push({ P: p * 100, H: h, T: t + 273.15 });
	}
	if (rows.length < 2) {
		return { error: 'В файле недостаточно строк с данными (нужно минимум 2).' };
	}
	rows.sort((a, b) => a.H - b.H);
	for (const r of rows) {
		if (!(r.H >= 0)) return { error: 'Высота не может быть отрицательной.' };
		if (!(r.T > 0)) return { error: 'Температура должна быть положительной.' };
	}
	return {
		heights: Float64Array.from(rows.map((r) => r.H)),
		press: Float64Array.from(rows.map((r) => r.P)),
		temp: Float64Array.from(rows.map((r) => r.T)),
		nRows: rows.length
	};
}

/**
 * Total Rayleigh scattering cross-section of one air molecule, m^2.
 * King-corrected formula: sigma_R = (8*pi^3 (n^2-1)^2) / (3 * lambda^4 * N_s^2) * F_k.
 * @param {number} wavelengthNm
 * @returns {number}
 */
export function rayleighCrossSection(wavelengthNm) {
	const lambda = wavelengthNm * 1e-9;
	if (!(lambda > 0)) return NaN;
	const n2m1 = AIR_N * AIR_N - 1;
	const top = 8 * Math.PI * Math.PI * Math.PI * n2m1 * n2m1;
	const bottom = 3 * lambda * lambda * lambda * lambda * NS_REF * NS_REF;
	return (top / bottom) * KING_FACTOR;
}

/**
 * Interpolate the meteo pressure/temperature profiles onto a uniform grid of
 * heights (meters). Temperature is interpolated linearly, pressure linearly in
 * log-space (standard for radiosonde profiles). Outside the meteo height range
 * the nearest value is used.
 * @param {{ heights: Float64Array, press: Float64Array, temp: Float64Array }} meteo
 * @param {Float64Array} zGrid target heights, m
 * @returns {{ press: Float64Array, temp: Float64Array }}
 */
export function interpolateOnGrid(meteo, zGrid) {
	const { heights, press, temp } = meteo;
	const n = zGrid.length;
	const pressOut = new Float64Array(n);
	const tempOut = new Float64Array(n);
	const h0 = heights[0];
	const h1 = heights[heights.length - 1];
	// The target grid is strictly increasing, so a monotonic cursor moves only
	// forward: O(n + m) instead of restarting a scan from the top per point.
	let hi = 1;
	for (let j = 0; j < n; j++) {
		const zc = Math.min(Math.max(zGrid[j], h0), h1);
		while (hi < heights.length - 1 && heights[hi] < zc) hi++;
		const hA = heights[hi - 1];
		const hB = heights[hi];
		const span = hB - hA;
		const frac = span > 0 ? (zc - hA) / span : 0;
		const tA = temp[hi - 1];
		const tB = temp[hi];
		tempOut[j] = tA + (tB - tA) * frac;
		const pA = press[hi - 1];
		const pB = press[hi];
		pressOut[j] = Math.exp(Math.log(pA) + (Math.log(pB) - Math.log(pA)) * frac);
	}
	return { press: pressOut, temp: tempOut };
}

/**
 * Compute the unanchored molecular signal profile
 * raw(z) = beta_m(z) * z^-2 * exp(-2 * integral_0^z alpha_m(z') / cos(zenith) dz')
 * on the given height grid, plus the intermediate molecular coefficients.
 * The z^-2 factor is the geometric range correction: the lidar signal of a
 * scattering volume falls off as the squared range, and the constant
 * (1/cos^2) part of the conversion z = r * cos(zenith) is absorbed by K.
 * @param {{ wavelengthNm: number, cosZenith: number, meteo: { heights: Float64Array, press: Float64Array, temp: Float64Array }, zGrid: Float64Array }} config
 * @returns {{ raw: Float64Array }}
 */
export function computeMolecularRaw({ wavelengthNm, cosZenith, meteo, zGrid }) {
	/** @type {Float64Array} */
	const raw = new Float64Array(zGrid.length);

	const sigma = rayleighCrossSection(wavelengthNm);
	if (!(sigma > 0)) return { raw };
	const { press, temp } = interpolateOnGrid(meteo, zGrid);

	// Slant optical depth tau(z) = (1/cos) * integral_0^z alpha(z') dz'
	// accumulated with the trapezoidal rule. The leading bin starts at z = 0.
	// beta/alpha are kept as scalars (only the previous alpha is needed), so no
	// full-length intermediate arrays are materialized.
	const invCos = 1 / cosZenith;
	const betaFactor = 3 / (8 * Math.PI);
	let tau = 0;
	let prevAlpha = 0;
	for (let j = 0; j < zGrid.length; j++) {
		const z = zGrid[j];
		const density = press[j] / (KB * temp[j]);
		const beta = betaFactor * sigma * density;
		const alpha = beta * LRM;
		if (j === 0) {
			tau += alpha * z * invCos;
		} else {
			tau += 0.5 * (prevAlpha + alpha) * (z - zGrid[j - 1]) * invCos;
		}
		raw[j] = z > 0 ? (beta * Math.exp(-2 * tau)) / (z * z) : 0;
		prevAlpha = alpha;
	}
	return { raw };
}

/**
 * Anchoring factor K of one channel: the mean ratio of the measured signal to
 * the unanchored molecular signal within the (zMin; zMax) height window.
 * Returns the number of usable samples taken into the mean.
 * @param {{ measured: Float64Array, raw: Float64Array, zGrid: Float64Array, zMin: number, zMax: number }} config
 * @returns {{ k: number, count: number }}
 */
export function anchorMolecular({ measured, raw, zGrid, zMin, zMax }) {
	let sum = 0;
	let count = 0;
	for (let j = 0; j < raw.length; j++) {
		const z = zGrid[j];
		if (z < zMin || z > zMax) continue;
		const m = measured[j];
		const r = raw[j];
		if (!Number.isFinite(m) || !Number.isFinite(r) || r === 0) continue;
		sum += m / r;
		count++;
	}
	return { k: count > 0 ? sum / count : NaN, count };
}

/**
 * Resample a profile given on a uniform height grid with step `srcDz` (m) onto
 * a uniform grid with step `dstDz` (m), using linear interpolation over
 * physical height. Heights beyond the source coverage are clamped to the top
 * value, mirroring the nearest-value clamping of `interpolateOnGrid`. Used to
 * keep the molecular overlay aligned with the measured signal when the zenith
 * angle changed after anchoring.
 * @param {ArrayLike<number>} values
 * @param {number} srcDz
 * @param {number} dstDz
 * @returns {Float64Array}
 */
export function resampleMolecular(values, srcDz, dstDz) {
	const n = values.length;
	/** @type {Float64Array} */
	const out = new Float64Array(n);
	if (!(srcDz > 0) || !(dstDz > 0)) {
		out.fill(NaN);
		return out;
	}
	for (let j = 0; j < n; j++) {
		const pos = (j * dstDz) / srcDz;
		if (pos >= n - 1) {
			out[j] = values[n - 1];
			continue;
		}
		const i0 = Math.floor(pos);
		const i1 = i0 + 1;
		const frac = pos - i0;
		out[j] = values[i0] * (1 - frac) + values[i1] * frac;
	}
	return out;
}
