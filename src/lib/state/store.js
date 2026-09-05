import { writable, get } from 'svelte/store';
import { newLicelPackFromZipBuffer } from 'licelfile-js';
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

/**
 * @param {{ method?: string, height?: number | null, referenceFile?: File | null }} [params]
 */
export function removeBackground(params) {
	// params: { method, height, referenceFile }
	const selected = get(files)
		.filter((f) => f.selected)
		.map((f) => f.id);
	console.log('removeBackground', { selected, ...params });
	// TODO: mutate profile data (background subtraction), then persist the new state:
	// await persistSession();
	// Reset state
	backgroundRemoval.set({ method: 'average', height: '', referenceFile: null });
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

export function cropByHeight() {
	// TODO: implement
	console.log(
		'cropByHeight',
		get(files)
			.filter((f) => f.selected)
			.map((f) => f.id)
	);
	// TODO: after trimming profile data, persist the new state:
	// await persistSession();
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
