// ---------------------------------------------------------------------------
// Klett-Fernald elastic lidar inversion.
//
// Recovers the aerosol backscatter coefficient β_a(z) and extinction
// coefficient α_a(z) from a range-corrected elastic lidar signal
// S(z) = P(z) · z², assuming a known lidar ratio (extinction-to-backscatter
// ratio) S_a and a reference value at a single calibration height z_ref.
//
// Reference implementation follows the stable BACKWARD formulation of
// Klett (1981) and Fernald (1984) for the regime S_a > S_m (typical of the
// troposphere): integration proceeds from z_ref DOWN to the ground, which
// suppresses the divergence that plagued Fernald's original forward
// solution. Values ABOVE z_ref are not solved by the inversion (the
// forward direction is ill-conditioned) and are left as NaN — callers that
// need a top-to-bottom profile should choose z_ref at or above the top
// of the aerosol layer of interest.
//
// Governing equation (slant optical depth, including the 1/cos(zenith)
// factor absorbed into α via the molecular profile passed in by the caller):
//   β(z) = β_m(z) + β_a(z)
//   α(z) = α_m(z) + S_a · β_a(z)
//   S(z) = C · β(z) · exp(-2 ∫_0^z α(z') dz')
//
// Discretized backward step (with the "β_a constant within a bin"
// approximation). With α_m in slant units (divided by cos(zenith)):
//   Y = S(z_{k-1})/S(z_k) · exp(-2·(ᾱ_m · Δz + S_a·β_a(z_k)·Δz))
//   β(z_{k-1}) = β(z_k) · Y
//
// Here β_a(z_k) = β(z_k) − β_m(z_k) is the boundary value (we know β_k).
// Going BACKWARD from a known β_k, the relation is just a multiplication:
// no exponential amplification in the unknown direction. This is the form
// that Klett's "stable analytical inversion" reduces to once the β_a
// closure approximation is applied, and it is exact when β_a is constant
// in the bin (the standard benchmark).
//
// Boundary condition: β(z_ref) = R_ref · β_m(z_ref), where R_ref is the total
// scattering ratio at the reference height: R_ref = β/β_m = 1 + β_a/β_m
// (1 for a purely molecular calibration point, larger when a known aerosol
// load is assumed).
// ---------------------------------------------------------------------------

import { rayleighCrossSection, LRM, KB } from './molecular.js';

/**
 * @typedef {{
 *   signal: Float64Array,
 *   r: Float64Array,
 *   betaMolecular: Float64Array,
 *   alphaMolecular: Float64Array,
 *   refHeight: number,
 *   lidarRatio: number,
 *   refScatteringRatio?: number
 * }} KlettInput
 *
 * The boundary parameter `refScatteringRatio` is the TOTAL scattering ratio
 * R_ref = β/β_m = 1 + β_a/β_m at the reference height: 1 for a purely
 * molecular calibration point, larger when a known aerosol load is assumed.
 *
 * @typedef {{
 *   betaAerosol: Float64Array,
 *   alphaAerosol: Float64Array,
 *   betaTotal: Float64Array,
 *   alphaTotal: Float64Array,
 *   refIndex: number
 * }} KlettResultBase
 *
 * @typedef {(KlettResultBase & { ok: true }) | (KlettResultBase & { ok: false, error: string })} KlettResult
 */

/**
 * Run the Klett-Fernald backward inversion on a single profile.
 * All input arrays must have identical length. Returns either a populated
 * result (with `ok: true`) or an error description (with `ok: false`).
 *
 * @param {KlettInput} input
 * @returns {KlettResult}
 */
