import { get } from 'svelte/store';
import { licelFiles, zenithAngle } from './store';
import { isProfileUsable, profileKey, profileLabel, collectDistinctChannels } from '$lib/channels';

/** Value transforms available for unfold ("развертка") windows. */
export const UNFOLD_TRANSFORMS = [
	{ id: 'P', label: 'Исходный сигнал P', short: 'P' },
	{ id: 'Pr2', label: 'P·r²', short: 'P·r²' },
	{ id: 'symlogP', label: 'symlog(P)', short: 'symlog(P)' },
	{ id: 'symlogPr2', label: 'symlog(P·r²)', short: 'symlog(P·r²)' },
	{ id: 'asinhP', label: 'asinh(P/ε)', short: 'asinh(P/ε)' },
	{ id: 'asinhPr2', label: 'asinh(P·r²/ε)', short: 'asinh(P·r²/ε)' },
	{ id: 'SR', label: 'Ослабленное отношение рассеяния', short: 'P/P_мол' }
];

/** Scale factor for the asinh transforms: ε = 1e-6 in P/ε and P·r²/ε. */
const UNFOLD_ASINH_EPS = 1e-6;

/** Maximum heatmap grid resolution; larger inputs are uniformly decimated. */
const UNFOLD_MAX_ROWS = 2500;
const UNFOLD_MAX_COLS = 2500;

/** Number of finite matrix values used to estimate the 5–95 % color range. */
const UNFOLD_RANGE_SAMPLES = 200000;

/**
 * Signed logarithm: sign(x)·log10(1+|x|). Continuous at zero, behaves like
 * log10 for large |x| and is defined for negative values.
 * @param {number} x
 */
function symlogValue(x) {
	return Math.sign(x) * Math.log10(1 + Math.abs(x));
}

/** @param {string} id */
export function unfoldTransformById(id) {
	return UNFOLD_TRANSFORMS.find((t) => t.id === id) ?? UNFOLD_TRANSFORMS[0];
}

/**
 * List distinct channels present in the given files, each with the number of
 * files that contain it. Labels and pairing follow the graph window convention.
 * @param {number[]} fileIds
 * @returns {Array<{ key: string, label: string, fileCount: number, molecularCount: number, wavelength: number, deviceID: string, polarization: string }>}
 */
export function listUnfoldChannels(fileIds) {
	return collectDistinctChannels(get(licelFiles), fileIds).get('all') ?? [];
}

/**
 * Collect one candidate profile per file (the first matching the channel key),
 * treated as a time column: measurement start time + profile.
 * @param {Map<number, any>} data
 * @param {number[]} fileIds
 * @param {string} channelKey
 * @returns {Array<{ time: Date, profile: any }>}
 */
function collectChannelMeasurements(data, fileIds, channelKey) {
	const measurements = [];
	for (const id of fileIds) {
		const lf = data.get(id);
		if (!lf) continue;
		const profile = (lf.profiles ?? []).find(
			/** @param {any} p */
			(p) => isProfileUsable(p) && profileKey(p) === channelKey
		);
		if (profile) measurements.push({ time: lf.measurementStartTime, profile });
	}
	return measurements;
}

/**
 * Verify all measurements share the same positive bin width.
 * @param {Array<{ time: Date, profile: any }>} measurements
 * @returns {{ binWidth: number } | { error: string }}
 */
function resolveCommonBinWidth(measurements) {
	const first = measurements[0].profile.binWidth;
	for (const m of measurements) {
		const width = m.profile.binWidth;
		if (!(width > 0)) return { error: 'Канал имеет некорректную ширину бина.' };
		if (Math.abs(width - first) > 1e-9 * first) {
			return { error: 'Ширина бина канала отличается между выбранными файлами.' };
		}
	}
	return { binWidth: first };
}

/**
 * Evenly-spaced indices in [0, length), stepping so at most `max` are produced.
 * @param {number} length
 * @param {number} max
 * @returns {{ indices: number[], downsampled: boolean }}
 */
function decimateIndices(length, max) {
	const step = Math.max(1, Math.ceil(length / max));
	const indices = [];
	for (let i = 0; i < length; i += step) indices.push(i);
	return { indices, downsampled: step > 1 };
}

/**
 * Map a channel value to its display value for the given transform.
 * @param {number} v
 * @param {string} transform
 * @param {number} distance meters of the bin center
 */
function applyUnfoldTransform(v, transform, distance) {
	if (transform === 'Pr2') return v * distance * distance;
	if (transform === 'symlogP') return symlogValue(v);
	if (transform === 'symlogPr2') return symlogValue(v * distance * distance);
	if (transform === 'asinhP') return Math.asinh(v / UNFOLD_ASINH_EPS);
	if (transform === 'asinhPr2')
		return Math.asinh((v * distance * distance) / UNFOLD_ASINH_EPS);
	return v;
}

/**
 * Build the heatmap matrix: rows are height bins, columns are files.
 * For the scattering ratio ('SR') transform each cell is the ratio of the
 * measured signal to the stored pure molecular profile of the same file
 * (element-wise over bin index); missing or non-finite molecular values
 * produce NaN cells that are excluded from the color range.
 * @param {Array<{ time: Date, profile: any }>} measurements
 * @param {number[]} rowIndices
 * @param {number[]} colIndices
 * @param {number} binWidth
 * @param {string} transform
 * @param {number} zFactor cos(zenith angle) applied to the height axis
 * @returns {{ y: number[], z: Float64Array[] }}
 */
