// ---------------------------------------------------------------------------
// Smoothing algorithms (stub implementations)
// ---------------------------------------------------------------------------

/** @typedef {{ id: string, label: string, params: Array<{ key: string, label: string, type: 'number', min?: number, max?: number, step?: number, default: number | string, hint?: string }> }} SmoothingAlgorithm */

/** @type {SmoothingAlgorithm[]} */
export const SMOOTHING_ALGORITHMS = [
	{
		id: 'moving_average',
		label: 'Скользящее среднее',
		params: [
			{
				key: 'windowSize',
				label: 'Размер окна',
				type: 'number',
				min: 3,
				max: 101,
				step: 2,
				default: 5,
				hint: 'Нечётное целое число от 3 до 101'
			}
		]
	},
	{
		id: 'exponential',
		label: 'Экспоненциальное сглаживание',
		params: [
			{
				key: 'alpha',
				label: 'Коэффициент (α)',
				type: 'number',
				min: 0,
				max: 1,
				step: 0.01,
				default: 0.3,
				hint: 'Число от 0 до 1: ближе к 0 — сильнее сглаживание'
			}
		]
	},
	{
		id: 'savitzky_golay',
		label: 'Савицкий-Голле (адаптивное окно)',
		params: [
			{
				key: 'polynomialOrder',
				label: 'Порядок полинома',
				type: 'number',
				min: 1,
				max: 5,
				step: 1,
				default: 2,
				hint: 'Степень полинома: 1–5 (должен быть меньше мин. размера окна)'
			},
			{
				key: 'baseWindowSize',
				label: 'Базовый размер окна',
				type: 'number',
				min: 3,
				max: 101,
				step: 2,
				default: 11,
				hint: 'Нечётное целое число от 3 до 101'
			},
			{
				key: 'adaptivity',
				label: 'Адаптивность (k)',
				type: 'number',
				min: 0,
				max: 5,
				step: 0.1,
				default: 1,
				hint: 'Насколько сильно окно реагирует на дисперсию: 0 = фиксированное, 1 = линейная адаптация'
			},
			{
				key: 'minWindowSize',
				label: 'Мин. размер окна',
				type: 'number',
				min: 1,
				max: 51,
				step: 2,
				default: 3,
				hint: 'Минимальное окно (нечётное)'
			},
			{
				key: 'maxWindowSize',
				label: 'Макс. размер окна',
				type: 'number',
				min: 3,
				max: 1001,
				step: 2,
				default: 21,
				hint: 'Максимальное окно (нечётное, ≥ мин.)'
			}
		]
	},
	{
		id: 'regularization',
		label: 'Регуляризация с подтяжкой',
		params: [
			{
				key: 'lambda',
				label: 'λ (гладкость)',
				type: 'number',
				min: 0,
				step: 0.001,
				default: 1,
				hint: 'Коэффициент гладкости: больше — глаже'
			},
			{
				key: 'pullStrength',
				label: 'Сила подтяжки (β)',
				type: 'number',
				min: 0,
				max: 1,
				step: 0.01,
				default: 0.1,
				hint: 'Насколько сигнал тянет к исходному: 0–1'
			}
		]
	},
	{
		id: 'moving_median',
		label: 'Скользящая медиана',
		params: [
			{
				key: 'windowSize',
				label: 'Размер окна',
				type: 'number',
				min: 3,
				max: 101,
				step: 2,
				default: 5,
				hint: 'Нечётное целое число от 3 до 101'
			}
		]
	}
];

/**
 * Get algorithm definition by id.
 * @param {string} id
 * @returns {SmoothingAlgorithm}
 */
export function getAlgorithm(id) {
	return SMOOTHING_ALGORITHMS.find((a) => a.id === id) ?? SMOOTHING_ALGORITHMS[0];
}

/**
 * Сглаживание скользящим средним.
 * На краях массива используется частичное окно.
 * @param {Float64Array} data
 * @param {number} windowSize — нечётное, >= 3
 * @returns {Float64Array}
 */
