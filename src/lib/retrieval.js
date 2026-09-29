// ---------------------------------------------------------------------------
// Retrieval algorithms ("расчёт параметров аэрозоля")
// ---------------------------------------------------------------------------

/**
 * @typedef {{ key: string, label: string, min?: number, max?: number, step?: number, default?: number }} ParamDef
 */

/**
 * @typedef {{ id: string, label: string, requiresMolecular: boolean, allowedWavelengths?: number[], allowedPolarizations?: string[], params: ParamDef[] }} AlgorithmDef
 */

/** @type {AlgorithmDef[]} */
export const RETRIEVAL_ALGORITHMS = [
	{
		id: 'klett',
		label: 'Расчёт по Клету',
		requiresMolecular: true,
		allowedWavelengths: [355, 532, 1064],
		allowedPolarizations: ['P', 'O'],
		params: [
			{
				key: 'refHeight',
				label: 'Референсная высота (м)',
				min: 0,
				max: 30000,
				step: 10,
				default: 2000
			},
			{
				key: 'refScatteringRatio',
				label: 'R(z_ref) = β_a/β_m',
				min: 0,
				max: 100,
				step: 0.01,
				default: 1
			},
			{
				key: 'lidarRatio',
				label: 'Лидарное отношение (ср)',
				min: 0,
				max: 100,
				step: 0.1,
				default: 40
			}
		]
	},
	{
		id: 'ansmann',
		label: 'Расчёт по Ансману',
		requiresMolecular: false,
		params: []
	},
	{
		id: 'klett-ansmann',
		label: 'Клет+Ансман',
		requiresMolecular: false,
		params: []
	},
	{
		id: 'depolarization-total',
		label: 'Деполяризация (суммарная)',
		requiresMolecular: false,
		params: []
	},
	{
		id: 'depolarization-aerosol',
		label: 'Деполяризация (аэрозольная)',
		requiresMolecular: false,
		params: []
	}
];

/**
 * @param {string} id
 * @returns {AlgorithmDef | undefined}
 */
export function getAlgorithm(id) {
	return RETRIEVAL_ALGORITHMS.find((a) => a.id === id);
}
