import { get } from 'svelte/store';
import {
	files,
	licelFiles,
	zenithAngle,
	molecularState,
	backgroundRemoval,
	medianFilter,
	cropByHeightConfig,
	MEDIAN_WINDOW_MAX,
	publishLicelData,
	showError,
	nextFileId
} from './store';
import {
	forEachProfile,
	isProfileUsable,
	profileKey,
	profileLabel,
	sameChannelAxis,
	findChannelProfile,
	selectableProfile,
	collectDistinctChannels,
	allFinite,
	meanValue,
	medianValue
} from '$lib/channels';
import { computeMolecularRaw, anchorMolecular } from '$lib/molecular';
import { loadLicelFileFromBuffer, glueToAnalog, glueToPhoton } from 'licelfile-js';
import { refreshFileSizes, licelFileBytes } from './zip-io';
import { formatBytes } from '$lib/format';

/**
 * Ids of the selected files, or null after showing the "no selection" error.
 * @returns {number[] | null}
 */
function getSelectedFileIds() {
	const ids = get(files)
		.filter((f) => f.selected)
		.map((f) => f.id);
	if (ids.length === 0) showError('Не выделено ни одного файла.');
	return ids.length > 0 ? ids : null;
}

// ---------------------------------------------------------------------------
// File list actions
// ---------------------------------------------------------------------------

/** @param {boolean} selected */
export function toggleSelectAll(selected) {
	const current = get(files);
	files.set(current.map((f) => ({ ...f, selected })));
}

/** @param {number} id */
export function toggleFile(id) {
	const current = get(files);
	files.set(current.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)));
}

export async function deleteSelected() {
	const current = get(files);
	const removed = current.filter((f) => f.selected);
	if (removed.length === 0) return;
	const removedIds = new Set(removed.map((f) => f.id));

	files.set(current.filter((f) => !f.selected));

	const data = get(licelFiles);
	const nextData = new Map();
	for (const [id, lf] of data) {
		if (!removedIds.has(id)) nextData.set(id, lf);
	}
	publishLicelData(nextData, [...removedIds]);
}

// ---------------------------------------------------------------------------
// Background removal
// ---------------------------------------------------------------------------

/**
 * Subtract a reference profile from a target profile element-wise over the
 * overlapping range; the target is trimmed to that range.
 * @param {any} target
 * @param {any} ref
 */
function subtractProfileReference(target, ref) {
	const n = Math.min(target.data.length, ref.data.length);
	const out = new Float64Array(n);
	for (let i = 0; i < n; i++) out[i] = target.data[i] - ref.data[i];
	target.data = out;
	target.nDataPoints = n;
}

/**
 * Estimate the background of a channel as the mean/median of its samples from
 * the given height (meters) to the end of the profile and subtract it from the
 * whole channel.
 * @param {any} profile
 * @param {number} height
 * @param {'average' | 'median'} method
 */
function subtractProfileStatistic(profile, height, method) {
	const start = Math.floor(height / profile.binWidth);
	const tail = profile.data.subarray(start);
	const bg = method === 'median' ? medianValue(tail) : meanValue(tail);
	const out = new Float64Array(profile.data.length);
	for (let i = 0; i < profile.data.length; i++) out[i] = profile.data[i] - bg;
	profile.data = out;
}

/**
 * Read the reference file and index its channels by profile key. Returns the
 * channel map, or null after showing the relevant error.
 * @param {File} referenceFile
 * @returns {Promise<Map<string, any> | null>}
 */
async function loadReferenceChannelMap(referenceFile) {
	/** @type {Map<string, any>} */
	const refChannels = new Map();
	try {
		const buffer = await referenceFile.arrayBuffer();
		const ref = loadLicelFileFromBuffer(new Uint8Array(buffer));
		for (const p of ref.profiles ?? []) {
			if (!isProfileUsable(p)) continue;
			const key = profileKey(p);
			if (refChannels.has(key)) {
				showError(
					`В референсном файле "${referenceFile.name}" несколько каналов с одинаковыми параметрами (${profileLabel(p)}).`
				);
				return null;
			}
			refChannels.set(key, p);
		}
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		showError(`Не удалось прочитать референсный файл "${referenceFile.name}": ${detail}`);
		return null;
	}
	if (refChannels.size === 0) {
		showError(`В референсном файле "${referenceFile.name}" нет каналов с данными.`);
		return null;
	}
	for (const p of refChannels.values()) {
		if (!allFinite(p.data)) {
			showError(
				`Канал ${profileLabel(p)} референсного файла "${referenceFile.name}" содержит нечисловые значения.`
			);
			return null;
		}
	}
	return refChannels;
}

