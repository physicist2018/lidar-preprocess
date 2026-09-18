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
 * Stub: returns a shallow copy of the input data.
 * Replace with real algorithms later.
 * @param {string} algorithmId
 * @param {Float64Array} data
 * @param {Record<string, number | string>} params
 * @returns {Float64Array}
 */
export function applySmoothingFn(algorithmId, data, params) {
	// TODO: implement real smoothing algorithms
	return new Float64Array(data);
}