function movingAverage(data, windowSize) {
	const n = data.length;
	if (n === 0) return new Float64Array(0);

	const hw = Math.floor(windowSize / 2);
	const result = new Float64Array(n);

	for (let i = 0; i < n; i++) {
		const start = Math.max(0, i - hw);
		const end = Math.min(n - 1, i + hw);

		let sum = 0;
		for (let j = start; j <= end; j++) {
			sum += data[j];
		}
		result[i] = sum / (end - start + 1);
	}

	return result;
}

/**
 * Скользящая медиана.
 * На краях массива используется частичное окно.
 * @param {Float64Array} data
 * @param {number} windowSize — нечётное, >= 3
 * @returns {Float64Array}
 */
function movingMedian(data, windowSize) {
	const n = data.length;
	if (n === 0) return new Float64Array(0);

	const hw = Math.floor(windowSize / 2);
	const result = new Float64Array(n);
	const buffer = new Float64Array(windowSize);

	for (let i = 0; i < n; i++) {
		const start = Math.max(0, i - hw);
		const end = Math.min(n - 1, i + hw);

		let len = 0;
		for (let j = start; j <= end; j++) {
			buffer[len++] = data[j];
		}

		buffer.sort((a, b) => a - b);

		const mid = Math.floor(len / 2);
		result[i] = len % 2 === 1 ? buffer[mid] : (buffer[mid - 1] + buffer[mid]) / 2;
	}

	return result;
}

/**
 * Применяет алгоритм сглаживания к входным данным.
 * @param {string} algorithmId
 * @param {Float64Array} data
 * @param {Record<string, number | string>} params
 * @returns {Float64Array}
 */
export function applySmoothingFn(algorithmId, data, params) {
	switch (algorithmId) {
		case 'moving_average':
			return movingAverage(data, params.windowSize);
		case 'moving_median':
			return movingMedian(data, params.windowSize);
		case 'savitzky_golay':
			return adaptiveSavitzkyGolay(data, params);
		default:
			return new Float64Array(data);
	}
}

// ---------------------------------------------------------------------------
// Adaptive Savitzky-Golay with variance stabilization
// ---------------------------------------------------------------------------

/**
 * Solve least-squares polynomial fit for a single window.
 * Fits polynomial of given `order` to data segment y[start..end],
 * and returns the fitted value at `center` (typically the midpoint).
 *
 * @param {Float64Array} y — input data
 * @param {number} start — inclusive start index
 * @param {number} end — inclusive end index
 * @param {number} center — center index where to evaluate
 * @param {number} order — polynomial degree
 * @returns {number} fitted value at center
 */
