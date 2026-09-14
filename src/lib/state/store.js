import { writable, get } from 'svelte/store';
import {
	newLicelPackFromZipBuffer,
	savePackToZipBuffer,
	loadLicelFileFromBuffer,
	glueToAnalog,
	glueToPhoton
} from 'licelfile-js';
import { computeMolecularRaw, anchorMolecular } from '$lib/molecular';

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

/** Open files of the current working dataset. */
export const files = writable(
	/** @type {Array<{ id: number, name: string, size: string, selected: boolean }>} */ ([])
);

/** Non-modal application windows ("график", "развертка", ...). */
export const openWindows = writable(
	/** @type {Array<{ id: number, title: string, x: number, y: number, width: number | null, height: number | null, z: number, collapsed: boolean, maximized: boolean, view: any, payload?: any }>} */ ([])
);

/**
 * Width of the left file panel in percent. Part of the workspace snapshot.
 */
export const leftPanelPercent = writable(20);

/**
 * Bumped on every session apply so the window container is hard-remounted and
 * every NonModalWindow is rebuilt from scratch (plotly instances included).
 */
export const sessionEpoch = writable(0);

// Global z-order counter for windows; seeded from the loaded snapshot. Kept
// here (shared by every window) instead of per-component so window records can
// persist their stacking order across sessions.
let windowZCounter = 100;

/** @returns {number} */
export function nextWindowZ() {
	return ++windowZCounter;
}

/** @param {number} z */
export function seedWindowZ(z) {
	if (Number.isFinite(z) && z > windowZCounter) windowZCounter = Math.floor(z);
}

/**
 * Merge a patch into a window record (geometry, z-order, collapse/maximize
 * flags, view state). Called by NonModalWindow whenever the user changes any
 * of those so a manual save always captures the live layout.
 * @param {number} id
 * @param {any} patch
 */
export function updateWindowState(id, patch) {
	const current = get(openWindows);
	openWindows.set(current.map((w) => (w.id === id ? { ...w, ...patch } : w)));
}

/** @param {number} n */
export function seedNextId(n) {
	nextId = Math.max(nextId, n);
}

/** Message shown in the error dialog ('' hides it). */
export const errorMessage = writable('');

/**
 * Map of file id -> parsed/modified LicelFile of the current working dataset.
 * @type {import('svelte/store').Writable<Map<number, any>>}
 */
export const licelFiles = writable(/** @type {Map<number, any>} */ (new Map()));

/**
 * File ids touched by the last licelFiles publish; null means every file may
 * have changed (new pack loaded / session restored). Published together with
 * the new licelFiles map so dependent windows can skip unaffected rebuilds.
 */
export const licelDataTouched = writable(/** @type {number[] | null} */ (null));

/** Background removal settings for the dialog form. */
export const backgroundRemoval = writable(
	/** @type {{ method: string, height: string, referenceFile: File | null }} */ ({
		method: 'average', // 'average' | 'median' | 'reference'
		height: '',
		referenceFile: null
	})
);

/** Largest allowed median filter window (odd). */
export const MEDIAN_WINDOW_MAX = 101;

/** Median filter settings for the dialog form. */
export const medianFilter = writable(
	/** @type {{ windowSize: string }} */ ({
		windowSize: ''
	})
);

/** Height crop settings for the dialog form. */
export const cropByHeightConfig = writable(
	/** @type {{ maxHeight: string }} */ ({
		maxHeight: ''
	})
);

/**
 * Snapshot of channel visibility (channel name -> enabled) remembered from a
 * graph window; applied to graph windows opened afterwards.
 */
export const savedChannelSelection = writable(/** @type {Record<string, boolean> | null} */ (null));

/** @param {Record<string, boolean>} states */
export function rememberChannelSelection(states) {
	savedChannelSelection.set({ ...states });
}

/**
 * Zenith angle (degrees) applied to the working dataset. Graph windows derive
 * their height axis as z = r · cos(alpha) from the pristine distances of every
 * channel, so this single value keeps all windows consistent.
 */
export const zenithAngle = writable(0);

/**
 * State of the last molecular anchoring run: the parsed meteo profiles, the
 * source file name and the anchoring height window. Persisted with the session
 * so the dialog can be prefilled and the anchoring re-applied without
 * re-selecting the meteo file.
 */
export const molecularState = writable(
	/** @type {{ meteo: any | null, sourceName: string, zMin: number, zMax: number }} */ ({
		meteo: null,
		sourceName: '',
		zMin: 0,
		zMax: 0
	})
);

// ---------------------------------------------------------------------------
// Error dialog
// ---------------------------------------------------------------------------

/** @param {string} message */
export function showError(message) {
	errorMessage.set(message);
}