/**
 * Subtract the corresponding channel of a reference Licel file from every
 * channel of every selected file. Channels are paired by wavelength,
 * polarization and device mode.
 * @param {number[]} selected
 * @param {Map<number, string>} fileNames
 * @param {Map<number, any>} data
 * @param {File} referenceFile
 * @returns {Promise<boolean>}
 */
async function subtractReferenceFromFiles(selected, fileNames, data, referenceFile) {
	const refChannels = await loadReferenceChannelMap(referenceFile);
	if (!refChannels) return false;

	// Validate before mutating: every selected channel must have a matching
	// reference channel with a matching bin width.
	const valid = forEachProfile(data, selected, (p, lf, id) => {
		const fileName = fileNames.get(id) ?? `#${id}`;
		const refProfile = refChannels.get(profileKey(p));
		if (!refProfile) {
			showError(
				`В референсном файле "${referenceFile.name}" нет канала ${profileLabel(p)} (файл "${fileName}").`
			);
			return false;
		}
		const binScale = Math.max(Math.abs(p.binWidth), Math.abs(refProfile.binWidth));
		if (Math.abs(p.binWidth - refProfile.binWidth) > 1e-6 * binScale) {
			showError(
				`Ширина бина канала ${profileLabel(p)} файла "${fileName}" (${p.binWidth} м) не совпадает с референсным каналом (${refProfile.binWidth} м).`
			);
			return false;
		}
	});
	if (!valid) return false;

	forEachProfile(data, selected, (p) => {
		subtractProfileReference(p, refChannels.get(profileKey(p)));
	});
	return true;
}

/**
 * Estimate the background of every channel of every selected file as the
 * mean/median of its samples from the given height (meters) to the end of the
 * profile and subtract it from the whole channel.
 * @param {number[]} selected
 * @param {Map<number, string>} fileNames
 * @param {Map<number, any>} data
 * @param {number} height
 * @param {'average' | 'median'} method
 * @returns {boolean}
 */
function subtractStatisticFromFiles(selected, fileNames, data, height, method) {
	// Validate before mutating: every channel must be long enough and finite.
	const valid = forEachProfile(data, selected, (p, lf, id) => {
		if (!(p.binWidth > 0)) return;
		const fileName = fileNames.get(id) ?? `#${id}`;
		if (Math.floor(height / p.binWidth) >= p.data.length) {
			showError(`Канал ${profileLabel(p)} файла "${fileName}" короче высоты начала (${height} м).`);
			return false;
		}
		if (!allFinite(p.data)) {
			showError(`Канал ${profileLabel(p)} файла "${fileName}" содержит нечисловые значения.`);
			return false;
		}
	});
	if (!valid) return false;

	forEachProfile(data, selected, (p) => {
		if (p.binWidth > 0) subtractProfileStatistic(p, height, method);
	});
	return true;
}

/**
 * Remove background from every channel of every selected file.
 * For "average"/"median" the background level is the respective statistic of
 * each channel's samples from the given height to the end of the profile,
 * subtracted across the whole channel. For "reference" every channel is
 * corrected sample-by-sample with the matching channel of a reference file
 * (matched by wavelength, polarization and device mode).
 * @param {{ method?: string, height?: number | null, referenceFile?: File | null }} [params]
 */
export async function removeBackground(params = {}) {
	const { method = 'average', height = null, referenceFile = null } = params;

	const selected = getSelectedFileIds();
	if (!selected) return;

	const data = get(licelFiles);
	/** @type {Map<number, string>} */
	const fileNames = new Map(get(files).map((f) => [f.id, f.name]));

	if (method === 'reference') {
		if (!referenceFile) {
			showError('Укажите референсный файл.');
			return;
		}
		if (!(await subtractReferenceFromFiles(selected, fileNames, data, referenceFile))) return;
	} else if (method === 'average' || method === 'median') {
		const bgHeight = /** @type {number} */ (height);
		if (!Number.isFinite(bgHeight) || bgHeight < 0) {
			showError('Укажите корректную высоту начала (неотрицательное число метров).');
			return;
		}
		if (!subtractStatisticFromFiles(selected, fileNames, data, bgHeight, method)) return;
	} else {
		showError(`Неизвестный метод удаления фона: ${method}.`);
		return;
	}

	publishLicelData(new Map(data), selected);
	refreshFileSizes(selected);

	backgroundRemoval.set({ method: 'average', height: '', referenceFile: null });
}

