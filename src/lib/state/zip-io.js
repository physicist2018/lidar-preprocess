import { get } from 'svelte/store';
import { newLicelPackFromZipBuffer, savePackToZipBuffer } from 'licelfile-js';
import {
	files,
	licelFiles,
	savedChannelSelection,
	savedYScale,
	publishLicelData,
	showError,
	nextFileId
} from './store';
import { formatBytes } from '$lib/format';

/** @param {string} name */
function basename(name) {
	const idx = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
	return idx >= 0 ? name.slice(idx + 1) : name;
}

/** @param {any} lf */
export function licelFileBytes(lf) {
	let bytes = 256; // header overhead approximation
	for (const p of lf.profiles) {
		bytes += (p.nDataPoints || 0) * 4;
	}
	return bytes;
}

/**
 * Recompute the displayed size of the given files after a data-modifying operation.
 * @param {number[]} [ids] File ids to refresh; defaults to every file.
 */
export function refreshFileSizes(ids) {
	const current = get(files);
	const data = get(licelFiles);
	const idSet = ids ? new Set(ids) : null;
	files.set(
		current.map((f) => {
			if (idSet && !idSet.has(f.id)) return f;
			const lf = data.get(f.id);
			if (!lf) return f;
			return { ...f, size: formatBytes(licelFileBytes(lf)) };
		})
	);
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
			const id = nextFileId();
			const name = path.replace(/^\/+/, '');
			items.push({ id, name, size: formatBytes(licelFileBytes(lf)), selected: false });
			fileMap.set(id, lf);
		}

		files.set(items);
		publishLicelData(fileMap, null);
		savedChannelSelection.set(null);
		savedYScale.set('linear');
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
