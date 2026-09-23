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
		label: 'Экспоненциальное сглаживание (окно)',
		params: [
			{
				key: 'alpha',
				label: 'Коэффициент (α)',
				type: 'number',
				min: 0,
				max: 1,
				step: 0.01,
				default: 0.5,
				hint: '0 — копия сигнала, 1 — равномерное среднее по окну'
			},
			{
				key: 'windowSize',
				label: 'Размер окна',
				type: 'number',
				min: 1,
				max: 101,
				step: 2,
				default: 5,
				hint: 'Нечётное целое ≥ 1 (1 — без сглаживания)'
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
				key: 'eps',
				label: 'ε (масштаб arcsinh)',
				type: 'number',
				min: 0,
				step: 0.0001,
				default: 0.001,
				hint: 'Масштаб стабилизации дисперсии (меньше — сильнее сжатие малых сигналов)'
			},
			{
				key: 'H',
				label: 'H (центр привязки, м)',
				type: 'number',
				min: 0,
				step: 100,
				default: 4000,
				hint: 'Дальность, где привязка к молекулярному профилю начинает доминировать'
			},
			{
				key: 'L',
				label: 'L (ширина перехода, м)',
				type: 'number',
				min: 1,
				step: 50,
				default: 300,
				hint: 'Ширина переходной зоны сигмоиды: больше — мягче переход'
			},
			{
				key: 'lambda',
				label: 'λ (гладкость)',
				type: 'number',
				min: 0,
				step: 0.001,
				default: 1,
				hint: 'Коэффициент регуляризации 2-й производной: больше — глаже'
			},
			{
				key: 'mu',
				label: 'μ (сила привязки)',
				type: 'number',
				min: 0,
				step: 0.01,
				default: 1,
				hint: 'Вес привязки к молекулярному профилю в зоне q≈1'
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
 * Симметричное экспоненциальное сглаживание в скользящем окне.
 * Ядро: w_k = C · α^{|k|},  k ∈ [−r, r].
 * При α = 0 — тождественное преобразование, при α = 1 — равномерное среднее по окну.
 * На краях массива используется частичное окно с пересчётом нормировки.
 * @param {Float64Array} data
 * @param {number} alpha — коэффициент, 0 ≤ α ≤ 1
 * @param {number} windowSize — нечётное целое ≥ 1
 * @returns {Float64Array}
 */
function exponentialSmoothing(data, alpha, windowSize) {
	const n = data.length;
	if (n === 0) return new Float64Array(0);

	const a = Math.min(1, Math.max(0, alpha));
	const w = Math.max(1, Math.min(n, Math.floor(windowSize)));
	if (a <= 0 || w <= 1) {
		return new Float64Array(data);
	}

	const hw = Math.floor((w - 1) / 2);
	const result = new Float64Array(n);

	for (let i = 0; i < n; i++) {
		const start = Math.max(0, i - hw);
		const end = Math.min(n - 1, i + hw);

		let sum = 0;
		let wsum = 0;
		for (let j = start; j <= end; j++) {
			const wk = a < 1 ? Math.pow(a, Math.abs(j - i)) : 1;
			sum += wk * data[j];
			wsum += wk;
		}

		result[i] = sum / wsum;
	}

	return result;
}

/**
 * Применяет алгоритм сглаживания к входным данным.
 *
 * Для алгоритма `regularization` дополнительно требуется массив дальностей `r`
 * и опорный молекулярный профиль — передавайте их через `params.r` и `params.Smol`.
 *
 * @param {string} algorithmId
 * @param {Float64Array} data
 * @param {Record<string, number | string | Float64Array>} params
 * @returns {Float64Array}
 */
export function applySmoothingFn(algorithmId, data, params) {
	/** @type {any} */
	const p = params;
	switch (algorithmId) {
		case 'moving_average':
			return movingAverage(data, p.windowSize);
		case 'moving_median':
			return movingMedian(data, p.windowSize);
		case 'exponential': {
			const a = Number(p.alpha ?? 0.5);
			const w = Number(p.windowSize ?? 5);
			return exponentialSmoothing(data, a, w);
		}
		case 'savitzky_golay':
			return adaptiveSavitzkyGolay(data, p);
		case 'regularization':
			return regularizationSmooth(data, p);
		default:
			return new Float64Array(data);
	}
}

/**
 * Полный конвейер регуляризации Тихонова с обратным arcsinh-преобразованием:
 *   f = tikhonovMolecularSmooth(data, params) в шкале arcsinh,
 *   результат = inverseArsinh(f, eps) — та же шкала, что и data (S = r²·P).
 *
 * Единая точка вызова для {@link applySmoothingFn} (ветка 'regularization')
 * и `applyRegularizationToProfile` в processing.js, чтобы обработка ε и
 * обратного преобразования не расходилась между конвейерами.
 *
 * @param {Float64Array} data
 * @param {Record<string, number | string | Float64Array | ArrayLike<number>>} params
 * @returns {Float64Array}
 */
export function regularizationSmooth(data, params) {
	const f = tikhonovMolecularSmooth(data, /** @type {any} */ (params));
	const eps = Math.max(1e-30, Number(/** @type {any} */ (params).eps ?? 1e-3));
	return inverseArsinh(f, eps);
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
			w = bw * (1 + (k * Math.sqrt(localVar)) / Math.sqrt(globalVar));
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

// ---------------------------------------------------------------------------
// Tikhonov regularisation with smooth pull to molecular reference profile
// ---------------------------------------------------------------------------

/**
 * Применяет алгоритм Тихонова 2-го порядка с подтяжкой к молекулярному
 * (референсному) профилю через сигмоидально-взвешенный функционал:
 *
 *   Φ(f) = Σ (1 − qᵢ) wᵢ (fᵢ − yᵢ)²
 *        + λ · Σ (fᵢ₋₁ − 2fᵢ + fᵢ₊₁)²
 *        + μ · Σ qᵢ (fᵢ − yᵢᵐᵒˡ)²
 *
 * где
 *   yᵢ      = arcsinh(Sᵢ / ε)
 *   yᵢᵐᵒˡ   = arcsinh(Smolᵢ / ε)
 *   wᵢ      = Sᵢ                               (whitening-вес Пуассона)
 *   qᵢ      = 1 / (1 + exp(−(rᵢ − H) / L))     (мягкая привязка)
 *
 * Шаг 1. Стабилизация дисперсии: arcsinh с масштабом ε.
 * Шаг 2. Веса wᵢ = Sᵢ.
 * Шаг 3. Сигмоидный профиль привязки qᵢ на сетке дальностей r.
 * Шаг 4. Минимизация квадратичного SPD-функционала Φ(f) методом сопряжённых
 *         градиентов (CG, матрица собирается на лету через matvec).
 *
 * Граничные условия — естественные Неймана (отражение индексов), что
 * эквивалентно сплайн-сглаживанию Reinsch и не вносит краевых выбросов.
 *
 * @param {Float64Array} S — входной сигнал (S = r²·P), длина N.
 * @param {Record<string, number | Float64Array | ArrayLike<number>>} params
 *   - `eps`      — масштаб arcsinh (по умолчанию 1e-3).
 *   - `H`        — центр перехода (м), по умолчанию 4000.
 *   - `L`        — ширина перехода (м), по умолчанию 300.
 *   - `lambda`   — вес регуляризации 2-й производной, по умолчанию 1.
 *   - `mu`       — вес привязки к молекулярному профилю, по умолчанию 1.
 *   - `Smol`     — молекулярный профиль, длина N. Если не задан — привязки нет.
 *   - `r`        — дальности (м), длина N. Если не заданы — привязки нет.
 *   - `tol`      — относительная невязка CG, по умолчанию 1e-8.
 *   - `maxIter`  — макс. итераций CG, по умолчанию 2000.
 *
 * @returns {Float64Array} сглаженный профиль f в шкале arcsinh-стабилизированных
 *          значений. Для обратного преобразования используйте {@link inverseArsinh}.
 */
export function tikhonovMolecularSmooth(S, params) {
	const N = S ? S.length : 0;
	if (N < 3) {
		const src = S ? S : 0;
		return /** @type {Float64Array} */ (new Float64Array(/** @type {any} */ (src)));
	}

	/** @type {any} */
	const pr = params;

	// --- Параметры ----------------------------------------------------------
	const eps = Math.max(1e-30, Number(pr.eps ?? 1e-3));
	const H = Number(pr.H ?? 4000);
	const L = Math.max(1e-30, Number(pr.L ?? 300));
	const lambda = Math.max(0, Number(pr.lambda ?? 1));
	const mu = Math.max(0, Number(pr.mu ?? 1));
	const tol = Number(pr.tol ?? 1e-8);
	if (!Number.isFinite(tol) || tol < 0) {
		throw new TypeError(`tikhonovMolecularSmooth: tol (${tol}) должно быть конечным числом ≥ 0`);
	}
	const maxIter = Math.max(1, (pr.maxIter | 0) || 2000);

	/** @type {Float64Array | undefined} */
	const Smol = pr.Smol instanceof Float64Array
		? pr.Smol
		: pr.Smol
			? Float64Array.from(/** @type {any} */ (pr.Smol))
			: undefined;
	/** @type {Float64Array | undefined} */
	const r = pr.r instanceof Float64Array
		? pr.r
		: pr.r
			? Float64Array.from(/** @type {any} */ (pr.r))
			: undefined;

	// --- Шаг 1. Стабилизация дисперсии (arcsinh) ----------------------------
	// Предварительно проверяем конечность входов: одиночный NaN/Infinity
	// сделал бы y,w,a нечисловыми, обошёл бы sumDiag-guard и заставил CG
	// гонять все maxIter итераций на отравленных данных.
	for (let i = 0; i < N; i++) {
		if (!Number.isFinite(S[i])) {
			throw new TypeError(`tikhonovMolecularSmooth: S[${i}] non-finite (${S[i]})`);
		}
		if (Smol && !Number.isFinite(Smol[i] ?? 0)) {
			throw new TypeError(`tikhonovMolecularSmooth: Smol[${i}] non-finite (${Smol[i]})`);
		}
	}

	const y = new Float64Array(N);
	const ymol = new Float64Array(N);
	for (let i = 0; i < N; i++) {
		y[i] = arcsinhOverEps(S[i], eps);
		ymol[i] = Smol ? arcsinhOverEps(Smol[i] ?? 0, eps) : 0;
	}

	// --- Шаг 2. Веса Пуассона-Уайтинга --------------------------------------
	const w = new Float64Array(N);
	for (let i = 0; i < N; i++) {
		w[i] = Math.max(0, S[i]);
	}

	// --- Шаг 3. Сигмоидальный профиль привязки -----------------------------
	// q[i] = 1 / (1 + exp(-(r_i - H) / L)).
	// Если r или Smol не заданы — привязки нет: q ≡ 0.
	const q = new Float64Array(N);
	if (mu > 0 && Smol && r) {
		for (let i = 0; i < N; i++) {
			q[i] = sigmoid((r[i] - H) / L);
		}
	}

	// Диагональные веса SPD-матрицы:
	//   a_i = (1 − q_i) w_i   (привязка к данным)
	//   c_i = μ q_i           (привязка к молекулярному профилю)
	const a = new Float64Array(N);
	const c = new Float64Array(N);
	let sumDiag = 0;
	for (let i = 0; i < N; i++) {
		a[i] = (1 - q[i]) * w[i];
		c[i] = mu * q[i];
		sumDiag += a[i] + c[i];
	}
	if (sumDiag === 0 && lambda === 0) {
		return y;
	}

	// --- Шаг 4. CG-минимизация Φ(f) ----------------------------------------
	// Φ квадратичный, SPD. Стартуем с f⁰ = (1 − q)·y + q·ymol.
	const f = new Float64Array(N);
	for (let i = 0; i < N; i++) {
		f[i] = (1 - q[i]) * y[i] + q[i] * ymol[i];
	}

	// Градиент Φ при текущем f: g_i = ∂Φ/∂f_i.
	const g = new Float64Array(N);
	// Scratch-буферы переиспользуются между итерациями/CG-шагами,
	// чтобы не аллоцировать N-вектор на каждую итерацию (GC-нагрузка).
	const scratchU = new Float64Array(N);
	const scratchD = new Float64Array(N);
	fillGradient(g, f, y, ymol, a, c, lambda, N, scratchU);

	// Правая часть нормальных уравнений:
	//   b_i = a_i·y_i + c_i·ymol_i
	// Невязка e = b − A f = −g.
	const e = new Float64Array(N);
	for (let i = 0; i < N; i++) e[i] = -g[i];
	const p = new Float64Array(e);
	let gamma = dot(e, e);
	const gamma0 = gamma;
	if (gamma === 0) return f;

	const Ap = new Float64Array(N);
	let k = 0;
	for (; k < maxIter; k++) {
		applyHessian(p, Ap, a, c, lambda, N, scratchD);
		const pAp = dot(p, Ap);
		if (pAp <= 0) break;
		const alpha = gamma / pAp;
		for (let i = 0; i < N; i++) {
			f[i] += alpha * p[i];
			e[i] -= alpha * Ap[i];
		}
		const gammaNext = dot(e, e);
		if (gammaNext <= tol * tol * gamma0) break;
		const beta = gammaNext / gamma;
		for (let i = 0; i < N; i++) {
			p[i] = e[i] + beta * p[i];
		}
		gamma = gammaNext;
	}

	return f;
}

/**
 * Обратное преобразование arcsinh: S = sinh(f) · ε.
 * Используйте, чтобы вернуть f из {@link tikhonovMolecularSmooth}
 * в шкалу исходных значений S = r²·P.
 *
 * @param {Float64Array} f
 * @param {number} eps
 * @returns {Float64Array}
 */
export function inverseArsinh(f, eps) {
	const N = f.length;
	const out = new Float64Array(N);
	// sin(700)x ≈ 0.5·e^700 ≈ 7e303 — в пределах double (mac-лимит ~1.8e308).
	// Клэмп в 50 обрезал легитимные большие значения f (достижимы при огромном S/ε).
	const MAX_SINH_INPUT = 700;
	for (let i = 0; i < N; i++) {
		const s = Math.max(-MAX_SINH_INPUT, Math.min(MAX_SINH_INPUT, f[i]));
		if (s > 20) out[i] = 0.5 * Math.exp(s) * eps;
		else if (s < -20) out[i] = -0.5 * Math.exp(-s) * eps;
		else out[i] = 0.5 * (Math.exp(s) - Math.exp(-s)) * eps;
	}
	return out;
}

/** arcsinh(x / ε) — стабилизация дисперсии Пуассоновского лидара. */
/** @param {number} v @param {number} eps */
function arcsinhOverEps(v, eps) {
	return Math.asinh(v / eps);
}

/** Логистическая сигмоида, численно устойчивая. */
/** @param {number} t */
function sigmoid(t) {
	if (t >= 0) {
		const z = Math.exp(-t);
		return 1 / (1 + z);
	}
	const z = Math.exp(t);
	return z / (1 + z);
}

/** Скалярное произведение двух векторов равной длины. */
/** @param {Float64Array} av @param {Float64Array} bv */
function dot(av, bv) {
	let s = 0;
	for (let i = 0; i < av.length; i++) s += av[i] * bv[i];
	return s;
}

/**
 * Заполняет вектор градиента g[i] = ∂Φ/∂f_i в точке f.
 *
 *   ∂Φ/∂f_i = 2 a_i (f_i − y_i) + 2 c_i (f_i − ymol_i)
 *            + 2λ · (D2ᵀ D2 f)_i
 *
 * Neumann BC реализованы через отражение индексов на границах.
 *
 * @param {Float64Array} g
 * @param {Float64Array} f
 * @param {Float64Array} y
 * @param {Float64Array} ymol
 * @param {Float64Array} a
 * @param {Float64Array} c
 * @param {number}      lambda
 * @param {number}      N
 * @param {Float64Array} u — scratch-буфер длины N, переиспользуется между вызовами
 */
function fillGradient(g, f, y, ymol, a, c, lambda, N, u) {
	for (let i = 0; i < N; i++) {
		g[i] = 2 * a[i] * (f[i] - y[i]) + 2 * c[i] * (f[i] - ymol[i]);
	}
	if (lambda <= 0) return;

	for (let i = 0; i < N; i++) {
		const ip = i + 1 < N ? i + 1 : i;
		const im = i - 1 >= 0 ? i - 1 : i;
		u[i] = f[im] - 2 * f[i] + f[ip];
	}
	for (let i = 0; i < N; i++) {
		const ip = i + 1 < N ? i + 1 : i;
		const im = i - 1 >= 0 ? i - 1 : i;
		g[i] += 2 * lambda * (u[im] - 2 * u[i] + u[ip]);
	}
}

/**
 * Умножает SPD-оператор Гессиана Φ на p и записывает в q.
 * Neumann BC — через отражение индексов.
 *
 * @param {Float64Array} p
 * @param {Float64Array} q
 * @param {Float64Array} a
 * @param {Float64Array} c
 * @param {number}      lambda
 * @param {number}      N
 * @param {Float64Array} d — scratch-буфер длины N, переиспользуется между итерациями
 */
function applyHessian(p, q, a, c, lambda, N, d) {
	for (let i = 0; i < N; i++) {
		q[i] = (a[i] + c[i]) * p[i];
	}
	if (lambda <= 0) return;

	for (let i = 0; i < N; i++) {
		const ip = i + 1 < N ? i + 1 : i;
		const im = i - 1 >= 0 ? i - 1 : i;
		d[i] = p[im] - 2 * p[i] + p[ip];
	}
	for (let i = 0; i < N; i++) {
		const ip = i + 1 < N ? i + 1 : i;
		const im = i - 1 >= 0 ? i - 1 : i;
		q[i] += lambda * (d[im] - 2 * d[i] + d[ip]);
	}
}