// ---------------------------------------------------------------------------
// Median filtering
// ---------------------------------------------------------------------------

/**
 * Apply a median filter to a copy of the source array and return a new array.
 * Uses a full window per point with indices clamped to the array bounds.
 * @param {Float64Array} data
 * @param {number} windowSize odd integer in [3, MEDIAN_WINDOW_MAX]
 * @returns {Float64Array}
 */
function medianFilterValues(data, windowSize) {
	const n = data.length;
	if (n === 0) return new Float64Array(0);
	let size = Number.isSafeInteger(windowSize) && windowSize >= 3 ? windowSize : 3;
	if (size > MEDIAN_WINDOW_MAX) size = MEDIAN_WINDOW_MAX;
	if (size % 2 === 0) size -= 1;
	const radius = (size - 1) / 2;
	const out = new Float64Array(n);
	const windowValues = new Array(size);
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < size; k++) {
			let idx = i + k - radius;
			if (idx < 0) idx = 0;
			else if (idx >= n) idx = n - 1;
			windowValues[k] = data[idx];
		}
		windowValues.sort((a, b) => a - b);
		out[i] = windowValues[radius];
	}
	return out;
}

/**
 * Apply a median filter with the given window size to every channel of every
 * selected file, then persist the updated dataset.
 * @param {number} windowSize
 */
export async function medianFiltering(windowSize) {
	const selected = getSelectedFileIds();
	if (!selected) return;

	const data = get(licelFiles);
	forEachProfile(data, selected, (p) => {
		p.data = medianFilterValues(p.data, windowSize);
	});
	publishLicelData(new Map(data), selected);

	medianFilter.set({ windowSize: '' });
}

// ---------------------------------------------------------------------------
// Channel merge (glue)
// ---------------------------------------------------------------------------

/**
 * List distinct analog (BT) and photon (BC) channels present in the given
 * files, each with the number of files that contain it. Glued channels are
 * excluded; labels and pairing follow the graph window convention.
 * @param {number[]} fileIds
 * @returns {{ analog: Array<{ key: string, label: string, fileCount: number, wavelength: number, deviceID: string, polarization: string }>, photon: Array<{ key: string, label: string, fileCount: number, wavelength: number, deviceID: string, polarization: string }> }}
 */
export function listMergeChannels(fileIds) {
	const data = get(licelFiles);
	const groups = collectDistinctChannels(data, fileIds, (p) =>
		p.deviceID === 'BT' ? 'analog' : p.deviceID === 'BC' ? 'photon' : ''
	);
	return { analog: groups.get('analog') ?? [], photon: groups.get('photon') ?? [] };
}

/**
 * Glue the selected analog and photon channels in every open file. For each
 * file the analog/photon channels are paired by wavelength and polarization
 * and combined with the licel-js `glueToAnalog` or `glueToPhoton` routine.
 * The resulting profile replaces an existing profile of the same type (BT for
 * analog target, BC for photon target) with the same wavelength/polarization,
 * or is appended. Files missing either channel (or where gluing fails) are
 * skipped and reported. Only the files actually modified are published.
 * @param {{ analogKey?: string, photonKey?: string, h1?: number, h2?: number, target?: 'analog' | 'photon' }} [params]
 */
