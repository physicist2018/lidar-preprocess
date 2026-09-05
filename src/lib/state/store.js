import { writable, get } from 'svelte/store';
import {
	newLicelPackFromZipBuffer,
	savePackToZipBuffer,
	loadLicelFileFromBuffer
} from 'licelfile-js';
import { saveSession, loadSession } from './persistence';

// --- File store ---
export const files = writable(
	/** @type {Array<{ id: number, name: string, size: string, selected: boolean }>} */ ([])
);

export const openWindows = writable(
	/** @type {Array<{ id: number, title: string, x: number, y: number, payload?: any }>} */ ([])
);

// --- Error dialog state ---
export const errorMessage = writable('');

/** @param {string} message */
export function showError(message) {
	errorMessage.set(message);
}

export function clearError() {
	errorMessage.set('');
}

// --- Loaded Licel data ---
// Map file id -> parsed/modified LicelFile of the current working dataset
export const licelFiles = writable(/** @type {Map<number, any>} */ (new Map()));

// --- Background removal state ---
export const backgroundRemoval = writable(
	/** @type {{ method: string, height: string, referenceFile: File | null }} */ ({
		method: 'average', // 'average' | 'median' | 'reference'
		height: '',
		referenceFile: null
	})
);

// --- Median filtering state ---
export const MEDIAN_WINDOW_MAX = 101;

export const medianFilter = writable(
	/** @type {{ windowSize: string }} */ ({
		windowSize: ''
	})
);

// --- Height crop state ---
export const cropByHeightConfig = writable(
	/** @type {{ maxHeight: string }} */ ({
		maxHeight: ''
	})
);

// --- Saved channel selection for graph windows ---
// Snapshot of channel visibility (channel name -> enabled) remembered from a
// graph window; applied to graph windows opened afterwards.
export const savedChannelSelection = writable(/** @type {Record<string, boolean> | null} */ (null));

/** @param {Record<string, boolean>} states */
export function rememberChannelSelection(states) {
	savedChannelSelection.set({ ...states });
}

// --- Actions ---
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
	licelFiles.set(nextData);

	await persistSession();
}

// --- Background removal helpers ---

/** Stable channel signature used to pair profiles across files.
 * @param {any} p
 */
function profileKey(p) {
	return `${p.deviceID || ''}|${p.wavelength || ''}|${p.polarization || ''}`;
}

/** Human-readable channel description (same convention as graph windows).
 * @param {any} p
 */