function solveSavitzkyGolay(y, start, end, center, order) {
	const n = end - start + 1;
	if (n <= 0) return y[center];
	if (n <= order) {
		// Degenerate: return mean
		let sum = 0;
		for (let i = start; i <= end; i++) sum += y[i];
		return sum / n;
	}

	// Build normal equations: (XᵀX)⁻¹ Xᵀ y
	// X[i][j] = (x_i - center)^j, where x_i = start + i
	// The fitted value at center is simply the constant term (all (x-center)^k = 0 for k≥1).
	// We solve (XᵀX) β = Xᵀy and return β[0].

	const m = order + 1; // number of coefficients
	/** @type {Float64Array} */
	const XtX = new Float64Array(m * m);
	/** @type {Float64Array} */
	const Xty = new Float64Array(m);

	for (let i = start; i <= end; i++) {
		const dx = i - center;
		/** @type {Float64Array} */
		const powers = new Float64Array(m);
		powers[0] = 1;
		for (let k = 1; k < m; k++) powers[k] = powers[k - 1] * dx;

		const yi = y[i];
		for (let j = 0; j < m; j++) {
			Xty[j] += powers[j] * yi;
			for (let l = 0; l < m; l++) {
				XtX[j * m + l] += powers[j] * powers[l];
			}
		}
	}

	// Solve XtX β = Xty via Gaussian elimination with partial pivoting
	// Augmented matrix [XtX | Xty]
	/** @type {Float64Array} */
	const aug = new Float64Array(m * (m + 1));
	for (let j = 0; j < m; j++) {
		for (let l = 0; l < m; l++) {
			aug[j * (m + 1) + l] = XtX[j * m + l];
		}
		aug[j * (m + 1) + m] = Xty[j];
	}

	// Forward elimination with partial pivoting
	for (let col = 0; col < m; col++) {
		// Find pivot
		let maxVal = Math.abs(aug[col * (m + 1) + col]);
		let maxRow = col;
		for (let row = col + 1; row < m; row++) {
			const val = Math.abs(aug[row * (m + 1) + col]);
			if (val > maxVal) {
				maxVal = val;
				maxRow = row;
			}
		}
		// Swap rows
		if (maxRow !== col) {
			const tmp = aug.subarray(col * (m + 1), (col + 1) * (m + 1));
			for (let k = 0; k <= m; k++) {
				aug[col * (m + 1) + k] = aug[maxRow * (m + 1) + k];
				aug[maxRow * (m + 1) + k] = tmp[k];
			}
		}

		const pivot = aug[col * (m + 1) + col];
		if (Math.abs(pivot) < 1e-15) continue; // singular, skip

		// Eliminate below
		for (let row = col + 1; row < m; row++) {
			const factor = aug[row * (m + 1) + col] / pivot;
			for (let k = col; k <= m; k++) {
				aug[row * (m + 1) + k] -= factor * aug[col * (m + 1) + k];
			}
		}
	}

	// Back substitution
	/** @type {Float64Array} */
	const beta = new Float64Array(m);
	for (let row = m - 1; row >= 0; row--) {
		let sum = aug[row * (m + 1) + m];
		for (let col = row + 1; col < m; col++) {
			sum -= aug[row * (m + 1) + col] * beta[col];
		}
		const pivot = aug[row * (m + 1) + row];
		beta[row] = Math.abs(pivot) > 1e-15 ? sum / pivot : 0;
	}

	// Fitted value at center = β[0] (all (x-center)^k = 0 for k ≥ 1)
	const val = beta[0];
	return Number.isFinite(val) ? val : y[center];
}

/**
 * Compute adaptive window sizes for each point.
 * Window size is proportional to local standard deviation of y.
 *
 * @param {Float64Array} y — stabilized data
 * @param {number} baseWindow — base window size (will be made odd)
 * @param {number} k — adaptivity coefficient
 * @param {number} minWindow — minimum window size
 * @param {number} maxWindow — maximum window size
 * @returns {Float64Array} — adaptive window sizes (odd integers)
 */
function computeAdaptiveWindows(y, baseWindow, k, minWindow, maxWindow) {
	const n = y.length;
	const hw = Math.floor(baseWindow / 2);

	// Clamp baseWindow to be odd and within [3, n]
	let bw = Math.max(3, Math.min(n, baseWindow));
	if (bw % 2 === 0) bw -= 1;
	const bhw = Math.floor(bw / 2);

	// Compute global variance
	let globalMean = 0;
	for (let i = 0; i < n; i++) globalMean += y[i];
	globalMean /= n;
	let globalVar = 0;
	for (let i = 0; i < n; i++) {
		const d = y[i] - globalMean;
		globalVar += d * d;
	}
	globalVar /= n;

	// Compute adaptive windows
	const windows = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		const start = Math.max(0, i - bhw);
		const end = Math.min(n - 1, i + bhw);
		const wlen = end - start + 1;

		// Local mean and variance
		let localMean = 0;
		for (let j = start; j <= end; j++) localMean += y[j];
		localMean /= wlen;
		let localVar = 0;
		for (let j = start; j <= end; j++) {
			const d = y[j] - localMean;
			localVar += d * d;
		}
		localVar /= wlen;

		// Adaptive window size
		let w;
		if (globalVar > 1e-15) {
			w = bw * (1 + k * Math.sqrt(localVar) / Math.sqrt(globalVar));
		} else {
			w = bw; // uniform data → fixed window
		}

		// Clamp and make odd
		w = Math.max(minWindow, Math.min(maxWindow, w));
		w = Math.max(1, Math.floor(w));
		if (w % 2 === 0) w -= 1;
		windows[i] = w;
	}

	return windows;
}