export async function mergeChannels(params = {}) {
	const { analogKey = '', photonKey = '', h1 = NaN, h2 = NaN, target = 'analog' } = params;

	if (!analogKey || !photonKey) {
		showError('Выберите аналоговый и фотонный каналы.');
		return;
	}
	if (!Number.isFinite(h1) || !Number.isFinite(h2) || h1 < 0 || h1 >= h2) {
		showError('Укажите корректный диапазон высот: начало должно быть не меньше 0 и меньше конца.');
		return;
	}

	const current = get(files);
	/** @type {Map<number, string>} */
	const fileNames = new Map(current.map((f) => [f.id, f.name]));
	const channels = listMergeChannels([...fileNames.keys()]);
	const analog = channels.analog.find((c) => c.key === analogKey);
	const photon = channels.photon.find((c) => c.key === photonKey);
	if (!analog) {
		showError('Выбранный аналоговый канал не найден.');
		return;
	}
	if (!photon) {
		showError('Выбранный фотонный канал не найден.');
		return;
	}
	if (!sameChannelAxis(analog, photon)) {
		showError('Аналоговый и фотонный каналы должны совпадать по длине волны и поляризации.');
		return;
	}

	const glueFn = target === 'analog' ? glueToAnalog : glueToPhoton;
	const targetDevice = target === 'analog' ? 'BT' : 'BC';

	const data = get(licelFiles);
	/** @type {number[]} */
	const touched = [];
	/** @type {string[]} */
	const skipped = [];

	for (const id of fileNames.keys()) {
		const lf = data.get(id);
		if (!lf) continue;
		const fileName = fileNames.get(id) ?? `#${id}`;

		const analogResult = findChannelProfile(lf, analogKey);
		const photonResult = findChannelProfile(lf, photonKey);
		if ('missing' in analogResult || 'missing' in photonResult) {
			skipped.push(fileName);
			continue;
		}
		if ('ambiguous' in analogResult || 'ambiguous' in photonResult) {
			skipped.push(fileName);
			continue;
		}
		const analogProfile = analogResult.profile;
		const photonProfile = photonResult.profile;

		const widthScale = Math.max(Math.abs(analogProfile.binWidth), Math.abs(photonProfile.binWidth));
		if (
			!(analogProfile.binWidth > 0) ||
			Math.abs(analogProfile.binWidth - photonProfile.binWidth) > 1e-6 * widthScale
		) {
			skipped.push(fileName);
			continue;
		}

		// The glue functions internally use `selectProfile` (same as old `glue`),
		// which treats an empty polarization as a wildcard. Confirm selection.
		if (
			selectableProfile(lf, false, analog.wavelength, analog.polarization) !== analogProfile ||
			selectableProfile(lf, true, analog.wavelength, analog.polarization) !== photonProfile
		) {
			skipped.push(fileName);
			continue;
		}

		/** @type {any} */
		let glued;
		try {
			glued = glueFn(lf, analog.wavelength, h1, h2, analog.polarization);
		} catch {
			skipped.push(fileName);
			continue;
		}

		const profiles = lf.profiles ?? [];
		const existingIdx = profiles.findIndex(
			/** @param {any} p */
			(p) => p.deviceID === targetDevice && sameChannelAxis(p, analog)
		);
		if (existingIdx >= 0) {
			profiles[existingIdx] = glued;
		} else {
			profiles.push(glued);
		}
		lf.profiles = profiles;
		lf.nDatasets = profiles.length;
		touched.push(id);
	}

	if (touched.length === 0) {
		showError(
			skipped.length > 0
				? `Склейка не выполнена: ни в одном файле нет обоих выбранных каналов. Пропущено файлов: ${skipped.length}.`
				: 'Склейка не выполнена: нет файлов с данными.'
		);
		return;
	}

	publishLicelData(new Map(data), touched);
	refreshFileSizes(touched);

	if (skipped.length > 0) {
		showError(
			`Склейка выполнена, но ${skipped.length} файл(ов) пропущено (нет каналов или диапазон вне данных):\n${skipped.join('\n')}`
		);
	}
}

// ---------------------------------------------------------------------------
// Height crop
// ---------------------------------------------------------------------------

/**
 * Trim every channel of every selected file so that the maximum displayed
 * height z = r · cos(zenithAngle) stays within the limit. The height axis of
 * graph windows is derived from the pristine distances (j · binWidth) scaled by
 * cos(zenithAngle), so a channel keeps the first
 * floor(maxHeight / (binWidth · cos(zenithAngle))) bins. A profile whose
 * length is already within the limit (or shorter than one bin) is left
 * untouched. Profiles are trimmed per their own bin width, so the same height
 * may yield a different number of retained points per channel.
 * @param {number} maxHeight
 */
