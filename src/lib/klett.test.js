import { describe, it, expect } from 'bun:test';
import { klettFernald, molecularProfiles } from './klett.js';

const LRM = (8 * Math.PI) / 3;

/**
 * Build a synthetic exponential atmosphere with a known uniform aerosol
 * backscatter and a given lidar ratio, and feed the analytic forward lidar
 * equation to produce the range-corrected signal S(z) on a uniform grid.
 *
 * Forward model:
 *   β_m(z) = β_m0 · exp(-z / H)
 *   α_m(z) = LRM · β_m(z) / cos   (slant)
 *   α_a(z) = S_a · β_a / cos      (slant, constant)
 *   τ(z)   = (LRM · β_m0 · H · (1 - exp(-z/H)) + S_a · β_a · z) / cos
 *   S(z)   = (β_m(z) + β_a) · exp(-2 τ(z))
 *
 * @param {{
 *   n: number, dz: number, betaM0: number, H: number,
 *   betaA: number, Sa: number, cosZenith: number, C: number
 * }} p
 */
function syntheticAtmosphere(p) {
	const { n, dz, betaM0, H, betaA, Sa, cosZenith, C } = p;
	const r = new Float64Array(n);
	const betaMolecular = new Float64Array(n);
	const alphaMolecular = new Float64Array(n);
	const signal = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		r[i] = i * dz;
		const b = betaM0 * Math.exp(-r[i] / H);
		betaMolecular[i] = b;
		alphaMolecular[i] = (LRM * b) / cosZenith;
		const tau = (LRM * betaM0 * H * (1 - Math.exp(-r[i] / H)) + Sa * betaA * r[i]) / cosZenith;
		signal[i] = C * (b + betaA) * Math.exp(-2 * tau);
	}
	return { r, signal, betaMolecular, alphaMolecular };
}