export function clearError() {
	errorMessage.set('');
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Whether a profile carries data at all, regardless of its active flag.
 * @param {any} p
 */
function hasData(p) {
	return p && p.data && p.data.length > 0;
}

/**
 * Whether a profile is a candidate for channel processing — it is active and
 * carries data. Inactive/empty profiles are ignored everywhere.
 * @param {any} p
 */
function isProfileUsable(p) {
	return hasData(p) && p.active !== false;
}

/**
 * Iterate over the profiles carrying data of the given files, in file order,
 * invoking `fn(profile, licelFile, fileId)` for each. Inactive profiles are
 * skipped unless `includeInactive` is set. Stops early (and returns false) when
 * `fn` returns false, so validations can bail out of the whole batch.
 * @param {Map<number, any>} data
 * @param {number[]} fileIds
 * @param {(profile: any, licelFile: any, fileId: number) => boolean | void} fn
 * @param {{ includeInactive?: boolean }} [options]
 * @returns {boolean} false when iteration was stopped early
 */
function forEachProfile(data, fileIds, fn, options = {}) {
	const includeInactive = options.includeInactive ?? false;
	for (const id of fileIds) {
		const lf = data.get(id);
		if (!lf) continue;
		for (const p of lf.profiles ?? []) {
			if (!hasData(p)) continue;
			if (!includeInactive && p.active === false) continue;
			if (fn(p, lf, id) === false) return false;
		}
	}
	return true;
}

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

/** @param {Float64Array} values */
function allFinite(values) {
	for (let i = 0; i < values.length; i++) {
		if (!Number.isFinite(values[i])) return false;
	}
	return true;
}

/**
 * Stable channel signature used to pair profiles across files.
 * @param {any} p
 */
function profileKey(p) {
	return `${p.deviceID || ''}|${p.wavelength || ''}|${p.polarization || ''}`;
}

/**
 * Human-readable channel description (same convention as graph windows).
 * @param {any} p
 */
function profileLabel(p) {
	const mode =
		p.deviceID === 'BC' ? 'фотон' : p.deviceID === 'BT' ? 'аналог' : p.deviceID || 'канал';
	const pol = p.polarization ? ` (${p.polarization})` : '';
	return `${p.wavelength || '?'} нм${pol} · ${mode}`;
}

/**
 * Whether two channels share the same axis: identical wavelength and
 * polarization. Uses exact equality to match licel-js `selectProfile`, which
 * pairs analog/photon channels by strict wavelength and polarization.
 * @param {{ wavelength: number, polarization: string }} a
 * @param {{ wavelength: number, polarization: string }} b
 */
export function sameChannelAxis(a, b) {
	return a.wavelength === b.wavelength && a.polarization === b.polarization;
}

/**
 * Collect distinct channels present in the given files, grouped by a
 * classifier. Each channel is keyed by `profileKey`; lists are sorted by
 * wavelength, device and polarization. Shared by the graph/unfold channel
 * picker and the merge dialog so their channel lists cannot drift apart.
 * @param {number[]} fileIds
 * @param {(p: any) => string} [classify] group name; empty string skips the profile
 * @returns {Map<string, Array<{ key: string, label: string, fileCount: number, wavelength: number, deviceID: string, polarization: string }>>}
 */
function collectDistinctChannels(fileIds, classify = () => 'all') {
	const data = get(licelFiles);
	/** @type {Map<string, Map<string, any>>} */
	const groups = new Map();

	forEachProfile(data, fileIds, (p) => {
		const group = classify(p);
		if (!group) return;
		let found = groups.get(group);
		if (!found) {
			found = new Map();
			groups.set(group, found);
		}
		const key = profileKey(p);
		const entry = found.get(key);
		if (entry) {
			entry.fileCount++;
		} else {
			found.set(key, {
				key,
				label: profileLabel(p),
				fileCount: 1,
				wavelength: p.wavelength,
				deviceID: p.deviceID,
				polarization: p.polarization
			});
		}
	});

	/** @type {Map<string, Array<any>>} */
	const result = new Map();
	for (const [group, found] of groups) {
		result.set(
			group,
			[...found.values()].sort(
				(a, b) =>
					Number(a.wavelength) - Number(b.wavelength) ||
					a.deviceID.localeCompare(b.deviceID) ||
					a.polarization.localeCompare(b.polarization)
			)
		);
	}
	return result;
}

/** @param {Float64Array} values */
function meanValue(values) {
	let sum = 0;
	for (let i = 0; i < values.length; i++) sum += values[i];
	return sum / values.length;
}

/** @param {Float64Array} values */
function medianValue(values) {
	if (values.length === 0) return NaN;
	const sorted = Float64Array.from(values);
	sorted.sort();
	const mid = sorted.length >> 1;
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ---------------------------------------------------------------------------
// Data publication
// ---------------------------------------------------------------------------

/**
 * Publish a new licelFiles map together with the set of file ids it changed.
 * @param {Map<number, any>} map
 * @param {number[] | null} touchedIds
 */
export function publishLicelData(map, touchedIds) {
	licelFiles.set(map);
	licelDataTouched.set(touchedIds);
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
	const groups = collectDistinctChannels(fileIds, (p) =>
		p.deviceID === 'BT' ? 'analog' : p.deviceID === 'BC' ? 'photon' : ''
	);
	return { analog: groups.get('analog') ?? [], photon: groups.get('photon') ?? [] };
}

/**
 * Find the single usable profile of a file whose channel key matches. Returns
 * a status: absent (`missing`) or several matches with the same key
 * (`ambiguous`). Inactive/data-less profiles are ignored, consistently with the
 * channel listings.
 * @param {any} lf
 * @param {string} key
 * @returns {{ profile: any } | { missing: true } | { ambiguous: true }}
 */
function findChannelProfile(lf, key) {
	const matches = (lf.profiles ?? []).filter(
		/** @param {any} p */ (p) => isProfileUsable(p) && profileKey(p) === key
	);
	if (matches.length === 0) return { missing: true };
	if (matches.length > 1) return { ambiguous: true };
	return { profile: matches[0] };
}

/**
 * Mirror of the licel-js `selectProfile` routine: first non-glued profile of
 * the requested mode/wavelength whose polarization matches, where an empty
 * polarization acts as a wildcard. Used to confirm that `glue` will operate on
 * the exact validated profiles rather than an unintended same-wavelength one.
 * @param {any} lf
 * @param {boolean} isPhotonMode
 * @param {number} wavelength
 * @param {string} polarization
 * @returns {any}
 */
function selectableProfile(lf, isPhotonMode, wavelength, polarization) {
	for (const p of lf.profiles ?? []) {
		if (p.deviceID === 'BG') continue;
		if ((p.deviceID === 'BC') !== isPhotonMode) continue;
		if (p.wavelength !== wavelength) continue;
		if (polarization === '' || p.polarization === polarization) return p;
	}
	return null;
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
		for (let i = 0; i < entries.length; i++) {
			const p = entries[i].channels.get(key);
			if (!p) {
				showError(
					`Канал ${profileLabel(firstProfile)} отсутствует в файле "${fileNames.get(entries[i].id) ?? `#${entries[i].id}`}".`
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
	const id = nextId++;
	const name = `average_${idx}`;

	files.set([
		...get(files),
		{ id, name, size: formatSize(licelFileBytes(averagedFile)), selected: false }
	]);
	const nextData = new Map(data);
	nextData.set(id, averagedFile);
	publishLicelData(nextData, [id]);
}

// ---------------------------------------------------------------------------
// Unfold (heatmap) support
// ---------------------------------------------------------------------------

/** Value transforms available for unfold ("развертка") windows. */
export const UNFOLD_TRANSFORMS = [
	{ id: 'P', label: 'Исходный сигнал P', short: 'P' },
	{ id: 'Pr2', label: 'P·r²', short: 'P·r²' },
	{ id: 'symlogP', label: 'symlog(P)', short: 'symlog(P)' },
	{ id: 'symlogPr2', label: 'symlog(P·r²)', short: 'symlog(P·r²)' }
];

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
 * @returns {Array<{ key: string, label: string, fileCount: number, wavelength: number, deviceID: string, polarization: string }>}
 */
export function listUnfoldChannels(fileIds) {
	return collectDistinctChannels(fileIds).get('all') ?? [];
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
	return v;
}

/**
 * Build the heatmap matrix: rows are height bins, columns are files.
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
	const y = new Array(rowIndices.length);
	const z = new Array(rowIndices.length);
	for (let r = 0; r < rowIndices.length; r++) {
		const j = rowIndices[r];
		y[r] = j * binWidth * zFactor;
		const distance = (j + 0.5) * binWidth;
		const row = new Float64Array(colIndices.length);
		for (let c = 0; c < colIndices.length; c++) {
			row[c] = applyUnfoldTransform(cols[colIndices[c]][j], transform, distance);
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

/**
 * Open a new non-modal unfold window ("Развертка: …") for the given channel
 * and value transform over the given files.
 * @param {{ fileIds: number[], channelKey: string, transform: string }} config
 */
export function addUnfoldWindow(config) {
	const channel = listUnfoldChannels(config.fileIds).find((c) => c.key === config.channelKey);
	const tf = unfoldTransformById(config.transform);
	const label = channel?.label ?? config.channelKey;
	addWindow(`Развертка: ${label} · ${tf.short}`, undefined, {
		unfold: { ...config, channelLabel: label, transformLabel: tf.short }
	});
}

// ---------------------------------------------------------------------------
// Non-modal windows
// ---------------------------------------------------------------------------

/**
 * @param {string} title
 * @param {{ x?: number, y?: number }} [position]
 * @param {any} [payload]
 */
export function addWindow(title, position, payload) {
	const id = Date.now();
	const current = get(openWindows);
	openWindows.set([
		...current,
		{
			id,
			title,
			x: position?.x ?? 20 + Math.random() * 100,
			y: position?.y ?? 20 + Math.random() * 50,
			width: null,
			height: null,
			z: nextWindowZ(),
			collapsed: false,
			maximized: false,
			view: null,
			payload
		}
	]);
}

/** @param {number} id */
export function removeWindow(id) {
	const current = get(openWindows);
	openWindows.set(current.filter((w) => w.id !== id));
}

// ---------------------------------------------------------------------------
// Zip export
// ---------------------------------------------------------------------------

/** @param {string} name */
function basename(name) {
	const idx = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
	return idx >= 0 ? name.slice(idx + 1) : name;
}

/**
 * Serialize the selected files into an in-memory zip archive.
 * Returns the zip bytes, or null after showing an error.
 * @returns {Uint8Array | null}
 */
export function savePackToZip() {
	const selected = get(files).filter((f) => f.selected);
	if (selected.length === 0) {
		showError('Не выделено ни одного файла.');
		return null;
	}

	const data = get(licelFiles);
	/** @type {Map<string, any>} */
	const packData = new Map();
	for (const f of selected) {
		const lf = data.get(f.id);
		if (!lf) continue;
		const entry = basename(f.name);
		if (packData.has(entry)) {
			showError(`В архиве несколько файлов с именем "${entry}". Переименуйте их и повторите.`);
			return null;
		}
		packData.set(entry, lf);
	}

	if (packData.size === 0) {
		showError('Нет данных для сохранения.');
		return null;
	}

	try {
		/** @type {import('licelfile-js').LicelPack} */
		const pack = {
			data: packData,
			startTime: new Date(0),
			stopTime: new Date(0),
			zipCompressionLevel: 0
		};
		return savePackToZipBuffer(pack);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		showError(`Не удалось сохранить архив: ${detail}`);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Zip loading
// ---------------------------------------------------------------------------

let nextId = 1;

/** @param {any} lf */
function licelFileBytes(lf) {
	let bytes = 256; // header overhead approximation
	for (const p of lf.profiles) {
		bytes += (p.nDataPoints || 0) * 4;
	}
	return bytes;
}

/** @param {number} bytes */
function formatSize(bytes) {
	if (!Number.isFinite(bytes) || bytes <= 0) return '—';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	const text = value >= 100 ? value.toFixed(0) : value.toFixed(1);
	return `${text.replace('.', ',')} ${units[unit]}`;
}

/**
 * Recompute the displayed size of the given files after a data-modifying operation.
 * @param {number[]} [ids] File ids to refresh; defaults to every file.
 */
function refreshFileSizes(ids) {
	const current = get(files);
	const data = get(licelFiles);
	const idSet = ids ? new Set(ids) : null;
	files.set(
		current.map((f) => {
			if (idSet && !idSet.has(f.id)) return f;
			const lf = data.get(f.id);
			if (!lf) return f;
			return { ...f, size: formatSize(licelFileBytes(lf)) };
		})
	);
}

/**
 * Parse a zip archive into the file list. Returns success; shows errors in the dialog.
 * @param {Uint8Array} bytes
 * @param {string} label
 * @returns {boolean}
 */
function loadPackFromZip(bytes, label) {
	try {
		const pack = newLicelPackFromZipBuffer(bytes);
		if (!pack.data || pack.data.size === 0) {
			showError(`В архиве "${label}" не найдено файлов данных Licel.`);
			return false;
		}

		const items = [];
		const fileMap = new Map();
		for (const [path, lf] of pack.data) {
			const id = nextId++;
			const name = path.replace(/^\/+/, '');
			items.push({ id, name, size: formatSize(licelFileBytes(lf)), selected: false });
			fileMap.set(id, lf);
		}

		files.set(items);
		publishLicelData(fileMap, null);
		savedChannelSelection.set(null);
		return true;
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		showError(`Не удалось прочитать архив "${label}": ${detail}`);
		return false;
	}
}

/**
 * Open a zip from the file picker and persist the resulting dataset.
 * @param {ArrayBuffer} buffer
 * @param {string} zipName
 * @returns {Promise<boolean>}
 */
export async function openFiles(buffer, zipName) {
	return loadPackFromZip(new Uint8Array(buffer), zipName);
}

/** @param {any} x */
function isNumericProfile(x) {
	return x && (Array.isArray(x) || ArrayBuffer.isView(x));
}
