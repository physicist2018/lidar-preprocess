import { describe, it, expect } from 'bun:test';
import { ansmannRamanElastic, RR_PUMP_PAIRS } from './ansmann.js';
import { rayleighCrossSection, LRM } from './molecular.js';

/**
 * Build a synthetic rotational-Raman forward measurement consistent with the
 * app's molecular conventions (β_m = (3σ/(8π))·N, α_m = LRM·β_m, trapezoid
 * slant optical depth τ on the r = (j+0.5)·dz grid). The aerosol extinction
 * profile α_a(λ_L) is analytic; α_a(λ_R) follows the Angstroem law.
 *
 * @param {{
 *   n: number, dz: number, N0: number, scaleH: number,
 *   lambdaL: number, lambdaR: number, k: number,
 *   alphaA: (j: number, r: number) => number
 * }} cfg
 * @returns {{
 *   r: Float64Array, density: Float64Array,
 *   alphaMolecularPump: Float64Array, alphaMolecularRaman: Float64Array,
 *   signal: Float64Array, alphaAerosolPump: Float64Array
 * }}
 */
function syntheticRaman(cfg) {
	const { n, dz, N0, scaleH, lambdaL, lambdaR, k, alphaA } = cfg;
	const r = new Float64Array(n);
	const density = new Float64Array(n);
	const alphaMolecularPump = new Float64Array(n);
	const alphaMolecularRaman = new Float64Array(n);
	const alphaAerosolPump = new Float64Array(n);
	const betaFactorPump = (3 * rayleighCrossSection(lambdaL)) / (8 * Math.PI);
	const betaFactorRaman = (3 * rayleighCrossSection(lambdaR)) / (8 * Math.PI);
	const angstrom = Math.pow(lambdaL / lambdaR, k);
	for (let j = 0; j < n; j++) {
		r[j] = (j + 0.5) * dz;
		density[j] = N0 * Math.exp(-r[j] / scaleH);
		alphaMolecularPump[j] = LRM * betaFactorPump * density[j];
		alphaMolecularRaman[j] = LRM * betaFactorRaman * density[j];
		alphaAerosolPump[j] = alphaA(j, r[j]);
	}
	const signal = new Float64Array(n);
	let tau = 0;
	let prevQ = 0;
	for (let j = 0; j < n; j++) {
		const q = alphaMolecularPump[j] + alphaMolecularRaman[j] + alphaAerosolPump[j] * (1 + angstrom);
		if (j === 0) tau += 0.5 * q * r[j];
		else tau += 0.5 * (prevQ + q) * (r[j] - r[j - 1]);
		prevQ = q;
		signal[j] = density[j] * Math.exp(-tau);
	}
	return { r, density, alphaMolecularPump, alphaMolecularRaman, signal, alphaAerosolPump };
}

const BASE = {
	n: 600,
	dz: 15,
	N0: 2.5e25,
	scaleH: 8000,
	lambdaL: 355,
	lambdaR: 353,
	k: 1
};

/** Interior bins where the derivative is well-conditioned.
 * @param {number} n
 * @param {number} window
 * @returns {number[]}
 */
function interior(n, window) {
	const lo = Math.max(window + 2, Math.floor(n * 0.15));
	const hi = n - window - 2;
	/** @type {number[]} */
	const idx = [];
	for (let j = lo; j < hi; j++) idx.push(j);
	return idx;
}

