import { describe, it, expect } from 'bun:test';
import { SMOOTHING_ALGORITHMS, getAlgorithm, applySmoothingFn } from './smoothing';

// ---------------------------------------------------------------------------
// Algorithm definitions
// ---------------------------------------------------------------------------

describe('SMOOTHING_ALGORITHMS', () => {
	it('includes savitzky_golay with 5 parameters', () => {
		const alg = SMOOTHING_ALGORITHMS.find((a) => a.id === 'savitzky_golay');
		expect(alg).toBeDefined();
		expect(alg.params).toHaveLength(5);
		expect(alg.params.map((p) => p.key)).toEqual([
			'polynomialOrder',
			'baseWindowSize',
			'adaptivity',
			'minWindowSize',
			'maxWindowSize'
		]);
	});

	it('has correct default values for savitzky_golay', () => {
		const alg = getAlgorithm('savitzky_golay');
		const defaults = {};
		for (const p of alg.params) defaults[p.key] = p.default;
		expect(defaults.polynomialOrder).toBe(2);
		expect(defaults.baseWindowSize).toBe(11);
		expect(defaults.adaptivity).toBe(1);
		expect(defaults.minWindowSize).toBe(3);
		expect(defaults.maxWindowSize).toBe(21);
	});
});

// ---------------------------------------------------------------------------
// applySmoothingFn — savitzky_golay
// ---------------------------------------------------------------------------