function profileLabel(p) {
	const mode =
		p.deviceID === 'BC' ? 'фотон' : p.deviceID === 'BT' ? 'аналог' : p.deviceID || 'канал';
	const pol = p.polarization ? ` (${p.polarization})` : '';
	return `${p.wavelength || '?'} нм${pol} · ${mode}`;
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
	/** @type {Map<string, any>} */
	let refChannels;
	try {
		const buffer = await referenceFile.arrayBuffer();
		const ref = loadLicelFileFromBuffer(new Uint8Array(buffer));
		refChannels = new Map();
		for (const p of ref.profiles ?? []) {
			if (p.active === false || !p.data || p.data.length === 0) continue;
			const key = profileKey(p);
			if (refChannels.has(key)) {
				showError(
					`В референсном файле "${referenceFile.name}" несколько каналов с одинаковыми параметрами (${profileLabel(p)}).`
				);
				return false;
			}
			refChannels.set(key, p);
		}
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		showError(`Не удалось прочитать референсный файл "${referenceFile.name}": ${detail}`);
		return false;
	}
	if (refChannels.size === 0) {
		showError(`В референсном файле "${referenceFile.name}" нет каналов с данными.`);
		return false;
	}
	for (const p of refChannels.values()) {
		for (let i = 0; i < p.data.length; i++) {
			if (!Number.isFinite(p.data[i])) {
				showError(
					`Канал ${profileLabel(p)} референсного файла "${referenceFile.name}" содержит нечисловые значения.`
				);
				return false;
			}
		}
	}
	for (const id of selected) {
		const lf = data.get(id);
		if (!lf) continue;
		const fileName = fileNames.get(id) ?? `#${id}`;
		for (const p of lf.profiles ?? []) {
			if (p.active === false || !p.data || p.data.length === 0) continue;
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
		}
	}
	for (const id of selected) {
		const lf = data.get(id);
		if (!lf) continue;
		for (const p of lf.profiles ?? []) {
			if (p.active === false || !p.data || p.data.length === 0) continue;
			subtractProfileReference(p, refChannels.get(profileKey(p)));
		}
	}
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
	for (const id of selected) {
		const lf = data.get(id);
		if (!lf) continue;
		const fileName = fileNames.get(id) ?? `#${id}`;
		for (const p of lf.profiles ?? []) {
			if (p.active === false || !p.data || p.data.length === 0) continue;
			if (!(p.binWidth > 0)) continue;
			const start = Math.floor(height / p.binWidth);
			if (start >= p.data.length) {
				showError(
					`Канал ${profileLabel(p)} файла "${fileName}" короче высоты начала (${height} м).`
				);
				return false;
			}
			for (let i = 0; i < p.data.length; i++) {
				if (!Number.isFinite(p.data[i])) {
					showError(`Канал ${profileLabel(p)} файла "${fileName}" содержит нечисловые значения.`);
					return false;
				}
			}
		}
	}
	for (const id of selected) {
		const lf = data.get(id);
		if (!lf) continue;
		for (const p of lf.profiles ?? []) {
			if (p.active === false || !p.data || p.data.length === 0) continue;
			if (!(p.binWidth > 0)) continue;
			subtractProfileStatistic(p, height, method);
		}
	}
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

	const selected = get(files)
		.filter((f) => f.selected)
		.map((f) => f.id);
	if (selected.length === 0) {
		showError('Не выделено ни одного файла.');
		return;
	}

	const data = get(licelFiles);
	/** @type {Map<number, string>} */
	const fileNames = new Map(get(files).map((f) => [f.id, f.name]));

	let ok = false;
	if (method === 'reference') {
		if (!referenceFile) {
			showError('Укажите референсный файл.');
			return;
		}
		ok = await subtractReferenceFromFiles(selected, fileNames, data, referenceFile);
	} else if (method === 'average' || method === 'median') {
		const bgHeight = /** @type {number} */ (height);
		if (!Number.isFinite(bgHeight) || bgHeight < 0) {
			showError('Укажите корректную высоту начала (неотрицательное число метров).');
			return;
		}
		ok = subtractStatisticFromFiles(selected, fileNames, data, bgHeight, method);
	} else {
		showError(`Неизвестный метод удаления фона: ${method}.`);
		return;
	}
	if (!ok) return;

	licelFiles.set(new Map(data));
	refreshFileSizes(selected);

	backgroundRemoval.set({ method: 'average', height: '', referenceFile: null });
	console.log('removeBackground', { method, height, referenceFile: referenceFile?.name, selected });
	await persistSession();
}

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
	const selected = get(files)
		.filter((f) => f.selected)
		.map((f) => f.id);
	if (selected.length === 0) {
		showError('Не выделено ни одного файла.');
		return;
	}

	const data = get(licelFiles);
	for (const id of selected) {
		const lf = data.get(id);
		if (!lf) continue;
		for (const p of lf.profiles ?? []) {
			if (p.active === false || !p.data || p.data.length === 0) continue;
			p.data = medianFilterValues(p.data, windowSize);
		}
	}
	licelFiles.set(new Map(data));

	medianFilter.set({ windowSize: '' });
	console.log('medianFiltering', { selected, windowSize });
	await persistSession();
}

export function mergeChannels() {
	// TODO: implement
	console.log(
		'mergeChannels',
		get(files)
			.filter((f) => f.selected)
			.map((f) => f.id)
	);
}