export async function cropByHeight(maxHeight) {
	const selected = getSelectedFileIds();
	if (!selected) return;
	if (!Number.isFinite(maxHeight) || maxHeight <= 0) {
		showError('Укажите корректную максимальную высоту.');
		return;
	}

	const alphaRad = (get(zenithAngle) * Math.PI) / 180;
	const cosZenith = Math.cos(alphaRad);
	if (!(cosZenith > 0.05)) {
		showError('Зенитный угол слишком велик для обрезки по высоте.');
		return;
	}

	const data = get(licelFiles);
	forEachProfile(
		data,
		selected,
		(p) => {
			if (!(p.binWidth > 0)) return;
			const total = Number.isFinite(p.nDataPoints) ? p.nDataPoints : p.data.length;
			const keep = Math.min(Math.floor(maxHeight / (p.binWidth * cosZenith)), total);
			if (keep >= total || keep < 1) return;
			p.data = p.data.slice(0, keep);
			p.nDataPoints = p.data.length;
			if (p.molecular && p.molecular.data) {
				p.molecular = { ...p.molecular, data: p.molecular.data.slice(0, keep) };
			}
		},
		{ includeInactive: true }
	);
	publishLicelData(new Map(data), selected);
	refreshFileSizes(selected);

	cropByHeightConfig.set({ maxHeight: '' });
}

// ---------------------------------------------------------------------------
// Molecular anchoring ("молекулярная привязка")
// ---------------------------------------------------------------------------

/**
 * Compute and store the purely molecular scattering profile for every channel
 * of every selected file. The meteo profiles (P in Pa, H in m, T in K) are
 * interpolated onto each channel's uniform height grid with step
 * binWidth * cos(zenithAngle). For every channel the anchoring factor K is the
 * mean ratio of the measured signal to the unanchored molecular signal within
 * (zMin; zMax), and the stored profile is K * beta_m(z) * z^-2 * exp(-2 * tau(z)).
 * @param {{ meteo?: any, zMin?: number, zMax?: number, sourceName?: string }} [params]
 */