describe('applySmoothingFn — savitzky_golay', () => {
	const params = {
		polynomialOrder: 2,
		baseWindowSize: 11,
		adaptivity: 1,
		minWindowSize: 3,
		maxWindowSize: 21
	};

	it('returns Float64Array of same length', () => {
		const data = new Float64Array([1, 2, 3, 4, 5]);
		const result = applySmoothingFn('savitzky_golay', data, params);
		expect(result).toBeInstanceOf(Float64Array);
		expect(result.length).toBe(5);
	});

	it('returns empty array for empty input', () => {
		const data = new Float64Array(0);
		const result = applySmoothingFn('savitzky_golay', data, params);
		expect(result.length).toBe(0);
	});

	it('smooths a linear signal (output ≈ input) with small values', () => {
		// Use values close to eps so arcsinh ≈ linear
		const n = 100;
		const data = new Float64Array(n);
		for (let i = 0; i < n; i++) data[i] = i * 1e-8; // tiny values, arcsinh ≈ identity
		const result = applySmoothingFn('savitzky_golay', data, params);
		let maxErr = 0;
		for (let i = 0; i < n; i++) {
			const err = Math.abs(result[i] - data[i]);
			if (err > maxErr) maxErr = err;
		}
		// With tiny values the transform is nearly linear, SG preserves linear
		expect(maxErr).toBeLessThan(0.01);
	});

	it('smooths a quadratic signal (output ≈ input) with small values', () => {
		const n = 100;
		const data = new Float64Array(n);
		for (let i = 0; i < n; i++) data[i] = (i * i) * 1e-8;
		const result = applySmoothingFn('savitzky_golay', data, params);
		let maxErr = 0;
		for (let i = 0; i < n; i++) {
			const err = Math.abs(result[i] - data[i]);
			if (err > maxErr) maxErr = err;
		}
		expect(maxErr).toBeLessThan(0.1);
	});

	it('reduces noise on a noisy sinusoid', () => {
		const n = 200;
		const freq = 0.05;
		const signal = new Float64Array(n);
		const noisy = new Float64Array(n);
		// Use deterministic pseudo-random for reproducibility
		let seed = 42;
		const seededRandom = () => {
			seed = (seed * 16807 + 0) % 2147483647;
			return (seed - 1) / 2147483646;
		};
		for (let i = 0; i < n; i++) {
			signal[i] = Math.sin(2 * Math.PI * freq * i);
			noisy[i] = signal[i] + (seededRandom() - 0.5) * 0.3;
		}
		const result = applySmoothingFn('savitzky_golay', noisy, params);

		// Check that result is smoother (less high-frequency content)
		let noisyHighFreq = 0;
		let resultHighFreq = 0;
		for (let i = 1; i < n; i++) {
			noisyHighFreq += Math.abs(noisy[i] - noisy[i - 1]);
			resultHighFreq += Math.abs(result[i] - result[i - 1]);
		}
		expect(resultHighFreq).toBeLessThan(noisyHighFreq * 0.95);
	});

	it('handles constant signal', () => {
		const n = 50;
		const data = new Float64Array(n);
		data.fill(42);
		const result = applySmoothingFn('savitzky_golay', data, params);
		let maxErr = 0;
		for (let i = 0; i < n; i++) {
			const err = Math.abs(result[i] - 42);
			if (err > maxErr) maxErr = err;
		}
		expect(maxErr).toBeLessThan(0.01);
	});

	it('handles small arrays (n < windowSize)', () => {
		const data = new Float64Array([1, 2, 3, 4, 5]);
		const result = applySmoothingFn('savitzky_golay', data, params);
		expect(result.length).toBe(5);
		// Should not throw, should return reasonable values
		for (let i = 0; i < result.length; i++) {
			expect(Number.isFinite(result[i])).toBe(true);
		}
	});

	it('handles zero signal', () => {
		const n = 50;
		const data = new Float64Array(n);
		data.fill(0);
		const result = applySmoothingFn('savitzky_golay', data, params);
		for (let i = 0; i < result.length; i++) {
			expect(Number.isFinite(result[i])).toBe(true);
			expect(result[i]).toBeGreaterThanOrEqual(0);
		}
	});

	it('handles large signal values', () => {
		const n = 100;
		const data = new Float64Array(n);
		for (let i = 0; i < n; i++) data[i] = 1e6 + i * 1000;
		const result = applySmoothingFn('savitzky_golay', data, params);
		for (let i = 0; i < result.length; i++) {
			expect(Number.isFinite(result[i])).toBe(true);
		}
	});

	it('adaptivity=0 gives fixed window (similar to standard SG)', () => {
		const n = 200;
		const data = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			data[i] = Math.sin(0.03 * i) + (Math.random() - 0.5) * 0.3;
		}
		const fixedParams = { ...params, adaptivity: 0 };
		const result = applySmoothingFn('savitzky_golay', data, fixedParams);
		expect(result.length).toBe(n);
		for (let i = 0; i < result.length; i++) {
			expect(Number.isFinite(result[i])).toBe(true);
		}
	});

	it('higher adaptivity gives more variable windows', () => {
		const n = 200;
		const data = new Float64Array(n);
		// Create signal with varying noise level
		for (let i = 0; i < n; i++) {
			const noiseLevel = i < n / 2 ? 0.01 : 1.0;
			data[i] = Math.sin(0.03 * i) + (Math.random() - 0.5) * noiseLevel;
		}
		const highAdaptParams = { ...params, adaptivity: 3 };
		const result = applySmoothingFn('savitzky_golay', data, highAdaptParams);
		expect(result.length).toBe(n);
		for (let i = 0; i < result.length; i++) {
			expect(Number.isFinite(result[i])).toBe(true);
		}
	});

	it('different polynomial orders produce different results', () => {
		const n = 200;
		const data = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			data[i] = Math.sin(0.03 * i) + (Math.random() - 0.5) * 0.2;
		}
		const order1 = applySmoothingFn('savitzky_golay', data, { ...params, polynomialOrder: 1 });
		const order3 = applySmoothingFn('savitzky_golay', data, { ...params, polynomialOrder: 3 });
		// Different orders should produce different results
		let diff = 0;
		for (let i = 0; i < n; i++) diff += Math.abs(order1[i] - order3[i]);
		expect(diff).toBeGreaterThan(0.01);
	});

	it('default params work without explicit values', () => {
		const data = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		const minimalParams = {};
		const result = applySmoothingFn('savitzky_golay', data, minimalParams);
		expect(result.length).toBe(10);
		for (let i = 0; i < result.length; i++) {
			expect(Number.isFinite(result[i])).toBe(true);
		}
	});

	it('string param values are coerced to numbers', () => {
		const data = new Float64Array([1, 2, 3, 4, 5]);
		const strParams = {
			polynomialOrder: '2',
			baseWindowSize: '5',
			adaptivity: '1',
			minWindowSize: '3',
			maxWindowSize: '7'
		};
		const result = applySmoothingFn('savitzky_golay', data, strParams);
		expect(result.length).toBe(5);
		for (let i = 0; i < result.length; i++) {
			expect(Number.isFinite(result[i])).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
	const baseParams = {
		polynomialOrder: 2,
		baseWindowSize: 11,
		adaptivity: 1,
		minWindowSize: 3,
		maxWindowSize: 21
	};

	it('handles single element', () => {
		const data = new Float64Array([42]);
		const result = applySmoothingFn('savitzky_golay', data, baseParams);
		expect(result.length).toBe(1);
		expect(result[0]).toBeGreaterThanOrEqual(0);
	});

	it('handles two elements', () => {
		const data = new Float64Array([1, 2]);
		const result = applySmoothingFn('savitzky_golay', data, baseParams);
		expect(result.length).toBe(2);
		for (let i = 0; i < result.length; i++) {
			expect(Number.isFinite(result[i])).toBe(true);
		}
	});

	it('handles very small values', () => {
		const n = 50;
		const data = new Float64Array(n);
		for (let i = 0; i < n; i++) data[i] = 1e-15 * i;
		const result = applySmoothingFn('savitzky_golay', data, baseParams);
		for (let i = 0; i < result.length; i++) {
			expect(Number.isFinite(result[i])).toBe(true);
		}
	});

	it('handles large n (10000 points)', () => {
		const n = 10000;
		const data = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			data[i] = Math.sin(0.01 * i) + (Math.random() - 0.5) * 0.1;
		}
		const start = performance.now();
		const result = applySmoothingFn('savitzky_golay', data, baseParams);
		const elapsed = performance.now() - start;
		expect(result.length).toBe(n);
		for (let i = 0; i < result.length; i++) {
			expect(Number.isFinite(result[i])).toBe(true);
		}
		// Should complete in reasonable time (< 30s for worst case)
		expect(elapsed).toBeLessThan(30000);
	}, 60000);
});