describe('klettFernald', () => {
	it('recovers a constant β_a within a few percent when the boundary is exact', () => {
		const cos = 1;
		const params = {
			n: 100,
			dz: 100,
			betaM0: 1e-6,
			H: 8000,
			betaA: 5e-6,
			Sa: 40,
			cosZenith: cos,
			C: 1
		};
		const { r, signal, betaMolecular, alphaMolecular } = syntheticAtmosphere(params);

		const refIdx = r.length - 1;
		const refHeight = r[refIdx];

		const out = klettFernald({
			signal,
			r,
			betaMolecular,
			alphaMolecular,
			refHeight,
			lidarRatio: params.Sa,
			refScatteringRatio: 1 + params.betaA / betaMolecular[refIdx]
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;

		for (let i = 0; i < r.length; i++) {
			expect(Number.isFinite(out.betaAerosol[i])).toBe(true);
			const relErr = Math.abs(out.betaAerosol[i] - params.betaA) / params.betaA;
			expect(relErr).toBeLessThan(0.05);
		}
	});

	it('produces α_a = S_a · β_a exactly (within float precision)', () => {
		const cos = 1;
		const params = {
			n: 60,
			dz: 100,
			betaM0: 2e-6,
			H: 8000,
			betaA: 4e-6,
			Sa: 50,
			cosZenith: cos,
			C: 1
		};
		const { r, signal, betaMolecular, alphaMolecular } = syntheticAtmosphere(params);
		const refIdx = r.length - 1;

		const out = klettFernald({
			signal,
			r,
			betaMolecular,
			alphaMolecular,
			refHeight: r[refIdx],
			lidarRatio: params.Sa,
			refScatteringRatio: 1 + params.betaA / betaMolecular[refIdx]
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;

		for (let i = 0; i < r.length; i++) {
			expect(Math.abs(out.alphaAerosol[i] - params.Sa * out.betaAerosol[i])).toBeLessThan(1e-15);
		}
	});

	it('fills bins above and below the reference height (two-way inversion)', () => {
		const cos = 1;
		const params = {
			n: 50,
			dz: 100,
			betaM0: 1e-6,
			H: 8000,
			betaA: 2e-6,
			Sa: 40,
			cosZenith: cos,
			C: 1
		};
		const { r, signal, betaMolecular, alphaMolecular } = syntheticAtmosphere(params);
		const refHeight = r[20];
		const out = klettFernald({
			signal,
			r,
			betaMolecular,
			alphaMolecular,
			refHeight,
			lidarRatio: params.Sa,
			refScatteringRatio: 1 + params.betaA / betaMolecular[20]
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;

		for (let i = 0; i < r.length; i++) {
			expect(Number.isFinite(out.betaAerosol[i])).toBe(true);
		}
		for (let i = 0; i < r.length; i++) {
			const relErr = Math.abs(out.betaAerosol[i] - params.betaA) / params.betaA;
			expect(relErr).toBeLessThan(0.03);
		}
	});

	it('rejects refHeight outside the profile range', () => {
		const cos = 1;
		const params = {
			n: 40,
			dz: 100,
			betaM0: 1e-6,
			H: 8000,
			betaA: 2e-6,
			Sa: 40,
			cosZenith: cos,
			C: 1
		};
		const { r, signal, betaMolecular, alphaMolecular } = syntheticAtmosphere(params);

		const tooLow = klettFernald({
			signal,
			r,
			betaMolecular,
			alphaMolecular,
			refHeight: r[0] - 10,
			lidarRatio: 40,
			refScatteringRatio: 1
		});
		expect(tooLow.ok).toBe(false);
		if (tooLow.ok) return;
		expect(tooLow.error).toMatch(/Референсная высота/);
	});

	it('rejects non-positive lidar ratio', () => {
		const cos = 1;
		const params = {
			n: 30,
			dz: 100,
			betaM0: 1e-6,
			H: 8000,
			betaA: 2e-6,
			Sa: 40,
			cosZenith: cos,
			C: 1
		};
		const { r, signal, betaMolecular, alphaMolecular } = syntheticAtmosphere(params);

		const out = klettFernald({
			signal,
			r,
			betaMolecular,
			alphaMolecular,
			refHeight: r[10],
			lidarRatio: 0,
			refScatteringRatio: 1
		});
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toMatch(/Лидарное отношение/);
	});

	it('rejects non-monotonic height grids', () => {
		const cos = 1;
		const { r, signal, betaMolecular, alphaMolecular } = syntheticAtmosphere({
			n: 30,
			dz: 100,
			betaM0: 1e-6,
			H: 8000,
			betaA: 2e-6,
			Sa: 40,
			cosZenith: cos,
			C: 1
		});
		r[5] = r[4];
		const out = klettFernald({
			signal,
			r,
			betaMolecular,
			alphaMolecular,
			refHeight: 500,
			lidarRatio: 40,
			refScatteringRatio: 1
		});
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toMatch(/монотонно/);
	});

	it('with R_ref = 1 the boundary is purely molecular and β_a(z_ref) = 0', () => {
		const cos = 1;
		const params = {
			n: 40,
			dz: 100,
			betaM0: 1e-6,
			H: 8000,
			betaA: 2e-6,
			Sa: 40,
			cosZenith: cos,
			C: 1
		};
		const { r, signal, betaMolecular, alphaMolecular } = syntheticAtmosphere(params);
		const refIdx = 39;
		const out = klettFernald({
			signal,
			r,
			betaMolecular,
			alphaMolecular,
			refHeight: r[refIdx],
			lidarRatio: 40,
			refScatteringRatio: 1
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		expect(Math.abs(out.betaAerosol[refIdx])).toBeLessThan(1e-18);
		expect(Math.abs(out.alphaAerosol[refIdx])).toBeLessThan(1e-18);
	});
});

describe('molecularProfiles', () => {
	it('returns β_m and slant α_m consistent with `molecular.js` rayleigh cross section', () => {
		const meteo = {
			heights: new Float64Array([0, 5000, 10000]),
			press: new Float64Array([101325, 54048, 26500]),
			temp: new Float64Array([288.15, 255.65, 223.15])
		};
		const zGrid = new Float64Array([0, 1000, 2000, 3000, 4000, 5000]);
		const cos = 0.866;
		const { betaMolecular, alphaMolecular } = molecularProfiles({
			meteo,
			zGrid,
			wavelengthNm: 532,
			cosZenith: cos
		});

		expect(betaMolecular.length).toBe(zGrid.length);
		expect(alphaMolecular.length).toBe(zGrid.length);
		for (let i = 0; i < betaMolecular.length; i++) {
			expect(betaMolecular[i]).toBeGreaterThan(0);
			expect(Math.abs(alphaMolecular[i] - (LRM * betaMolecular[i]) / cos)).toBeLessThan(1e-18);
		}
		expect(betaMolecular[0]).toBeGreaterThan(betaMolecular[betaMolecular.length - 1]);
	});

	it('clamps outside the meteo height range', () => {
		const meteo = {
			heights: new Float64Array([0, 5000]),
			press: new Float64Array([101325, 54048]),
			temp: new Float64Array([288.15, 255.65])
		};
		const zGrid = new Float64Array([0, 5000, 10000]);
		const { betaMolecular } = molecularProfiles({
			meteo,
			zGrid,
			wavelengthNm: 532,
			cosZenith: 1
		});
		expect(betaMolecular[2]).toBeCloseTo(betaMolecular[1], 10);
	});
});