export function klettFernald(input) {
	const err = validateKlettInput(input);
	if (err) return { ...emptyResults(), ok: false, error: err };

	const {
		signal,
		r,
		betaMolecular,
		alphaMolecular,
		refHeight,
		lidarRatio,
		refScatteringRatio = 1
	} = input;
	const n = r.length;
	const Sa = lidarRatio;

	const refIdx = heightIndex(r, refHeight);
	if (refIdx < 0 || refIdx >= n) {
		return {
			...emptyResults(),
			ok: false,
			error: `Референсная высота ${refHeight} м вне диапазона профиля (${r[0]}–${r[n - 1]} м).`
		};
	}
	const betaMRef = betaMolecular[refIdx];
	if (!(betaMRef > 0)) {
		return {
			...emptyResults(),
			ok: false,
			error: `Молекулярный коэффициент обратного рассеяния на референсной высоте ${refHeight} м не положителен.`
		};
	}

	const betaAerosol = new Float64Array(n);
	const alphaAerosol = new Float64Array(n);
	const betaTotal = new Float64Array(n);
	const alphaTotal = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		betaAerosol[i] = NaN;
		alphaAerosol[i] = NaN;
	}

	const refBeta = refScatteringRatio * betaMRef;
	betaTotal[refIdx] = refBeta;
	// Defensive clamp: R_ref >= 1 (validated above) and betaMRef > 0 guarantee
	// refBeta - betaMRef >= 0, so this never reduces the anchor value.
	betaAerosol[refIdx] = Math.max(refBeta - betaMRef, 0);
	alphaAerosol[refIdx] = Sa * betaAerosol[refIdx];
	alphaTotal[refIdx] = alphaMolecular[refIdx] + alphaAerosol[refIdx];

	for (let k = refIdx; k > 0; k--) {
		const prev = stepBackward({
			sPrev: signal[k - 1],
			sK: signal[k],
			betaMPrev: betaMolecular[k - 1],
			betaMK: betaMolecular[k],
			alphaMPrev: alphaMolecular[k - 1],
			alphaMK: alphaMolecular[k],
			betaK: betaTotal[k],
			Sa,
			dz: r[k] - r[k - 1]
		});
		if (!Number.isFinite(prev)) {
			return {
				...emptyResults(),
				ok: false,
				error: `Численная неустойчивость Клетта на высоте ${r[k - 1].toFixed(0)} м.`
			};
		}
		betaTotal[k - 1] = prev;
		betaAerosol[k - 1] = Math.max(prev - betaMolecular[k - 1], 0);
		alphaAerosol[k - 1] = Sa * betaAerosol[k - 1];
		alphaTotal[k - 1] = alphaMolecular[k - 1] + alphaAerosol[k - 1];
	}

	for (let k = refIdx; k < n - 1; k++) {
		const next = stepForward({
			sNext: signal[k + 1],
			sK: signal[k],
			betaMNext: betaMolecular[k + 1],
			betaMK: betaMolecular[k],
			alphaMNext: alphaMolecular[k + 1],
			alphaMK: alphaMolecular[k],
			betaK: betaTotal[k],
			Sa,
			dz: r[k + 1] - r[k]
		});
		if (!Number.isFinite(next)) break;
		betaTotal[k + 1] = next;
		betaAerosol[k + 1] = Math.max(next - betaMolecular[k + 1], 0);
		alphaAerosol[k + 1] = Sa * betaAerosol[k + 1];
		alphaTotal[k + 1] = alphaMolecular[k + 1] + alphaAerosol[k + 1];
	}

	return {
		betaAerosol,
		alphaAerosol,
		betaTotal,
		alphaTotal,
		refIndex: refIdx,
		ok: true
	};
}

/**
 * Single backward Klett step. Caller passes α_m in slant units.
 * @param {{
 *   sPrev: number, sK: number,
 *   betaMPrev: number, betaMK: number,
 *   alphaMPrev: number, alphaMK: number,
 *   betaK: number, Sa: number, dz: number
 * }} p
 * @returns {number}
 */
function stepBackward(p) {
	const { sPrev, sK, betaMPrev, betaMK, alphaMPrev, alphaMK, betaK, Sa, dz } = p;
	if (!(betaK > 0) || !(dz > 0) || !(Sa > 0)) return NaN;
	if (!(betaMK > 0)) return NaN;
	if (sPrev <= 0) return 0;
	if (sK <= 0) return 0;
	const alphaMid = 0.5 * (alphaMPrev + alphaMK);
	const betaAK = Math.max(betaK - betaMK, 0);
	const Y = (sPrev / sK) * Math.exp(-2 * (alphaMid + Sa * betaAK) * dz);
	return betaK * Y;
}

/**
 * Single forward Klett step. Integrates upward from the reference point.
 * @param {{
 *   sNext: number, sK: number,
 *   betaMNext: number, betaMK: number,
 *   alphaMNext: number, alphaMK: number,
 *   betaK: number, Sa: number, dz: number
 * }} p
 * @returns {number}
 */
function stepForward(p) {
	const { sNext, sK, betaMNext, betaMK, alphaMNext, alphaMK, betaK, Sa, dz } = p;
	if (!(betaK > 0) || !(dz > 0) || !(Sa > 0)) return NaN;
	if (!(betaMK > 0)) return NaN;
	if (sNext <= 0) return 0;
	if (sK <= 0) return 0;
	const alphaMid = 0.5 * (alphaMK + alphaMNext);
	const betaAK = Math.max(betaK - betaMK, 0);
	const Y = (sNext / sK) * Math.exp(2 * (alphaMid + Sa * betaAK) * dz);
	return betaK * Y;
}

/**
 * @param {KlettInput} input
 * @returns {string | null}
 */