/**
 * Trim every channel of every selected file to the given maximum height (meters).
 * A profile whose length is already within the limit (or shorter than one bin)
 * is left untouched. Profiles are trimmed per their own bin width, so the same
 * distance may yield a different number of retained points per channel.
 * @param {number} maxHeight
 */
export async function cropByHeight(maxHeight) {
	const selected = get(files)
		.filter((f) => f.selected)
		.map((f) => f.id);
	if (selected.length === 0) {
		showError('Не выделено ни одного файла.');
		return;
	}
	if (!Number.isFinite(maxHeight) || maxHeight <= 0) {
		showError('Укажите корректную максимальную высоту.');
		return;
	}

	const data = get(licelFiles);
	for (const id of selected) {
		const lf = data.get(id);
		if (!lf) continue;
		for (const p of lf.profiles ?? []) {
			if (!(p.binWidth > 0) || !p.data || p.data.length === 0) continue;
			const total = Number.isFinite(p.nDataPoints) ? p.nDataPoints : p.data.length;
			const keep = Math.min(Math.floor(maxHeight / p.binWidth), total);
			if (keep >= total || keep < 1) continue;
			p.data = p.data.slice(0, keep);
			p.nDataPoints = p.data.length;
		}
	}
	licelFiles.set(new Map(data));
	refreshFileSizes(selected);

	cropByHeightConfig.set({ maxHeight: '' });
	console.log('cropByHeight', { selected, maxHeight });
	await persistSession();
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
		const bytes = savePackToZipBuffer(pack);
		console.log('savePackToZip', { files: [...packData.keys()] });
		return bytes;
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		showError(`Не удалось сохранить архив: ${detail}`);
		return null;
	}
}

// --- Zip loading & session persistence ---

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
 * Parse a zip archive into the file list. Returns success. Shows errors in the dialog.
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
		licelFiles.set(fileMap);
		savedChannelSelection.set(null);
		console.log('openFiles', { zipName: label, files: items });
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
	const ok = loadPackFromZip(new Uint8Array(buffer), zipName);
	if (ok) await persistSession();
	return ok;
}

/**
 * Save the current working dataset (files + parsed LicelFile data) to IndexedDB.
 * Called after loading a zip and after every operation that changes the data.
 */
export async function persistSession() {
	const current = get(files);
	const data = get(licelFiles);

	/** @type {Array<{ id: number, name: string, size: string, selected: boolean, lf: any }>} */
	const rows = [];
	for (const f of current) {
		const lf = data.get(f.id);
		if (!lf) continue;
		rows.push({
			id: f.id,
			name: f.name,
			size: formatSize(licelFileBytes(lf)),
			selected: false,
			lf
		});
	}

	try {
		await saveSession({ version: 1, rows });
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		showError(`Не удалось сохранить данные в браузере: ${detail}`);
	}
}

let restoreStarted = false;

/**
 * Restore the previously persisted dataset on application start (client only).
 */
export async function restoreSession() {
	if (restoreStarted) return;
	restoreStarted = true;

	/** @type {any} */
	let snapshot = null;
	try {
		snapshot = await loadSession();
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		console.error('restoreSession: failed to load', detail);
		return;
	}
	if (!snapshot || !Array.isArray(snapshot.rows)) return;

	const items = [];
	const fileMap = new Map();
	let maxId = 0;
	for (const item of snapshot.rows) {
		if (!item || typeof item.name !== 'string' || !item.lf) continue;
		const id = Number.isFinite(item.id) ? item.id : nextId++;
		items.push({
			id,
			name: item.name,
			size: typeof item.size === 'string' ? item.size : '—',
			selected: false
		});
		fileMap.set(id, item.lf);
		maxId = Math.max(maxId, id);
	}

	nextId = maxId + 1;
	files.set(items);
	licelFiles.set(fileMap);
}

// --- NonModalWindow actions ---
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
			payload
		}
	]);
}

/** @param {number} id */
export function removeWindow(id) {
	const current = get(openWindows);
	openWindows.set(current.filter((w) => w.id !== id));
}