/**
 * Apply Savitzky-Golay smoothing with per-point adaptive window sizes.
 *
 * @param {Float64Array} y — stabilized data
 * @param {number} order — polynomial order
 * @param {Float64Array} windows — adaptive window sizes per point
 * @returns {Float64Array} smoothed data
 */
function applyAdaptiveWindowSavitzkyGolay(y, order, windows) {
	const n = y.length;
	if (n === 0) return new Float64Array(0);

	const result = new Float64Array(n);

	for (let i = 0; i < n; i++) {
		const w = Math.max(1, Math.round(windows[i]));
		const hw = Math.floor(w / 2);
		const start = Math.max(0, i - hw);
		const end = Math.min(n - 1, i + hw);

		result[i] = solveSavitzkyGolay(y, start, end, i, order);
	}

	return result;
}

/**
 * Full adaptive Savitzky-Golay pipeline:
 * 1. Variance stabilization via arcsinh transform
 * 2. Adaptive window Savitzky-Golay smoothing
 * 3. Inverse transform
 *
 * @param {Float64Array} data — raw signal
 * @param {Record<string, number | string>} params
 * @returns {Float64Array}
 */
function adaptiveSavitzkyGolay(data, params) {
	const n = data.length;
	if (n === 0) return new Float64Array(0);

	// Parse parameters
	const order = Math.max(1, Math.min(5, Math.floor(params.polynomialOrder ?? 2)));
	let baseWindow = Math.max(3, Math.min(n, Math.floor(params.baseWindowSize ?? 11)));
	const k = Math.max(0, params.adaptivity ?? 1);
	let minWindow = Math.max(1, Math.floor(params.minWindowSize ?? 3));
	let maxWindow = Math.max(3, Math.min(n, Math.floor(params.maxWindowSize ?? 21)));

	// Ensure odd values
	if (baseWindow % 2 === 0) baseWindow -= 1;
	if (minWindow % 2 === 0) minWindow -= 1;
	if (maxWindow % 2 === 0) maxWindow -= 1;

	// Ensure minWindow <= maxWindow
	if (minWindow > maxWindow) minWindow = maxWindow;

	// Ensure order < minWindow
	if (order >= minWindow) minWindow = order + (order % 2 === 0 ? 1 : 2);
	if (minWindow > maxWindow) minWindow = maxWindow;

	// Clamp baseWindow
	if (baseWindow < minWindow) baseWindow = minWindow;
	if (baseWindow > maxWindow) baseWindow = maxWindow;

	// Step 1: Variance stabilization
	// y = arcsinh(S / ε), where S = |data|
	// ε is a small regularisation constant to avoid division by zero.
	// We scale it to the data magnitude for better numerical behaviour.
	let minAbs = Infinity;
	let maxAbs = 0;
	for (let i = 0; i < n; i++) {
		const a = Math.abs(data[i]);
		if (a < minAbs) minAbs = a;
		if (a > maxAbs) maxAbs = a;
	}
	const eps = Math.max(1e-10, minAbs * 0.01);
	const stabilized = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		stabilized[i] = Math.asinh(Math.abs(data[i]) / eps);
	}

	// Step 2: Adaptive window SG smoothing
	const windows = computeAdaptiveWindows(stabilized, baseWindow, k, minWindow, maxWindow);
	const smoothed = applyAdaptiveWindowSavitzkyGolay(stabilized, order, windows);

	// Step 3: Inverse transform
	// result = sinh(smoothed) * eps
	// sinh(x) = (exp(x) - exp(-x)) / 2
	const result = new Float64Array(n);
	// Clamp to prevent sinh overflow (Math.exp(710) is the limit)
	const MAX_SINH_INPUT = 50;
	for (let i = 0; i < n; i++) {
		const s = Math.max(-MAX_SINH_INPUT, Math.min(MAX_SINH_INPUT, smoothed[i]));
		if (s > 20) {
			result[i] = 0.5 * Math.exp(s) * eps;
		} else if (s < -20) {
			result[i] = -0.5 * Math.exp(-s) * eps;
		} else {
			result[i] = 0.5 * (Math.exp(s) - Math.exp(-s)) * eps;
		}
	}

	return result;
}