export async function applyMolecularAnchoring(params = {}) {
	const { meteo, zMin, zMax, sourceName = '' } = params;

	if (!meteo || !(meteo.heights instanceof Float64Array) || meteo.heights.length < 2) {
		showError('Метеоданные не загружены или повреждены.');
		return;
	}
	/** @type {number} */
	const zMinValue = typeof zMin === 'number' && Number.isFinite(zMin) ? zMin : NaN;
	/** @type {number} */
	const zMaxValue = typeof zMax === 'number' && Number.isFinite(zMax) ? zMax : NaN;
	if (
		!Number.isFinite(zMinValue) ||
		!Number.isFinite(zMaxValue) ||
		zMinValue < 0 ||
		zMinValue >= zMaxValue
	) {
		showError('Укажите корректный диапазон высот привязки: 0 ≤ z_min < z_max.');
		return;
	}

	const selected = getSelectedFileIds();
	if (!selected) return;

	const alphaRad = (get(zenithAngle) * Math.PI) / 180;
	const cosZenith = Math.cos(alphaRad);
	if (!(cosZenith > 0.05)) {
		showError('Зенитный угол слишком велик для молекулярной привязки.');
		return;
	}

	const data = get(licelFiles);
	/** @type {Map<number, string>} */
	const fileNames = new Map(get(files).map((f) => [f.id, f.name]));
	const meteoTop = meteo.heights[meteo.heights.length - 1];
	const meteoBottom = meteo.heights[0];

	// Validate every channel before mutating anything.
	const valid = forEachProfile(data, selected, (p, lf, id) => {
		const fileName = fileNames.get(id) ?? `#${id}`;
		if (!(p.binWidth > 0)) {
			showError(`Канал ${profileLabel(p)} файла "${fileName}" имеет некорректную ширину бина.`);
			return false;
		}
		if (!(p.wavelength > 0)) {
			showError(`Канал ${profileLabel(p)} файла "${fileName}" не содержит длину волны.`);
			return false;
		}
		if (!allFinite(p.data)) {
			showError(`Канал ${profileLabel(p)} файла "${fileName}" содержит нечисловые значения.`);
			return false;
		}
		const dz = p.binWidth * cosZenith;
		const top = (p.data.length - 1) * dz;
		if (zMinValue > top || zMaxValue > top) {
			showError(
				`Диапазон привязки (${zMinValue}–${zMaxValue} м) выходит за пределы канала ${profileLabel(p)} файла "${fileName}" (до ${top.toFixed(0)} м).`
			);
			return false;
		}
		if (zMaxValue > meteoTop) {
			showError(
				`Верхняя граница привязки (${zMaxValue.toFixed(0)} м) выше максимальной высоты метеоданных (${meteoTop.toFixed(0)} м).`
			);
			return false;
		}
		if (zMinValue < meteoBottom) {
			showError(
				`Нижняя граница привязки (${zMinValue.toFixed(0)} м) ниже минимальной высоты метеоданных (${meteoBottom.toFixed(0)} м).`
			);
			return false;
		}
	});
	if (!valid) return;

	// Compute every channel without mutating anything; the profile objects only
	// get their molecular anchor after the whole batch passed, so a mid-batch
	// failure cannot leave a partially anchored dataset.
	/** @type {Array<{ profile: any, molecular: any }>} */
	const anchors = [];
	const computeOk = forEachProfile(data, selected, (p) => {
		const dz = p.binWidth * cosZenith;
		const n = p.data.length;
		/** @type {Float64Array} */
		const zGrid = new Float64Array(n);
		for (let j = 0; j < n; j++) zGrid[j] = j * dz;

		const { raw } = computeMolecularRaw({
			wavelengthNm: p.wavelength,
			cosZenith,
			meteo,
			zGrid
		});
		const { k, count } = anchorMolecular({
			measured: p.data,
			raw,
			zGrid,
			zMin: zMinValue,
			zMax: zMaxValue
		});
		if (count === 0) {
			showError(
				`В диапазоне привязки (${zMinValue}–${zMaxValue} м) канала ${profileLabel(p)} нет валидных отсчётов.`
			);
			return false;
		}

		/** @type {Float64Array} */
		const molecular = new Float64Array(n);
		for (let j = 0; j < n; j++) molecular[j] = k * raw[j];
		anchors.push({
			profile: p,
			molecular: {
				data: molecular,
				k,
				zMin: zMinValue,
				zMax: zMaxValue,
				zenithDeg: get(zenithAngle),
				wavelengthNm: p.wavelength,
				sourceName
			}
		});
	});
	if (computeOk === false || anchors.length === 0) return;
	for (const a of anchors) a.profile.molecular = a.molecular;

	molecularState.set({ meteo, sourceName, zMin: zMinValue, zMax: zMaxValue });
	publishLicelData(new Map(data), selected);
	refreshFileSizes(selected);
}

// ---------------------------------------------------------------------------
// Zenith angle
// ---------------------------------------------------------------------------

/**
 * Apply a new zenith angle (degrees) to the whole dataset: graph and unfold
 * windows derive their height axis as z = r · cos(alpha) from the pristine
 * distances (j · binWidth), so changing the angle never accumulates on
 * previous recomputations. Values outside [0, 80] are rejected; without loaded
 * files the angle cannot be applied.
 * @param {number} alphaDeg
 * @returns {Promise<boolean>}
 */
export async function setZenithAngle(alphaDeg) {
	if (!Number.isFinite(alphaDeg) || alphaDeg < 0 || alphaDeg > 80) {
		showError('Зенитный угол должен быть числом от 0 до 80 градусов.');
		return false;
	}
	if (get(files).length === 0) {
		showError('Нет загруженных файлов. Сначала откройте данные.');
		return false;
	}
	if (alphaDeg === get(zenithAngle)) return true;
	zenithAngle.set(alphaDeg);
	return true;
}

// ---------------------------------------------------------------------------
// File averaging
// ---------------------------------------------------------------------------

/**
 * Largest "average_N" suffix among the given file names, or 0 when none exist.
 * @param {Array<{ name: string }>} items
 */