function computeUnfoldMatrix(measurements, rowIndices, colIndices, binWidth, transform, zFactor) {
	const cols = measurements.map((m) => m.profile.data);
	const isRatio = transform === 'SR';
	const molecular = isRatio
		? measurements.map((m) => (m.profile.molecular && m.profile.molecular.data) || null)
		: null;
	const y = new Array(rowIndices.length);
	const z = new Array(rowIndices.length);
	for (let r = 0; r < rowIndices.length; r++) {
		const j = rowIndices[r];
		y[r] = j * binWidth * zFactor;
		const distance = (j + 0.5) * binWidth;
		const row = new Float64Array(colIndices.length);
		for (let c = 0; c < colIndices.length; c++) {
			if (isRatio) {
				const mol = molecular ? molecular[colIndices[c]] : null;
				const denom = mol && j < mol.length ? mol[j] : NaN;
				const num = cols[colIndices[c]][j];
				row[c] = denom > 0 && Number.isFinite(num) ? num / denom : NaN;
			} else {
				row[c] = applyUnfoldTransform(cols[colIndices[c]][j], transform, distance);
			}
		}
		z[r] = row;
	}
	return { y, z };
}

/**
 * Sample a large value list down to at most UNFOLD_RANGE_SAMPLES entries.
 * @param {number[]} values
 * @returns {Float64Array}
 */
function sampleFiniteValues(values) {
	if (values.length <= UNFOLD_RANGE_SAMPLES) return Float64Array.from(values);
	const step = Math.ceil(values.length / UNFOLD_RANGE_SAMPLES);
	const sampled = new Float64Array(UNFOLD_RANGE_SAMPLES);
	let idx = 0;
	for (let i = 0; i < values.length && idx < UNFOLD_RANGE_SAMPLES; i += step) {
		sampled[idx++] = values[i];
	}
	return sampled.subarray(0, idx);
}

/**
 * Estimate the 5th–95th percentile range of the finite matrix values, or nulls
 * when there are too few points to be meaningful.
 * @param {Float64Array[]} z
 * @returns {{ zMin: number | null, zMax: number | null }}
 */
function estimatePercentileBounds(z) {
	const finite = [];
	for (const row of z) {
		for (const v of row) {
			if (Number.isFinite(v)) finite.push(v);
		}
	}
	if (finite.length < 2) return { zMin: null, zMax: null };

	const sample = sampleFiniteValues(finite);
	sample.sort();
	const p5 = sample[Math.floor(sample.length * 0.05)];
	const p95 = sample[Math.floor(sample.length * 0.95)];
	if (!(p95 > p5)) return { zMin: null, zMax: null };
	return { zMin: p5, zMax: p95 };
}

/**
 * Compute heatmap data for one channel across the given files. Files are
 * treated as time columns sorted by their measurement start time; rows are
 * bins spaced by the channel bin width (distance in meters). Returns the
 * matrix plus axes, or an object with an `error` message when the data cannot
 * be assembled (missing channel, mismatched bin widths, no data).
 * @param {{ fileIds: number[], channelKey: string, transform: string }} config
 * @returns {{ error: string } | { channelLabel: string, transformLabel: string, times: Date[], y: number[], z: Float64Array[], nFiles: number, timeStart: Date, timeStop: Date, downsampled: boolean, zMin: number | null, zMax: number | null }}
 */
export function buildUnfoldData(config) {
	const { fileIds, channelKey, transform } = config;
	const data = get(licelFiles);

	const measurements = collectChannelMeasurements(data, fileIds, channelKey);
	if (measurements.length === 0) {
		return { error: 'Канал не найден в выбранных файлах.' };
	}
	measurements.sort((a, b) => a.time.getTime() - b.time.getTime());

	const binWidthResult = resolveCommonBinWidth(measurements);
	if ('error' in binWidthResult) return { error: binWidthResult.error };
	const binWidth = binWidthResult.binWidth;

	let nBins = Infinity;
	for (const m of measurements) nBins = Math.min(nBins, m.profile.data.length);
	if (!Number.isFinite(nBins) || nBins < 1) {
		return { error: 'Канал не содержит данных.' };
	}

	if (transform === 'SR') {
		for (const m of measurements) {
			const mol = m.profile.molecular && m.profile.molecular.data;
			if (!mol || mol.length < nBins) {
				return {
					error: `Для канала ${profileLabel(m.profile)} не рассчитан профиль молекулярного рассеяния. Выполните «Молекулярную привязку» для всех выбранных файлов.`
				};
			}
		}
	}

	const { indices: rowIndices, downsampled: rowsDownsampled } = decimateIndices(
		nBins,
		UNFOLD_MAX_ROWS
	);
	const { indices: colIndices, downsampled: colsDownsampled } = decimateIndices(
		measurements.length,
		UNFOLD_MAX_COLS
	);
	const times = colIndices.map((i) => measurements[i].time);
	const alphaRad = (get(zenithAngle) * Math.PI) / 180;
	const { y, z } = computeUnfoldMatrix(
		measurements,
		rowIndices,
		colIndices,
		binWidth,
		transform,
		Math.cos(alphaRad)
	);
	const { zMin, zMax } = estimatePercentileBounds(z);

	return {
		channelLabel: profileLabel(measurements[0].profile),
		transformLabel: unfoldTransformById(transform).short,
		times,
		y,
		z,
		nFiles: measurements.length,
		timeStart: times[0],
		timeStop: times[times.length - 1],
		downsampled: rowsDownsampled || colsDownsampled,
		zMin,
		zMax
	};
}