function validateKlettInput(input) {
	if (!input) return 'Не переданы параметры Клетта.';
	const { signal, r, betaMolecular, alphaMolecular, refHeight, lidarRatio } = input;
	if (!(signal instanceof Float64Array) || signal.length === 0) {
		return 'Сигнал пуст или не является Float64Array.';
	}
	const n = signal.length;
	if (!(r instanceof Float64Array) || r.length !== n) {
		return 'Массив высот r отсутствует или не совпадает по длине с сигналом.';
	}
	if (!(betaMolecular instanceof Float64Array) || betaMolecular.length !== n) {
		return 'Массив β_m пуст или не совпадает по длине с сигналом.';
	}
	if (!(alphaMolecular instanceof Float64Array) || alphaMolecular.length !== n) {
		return 'Массив α_m ��уст или не совпадает по длине с сигналом.';
	}
	if (!Number.isFinite(refHeight) || refHeight <= 0) {
		return 'Референсная высота должна быть положительным числом.';
	}
	if (!Number.isFinite(lidarRatio) || lidarRatio <= 0) {
		return 'Лидарное отношение должно быть положительным числом.';
	}
	const rSR = input.refScatteringRatio ?? 1;
	if (!Number.isFinite(rSR) || rSR < 1) {
		return 'Отношение рассеяния R(z_ref) должно быть не меньше 1 (чисто молекулярная привязка — 1, иначе 1 + β_a/β_m).';
	}
	for (let i = 0; i < n; i++) {
		if (
			!Number.isFinite(signal[i]) ||
			!Number.isFinite(r[i]) ||
			!Number.isFinite(betaMolecular[i]) ||
			!Number.isFinite(alphaMolecular[i])
		) {
			return `Нечисловое значение на индексе ${i}.`;
		}
		if (signal[i] < 0 || betaMolecular[i] <= 0 || alphaMolecular[i] < 0) {
			return `Нефизичное значение на индексе ${i}: сигнал и β_m должны быть ≥ 0, α_m ≥ 0.`;
		}
		if (r[i] < 0) return `О��рицательная высота на индексе ${i}.`;
	}
	for (let i = 1; i < n; i++) {
		if (!(r[i] > r[i - 1])) return `Высоты не монотонно возрастают (индекс ${i}).`;
	}
	return null;
}

/** @returns {KlettResultBase} */
function emptyResults() {
	return {
		betaAerosol: new Float64Array(0),
		alphaAerosol: new Float64Array(0),
		betaTotal: new Float64Array(0),
		alphaTotal: new Float64Array(0),
		refIndex: -1
	};
}

/**
 * Index of the grid point closest to (and ≤) refHeight, snapped to the grid.
 * Returns 0 if below the grid, n-1 if above.
 * @param {Float64Array} r
 * @param {number} refHeight
 */
function heightIndex(r, refHeight) {
	const n = r.length;
	if (n === 0) return -1;
	if (refHeight <= r[0]) return 0;
	if (refHeight >= r[n - 1]) return n - 1;
	let i = 1;
	while (i < n && r[i] < refHeight) i++;
	return i;
}

/**
 * Recompute the molecular backscatter and extinction profiles on a uniform
 * height grid from the same meteorological data used for anchoring. The
 * extinction is returned in SLANT units (divided by cos(zenith)) to match
 * the convention expected by {@link klettFernald}.
 *
 * @param {{
 *   meteo: { heights: Float64Array, press: Float64Array, temp: Float64Array },
 *   zGrid: Float64Array,
 *   wavelengthNm: number,
 *   cosZenith: number
 * }} config
 * @returns {{ betaMolecular: Float64Array, alphaMolecular: Float64Array }}
 */
export function molecularProfiles({ meteo, zGrid, wavelengthNm, cosZenith }) {
	const n = zGrid.length;
	const betaMolecular = new Float64Array(n);
	const alphaMolecular = new Float64Array(n);
	if (!(cosZenith > 0) || !(n > 0) || !meteo) return { betaMolecular, alphaMolecular };

	const sigma = rayleighCrossSection(wavelengthNm);
	if (!(sigma > 0)) return { betaMolecular, alphaMolecular };

	const { press, temp } = interpolatePressTemp(meteo, zGrid);
	const invCos = 1 / cosZenith;
	const betaFactor = (3 * sigma) / (8 * Math.PI);
	for (let j = 0; j < n; j++) {
		const density = press[j] / (KB * temp[j]);
		const beta = betaFactor * density;
		betaMolecular[j] = beta;
		alphaMolecular[j] = beta * LRM * invCos;
	}
	return { betaMolecular, alphaMolecular };
}

/**
 * Linear interpolation of pressure (in log-space) and temperature onto zGrid.
 * Heights beyond the meteo coverage are clamped to the boundary value.
 * @param {{ heights: Float64Array, press: Float64Array, temp: Float64Array }} meteo
 * @param {Float64Array} zGrid
 * @returns {{ press: Float64Array, temp: Float64Array }}
 */
function interpolatePressTemp(meteo, zGrid) {
	const { heights, press, temp } = meteo;
	const n = zGrid.length;
	const pressOut = new Float64Array(n);
	const tempOut = new Float64Array(n);
	const h0 = heights[0];
	const h1 = heights[heights.length - 1];
	let hi = 1;
	for (let j = 0; j < n; j++) {
		const zc = Math.min(Math.max(zGrid[j], h0), h1);
		while (hi < heights.length - 1 && heights[hi] < zc) hi++;
		const hA = heights[hi - 1];
		const hB = heights[hi];
		const span = hB - hA;
		const frac = span > 0 ? (zc - hA) / span : 0;
		tempOut[j] = temp[hi - 1] + (temp[hi] - temp[hi - 1]) * frac;
		const pA = press[hi - 1];
		const pB = press[hi];
		pressOut[j] = Math.exp(Math.log(pA) + (Math.log(pB) - Math.log(pA)) * frac);
	}
	return { press: pressOut, temp: tempOut };
}