describe('ansmannRamanElastic', () => {
	it('recovers a constant α_a layer on interior bins', () => {
		const alphaA0 = 2e-4;
		const fwd = syntheticRaman({ ...BASE, alphaA: () => alphaA0 });
		const out = ansmannRamanElastic({
			...fwd,
			pumpWavelength: BASE.lambdaL,
			ramanWavelength: BASE.lambdaR,
			angstromExponent: BASE.k,
			derivativeWindow: 11,
			startIndex: 0
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		let maxRel = 0;
		for (const j of interior(BASE.n, 11)) {
			expect(Number.isFinite(out.alphaAerosol[j])).toBe(true);
			const relErr = Math.abs(out.alphaAerosol[j] - alphaA0) / alphaA0;
			maxRel = Math.max(maxRel, relErr);
		}
		expect(maxRel).toBeLessThan(0.05);
	});

	it('recovers a Gaussian α_a layer (peak position and amplitude)', () => {
		const center = 3000;
		const width = 600;
		const amp = 4e-4;
		const alphaA = (/** @type {number} */ j, /** @type {number} */ rr) =>
			amp * Math.exp(-((rr - center) ** 2) / (2 * width * width));
		const fwd = syntheticRaman({ ...BASE, alphaA });
		const out = ansmannRamanElastic({
			...fwd,
			pumpWavelength: BASE.lambdaL,
			ramanWavelength: BASE.lambdaR,
			angstromExponent: BASE.k,
			derivativeWindow: 11,
			startIndex: 0
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		let bestJ = -1;
		let bestV = -1;
		for (let j = 0; j < BASE.n; j++) {
			if (out.alphaAerosol[j] > bestV) {
				bestV = out.alphaAerosol[j];
				bestJ = j;
			}
		}
		const bestR = (bestJ + 0.5) * BASE.dz;
		expect(Math.abs(bestR - center)).toBeLessThan(150);
		expect(bestV).toBeGreaterThan(0.9 * amp);
	});

	it('returns α_a ≈ 0 in a purely molecular atmosphere', () => {
		const fwd = syntheticRaman({ ...BASE, alphaA: () => 0 });
		const out = ansmannRamanElastic({
			...fwd,
			pumpWavelength: BASE.lambdaL,
			ramanWavelength: BASE.lambdaR,
			angstromExponent: BASE.k,
			derivativeWindow: 11,
			startIndex: 0
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		let max = 0;
		for (const j of interior(BASE.n, 11)) max = Math.max(max, out.alphaAerosol[j]);
		expect(max).toBeLessThan(2e-6);
	});

	it('masks the dead zone with NaN and still recovers above it', () => {
		const alphaA0 = 2e-4;
		const fwd = syntheticRaman({ ...BASE, alphaA: () => alphaA0 });
		const out = ansmannRamanElastic({
			...fwd,
			pumpWavelength: BASE.lambdaL,
			ramanWavelength: BASE.lambdaR,
			angstromExponent: BASE.k,
			derivativeWindow: 11,
			startIndex: 100
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		for (let j = 0; j < 100; j++) {
			expect(Number.isNaN(out.alphaAerosol[j])).toBe(true);
		}
		let maxRel = 0;
		for (const j of interior(BASE.n, 11)) {
			if (j < 100) continue;
			maxRel = Math.max(maxRel, Math.abs(out.alphaAerosol[j] - alphaA0) / alphaA0);
		}
		expect(maxRel).toBeLessThan(0.05);
	});

	it('is nearly insensitive to the Angstroem exponent for λ_R ≈ λ_L', () => {
		const alphaA0 = 2e-4;
		const runs = [];
		for (const k of [0.5, 1, 1.5]) {
			const fwd = syntheticRaman({ ...BASE, k, alphaA: () => alphaA0 });
			const out = ansmannRamanElastic({
				...fwd,
				pumpWavelength: BASE.lambdaL,
				ramanWavelength: BASE.lambdaR,
				angstromExponent: k,
				derivativeWindow: 11,
				startIndex: 0
			});
			expect(out.ok).toBe(true);
			if (out.ok) runs.push(out.alphaAerosol);
		}
		let maxSpread = 0;
		for (const j of interior(BASE.n, 11)) {
			const lo = Math.min(runs[0][j], runs[1][j], runs[2][j]);
			const hi = Math.max(runs[0][j], runs[1][j], runs[2][j]);
			maxSpread = Math.max(maxSpread, hi - lo);
		}
		expect(maxSpread).toBeLessThan(0.01 * alphaA0);
	});

	it('returns NaN, not negatives, where the signal is non-positive', () => {
		const fwd = syntheticRaman({ ...BASE, alphaA: () => 2e-4 });
		fwd.signal[300] = 0;
		const out = ansmannRamanElastic({
			...fwd,
			pumpWavelength: BASE.lambdaL,
			ramanWavelength: BASE.lambdaR,
			angstromExponent: BASE.k,
			derivativeWindow: 3,
			startIndex: 0
		});
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		for (let j = 299; j <= 301; j++) {
			expect(out.alphaAerosol[j]).toBeNaN();
		}
		for (const j of interior(BASE.n, 3)) {
			if (Number.isNaN(out.alphaAerosol[j])) continue;
			expect(out.alphaAerosol[j]).toBeGreaterThanOrEqual(0);
		}
	});

	it('is deterministic for identical inputs', () => {
		const fwd = syntheticRaman({ ...BASE, alphaA: () => 2e-4 });
		const cfg = {
			...fwd,
			pumpWavelength: BASE.lambdaL,
			ramanWavelength: BASE.lambdaR,
			angstromExponent: BASE.k,
			derivativeWindow: 11,
			startIndex: 0
		};
		const a = ansmannRamanElastic(cfg);
		const b = ansmannRamanElastic(cfg);
		expect(a.ok).toBe(true);
		if (!(a.ok && b.ok)) return;
		for (let j = 0; j < BASE.n; j++) {
			expect(a.alphaAerosol[j]).toBe(b.alphaAerosol[j]);
		}
	});

	it('exposes RR_PUMP_PAIRS for 353→355 and 530→532', () => {
		expect(RR_PUMP_PAIRS[353]).toBe(355);
		expect(RR_PUMP_PAIRS[530]).toBe(532);
	});
});

describe('ansmannRamanElastic — validation', () => {
	const fwd = syntheticRaman({ ...BASE, alphaA: () => 2e-4 });
	const validCfg = {
		...fwd,
		pumpWavelength: BASE.lambdaL,
		ramanWavelength: BASE.lambdaR,
		angstromExponent: BASE.k,
		derivativeWindow: 11,
		startIndex: 0
	};

	it('rejects missing input', () => {
		const out = ansmannRamanElastic(/** @type {any} */ (null));
		expect(out.ok).toBe(false);
	});

	it('rejects length-mismatched arrays', () => {
		const cfg = { ...validCfg, density: new Float64Array(BASE.n + 1) };
		const out = ansmannRamanElastic(cfg);
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toMatch(/не совпадает по длине/);
	});

	it('rejects coincident λ_L and λ_R', () => {
		const out = ansmannRamanElastic({ ...validCfg, ramanWavelength: 355 });
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toMatch(/совпадают/);
	});

	it('rejects a Raman shift above 50 nm', () => {
		const out = ansmannRamanElastic({ ...validCfg, ramanWavelength: 300 });
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toMatch(/сдвиг/);
	});

	it('rejects an Angstroem exponent outside [0, 3]', () => {
		const out = ansmannRamanElastic({ ...validCfg, angstromExponent: 5 });
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toMatch(/Ангстрёма/);
	});

	it('rejects a small derivative window', () => {
		const out = ansmannRamanElastic({ ...validCfg, derivativeWindow: 1 });
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toMatch(/Окно производной/);
	});

	it('rejects startIndex outside the profile', () => {
		const out = ansmannRamanElastic({ ...validCfg, startIndex: BASE.n });
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toMatch(/мёртвой зоны/);
	});

	it('rejects non-monotonic ranges', () => {
		const r = new Float64Array(fwd.r);
		r[5] = r[4];
		const out = ansmannRamanElastic({ ...validCfg, r });
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toMatch(/монотонно/);
	});

	it('rejects non-finite signal samples', () => {
		const signal = new Float64Array(fwd.signal);
		signal[10] = NaN;
		const out = ansmannRamanElastic({ ...validCfg, signal });
		expect(out.ok).toBe(false);
		if (out.ok) return;
		expect(out.error).toMatch(/Нечисловой сигнал/);
	});
});