function maxAverageIndex(items) {
	let max = 0;
	for (const f of items) {
		const m = /^average_(\d+)$/.exec(f.name);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return max;
}

/**
 * Average every selected file into a new file "average_{idx}". Channels are
 * paired by wavelength, polarization and device mode; every selected file must
 * contain the channel with a matching bin width, otherwise the operation is
 * aborted. The new file keeps the metadata of the first selected file, with
 * measurementStartTime set to the earliest start, measurementStopTime to the
 * latest stop, laser1NShots summed over the selected files and each channel's
 * nShots summed over the selected files containing it. Profiles are averaged
 * element-wise over the shortest channel.
 */
export async function averageSelectedFiles() {
	const selected = getSelectedFileIds();
	if (!selected) return;
	if (selected.length < 2) {
		showError('Для усреднения нужно минимум 2 файла.');
		return;
	}

	const data = get(licelFiles);
	/** @type {Map<number, string>} */
	const fileNames = new Map(get(files).map((f) => [f.id, f.name]));

	/** @type {Array<{ id: number, lf: any, channels: Map<string, any> }>} */
	const entries = [];
	for (const id of selected) {
		const lf = data.get(id);
		if (!lf) continue;
		/** @type {Map<string, any>} */
		const channels = new Map();
		for (const p of lf.profiles ?? []) {
			if (!isProfileUsable(p)) continue;
			const key = profileKey(p);
			if (!channels.has(key)) channels.set(key, p);
		}
		entries.push({ id, lf, channels });
	}
	if (entries.length < 2) {
		showError('Для усреднения нужно минимум 2 файла с данными.');
		return;
	}

	// Group every channel found in the first file across all selected files;
	// abort when a channel or a matching bin width is missing somewhere.
	/** @type {Map<string, any[]>} */
	const groups = new Map();
	const firstChannels = entries[0].channels;
	if (firstChannels.size === 0) {
		showError('В выбранных файлах нет каналов с данными.');
		return;
	}
	for (const [key, firstProfile] of firstChannels) {
		/** @type {any[]} */
		const profiles = [];
		for (const entry of entries) {
			const p = entry.channels.get(key);
			if (!p) {
				showError(
					`Канал ${profileLabel(firstProfile)} отсутствует в файле "${fileNames.get(entry.id) ?? `#${entry.id}`}".`
				);
				return;
			}
			profiles.push(p);
		}
		groups.set(key, profiles);
	}
	for (const profiles of groups.values()) {
		const width = profiles[0].binWidth;
		if (!(width > 0)) {
			showError(`Канал ${profileLabel(profiles[0])} имеет некорректную ширину бина.`);
			return;
		}
		for (const p of profiles) {
			if (Math.abs(p.binWidth - width) > 1e-9 * width) {
				showError(`Ширина бина канала ${profileLabel(p)} отличается между выбранными файлами.`);
				return;
			}
		}
	}

	// Build the averaged file from the first file's metadata.
	/** @type {any} */
	const source = entries[0].lf;
	let start = source.measurementStartTime;
	let stop = source.measurementStopTime;
	let laser1NShots = Number(source.laser1NShots) || 0;
	for (const entry of entries.slice(1)) {
		const s = entry.lf.measurementStartTime;
		const t = entry.lf.measurementStopTime;
		if (s instanceof Date && Number.isFinite(s.getTime()) && s < start) start = s;
		if (t instanceof Date && Number.isFinite(t.getTime()) && t > stop) stop = t;
		laser1NShots += Number(entry.lf.laser1NShots) || 0;
	}

	/** @type {any[]} */
	const profiles = [];
	for (const group of groups.values()) {
		const base = group[0];
		let nShots = 0;
		let length = Infinity;
		for (const p of group) {
			nShots += Number(p.nShots) || 0;
			length = Math.min(length, p.data.length);
		}
		const averaged = new Float64Array(length);
		for (let j = 0; j < length; j++) {
			let sum = 0;
			for (const p of group) sum += p.data[j];
			averaged[j] = sum / group.length;
		}
		profiles.push({
			...base,
			nShots,
			nDataPoints: length,
			data: averaged
		});
	}

	/** @type {any} */
	const averagedFile = {
		...source,
		measurementStartTime: start,
		measurementStopTime: stop,
		laser1NShots,
		nDatasets: profiles.length,
		profiles
	};

	const idx = maxAverageIndex(get(files)) + 1;
	const id = nextFileId();
	const name = `average_${idx}`;

	files.set([
		...get(files),
		{ id, name, size: formatBytes(licelFileBytes(averagedFile)), selected: false }
	]);
	const nextData = new Map(data);
	nextData.set(id, averagedFile);
	publishLicelData(nextData, [id]);
}
