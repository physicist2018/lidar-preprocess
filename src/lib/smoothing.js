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
				hint: 'Степень полинома: 1–5'
			},
			{
				key: 'windowSize',
				label: 'Размер окна',
				type: 'number',
				min: 3,
				max: 101,
				step: 2,
				default: 11,
				hint: 'Нечётное целое число от 3 до 101'
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
		default:
			return new Float64Array(data);
	}
}
