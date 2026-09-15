import { zipSync, unzipSync } from 'fflate';

/** Unique marker of the archive format in `manifest.json`. */
export const ARCHIVE_FORMAT = 'lidar-session';

/** Current version of the ZIP container layout. Bump on breaking changes. */
export const FORMAT_VERSION = 1;

/** Hard cap on the whole archive size, guards against zip bombs. */
export const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

/** Hard cap on the number of entries inside the archive. */
export const MAX_ARCHIVE_ENTRIES = 10_000;

export const ARCHIVE_ENTRY_MANIFEST = 'manifest.json';
export const ARCHIVE_ENTRY_SNAPSHOT = 'session.json';

/**
 * @typedef {{
 *   format: string,
 *   formatVersion: number,
 *   exporter: string,
 *   appVersion: string,
 *   schemaVersion: number,
 *   exportedAt: string,
 *   name: string,
 *   sourceId: string | null,
 *   bytes: number,
 *   checksums: { sessionJson: string }
 * }} SessionManifest
 */

/** @typedef {{ ok: false, code: string, message: string }} ArchiveFailure */
/** @typedef {{ ok: true, bytes: Uint8Array, manifest: SessionManifest }} ArchiveBuildResult */
/** @typedef {{ ok: true, manifest: SessionManifest, snapshot: any }} ArchiveParseResult */

/** @param {Uint8Array} data @returns {Promise<string>} lowercase hex sha-256 */
export async function sha256Hex(data) {
	const digest = await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (data));
	const bytes = new Uint8Array(digest);
	let out = '';
	for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
	return out;
}

/**
 * Clean a session name into a safe download file name (no path separators or
 * control characters, bounded length).
 * @param {string} [name]
 * @returns {string}
 */
export function sanitizeFileName(name = '') {
	const cleaned = name
		.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '_')
		.replace(/\s+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^[._\s]+|[._\s]+$/g, '')
		.slice(0, 64);
	return cleaned || 'session';
}

/**
 * Convert a snapshot into a fresh JSON-safe tree: typed arrays become plain
 * number arrays (typed arrays otherwise serialize as inflated `{"0":…}`
 * objects), Maps become record-style objects, Dates are cloned. The input is
 * never mutated, so exports cannot disturb the stored session.
 * @param {any} value
 * @param {Map<any, any>} [seen]
 * @returns {any}
 */
function dehydrateSnapshot(value, seen = new Map()) {
	if (value === null || typeof value !== 'object') return value;
	if (value instanceof Date) return new Date(value.getTime());
	if (ArrayBuffer.isView(value)) {
		return Array.from(/** @type {any} */ (value));
	}
	if (seen.has(value)) return seen.get(value);
	if (value instanceof Map) {
		/** @type {Record<string, any>} */
		const out = {};
		seen.set(value, out);
		for (const [k, v] of value) out[String(k)] = dehydrateSnapshot(v, seen);
		return out;
	}
	if (Array.isArray(value)) {
		/** @type {Array<any>} */
		const out = [];
		seen.set(value, out);
		for (const v of value) out.push(dehydrateSnapshot(v, seen));
		return out;
	}
	/** @type {Record<string, any>} */
	const out = {};
	seen.set(value, out);
	for (const k of Object.keys(value)) out[k] = dehydrateSnapshot(value[k], seen);
	return out;
}

/**
 * Serialize a snapshot (as kept in IndexedDB, with Float64Array profile data
 * and Date fields) into a session ZIP archive.
 * @param {any} snapshot
 * @param {{ name?: string, sourceId?: string | null }} [options]
 * @returns {Promise<ArchiveBuildResult | ArchiveFailure>}
 */
export async function buildSessionArchive(snapshot, options = {}) {
	try {
		const snapshotJson = JSON.stringify(dehydrateSnapshot(snapshot));
		const snapshotBytes = new TextEncoder().encode(snapshotJson);
		if (snapshotBytes.byteLength > MAX_ARCHIVE_BYTES) {
			return {
				ok: false,
				code: 'too-large',
				message: 'Сессия слишком большая для экспорта.'
			};
		}

		const sessionJsonSha = await sha256Hex(snapshotBytes);
		/** @type {SessionManifest} */
		const manifest = {
			format: ARCHIVE_FORMAT,
			formatVersion: FORMAT_VERSION,
			exporter: 'lidar-sveltekit',
			appVersion: typeof snapshot?.appVersion === 'string' ? snapshot.appVersion : '1',
			schemaVersion: typeof snapshot?.schemaVersion === 'number' ? snapshot.schemaVersion : 1,
			exportedAt: new Date().toISOString(),
			name:
				typeof options.name === 'string' && options.name.trim() ? options.name.trim() : 'Сессия',
			sourceId: typeof options.sourceId === 'string' ? options.sourceId : null,
			bytes: snapshotBytes.byteLength,
			checksums: { sessionJson: sessionJsonSha }
		};

		const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
		const bytes = zipSync({
			[ARCHIVE_ENTRY_MANIFEST]: manifestBytes,
			[ARCHIVE_ENTRY_SNAPSHOT]: snapshotBytes
		});
		return { ok: true, bytes, manifest };
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			code: 'error',
			message: `Не удалось собрать архив: ${detail}`
		};
	}
}

/**
 * Validate and parse a session ZIP archive. Returns the raw snapshot (JSON
 * shape: profile data and meteo vectors are plain arrays, dates are strings);
 * run `rehydrateSnapshot` on the result before applying it.
 * @param {Uint8Array} bytes
 * @returns {Promise<ArchiveParseResult | ArchiveFailure>}
 */
export async function parseSessionArchive(bytes) {
	if (!bytes || bytes.byteLength === 0) {
		return { ok: false, code: 'empty', message: 'Файл пуст.' };
	}
	if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
		return {
			ok: false,
			code: 'too-large',
			message: 'Архив слишком большой (больше 1 ГБ).'
		};
	}

	/** @type {Record<string, Uint8Array>} */
	let entries;
	try {
		entries = unzipSync(bytes);
	} catch {
		return {
			ok: false,
			code: 'not-a-session',
			message: 'Файл не является архивом сессии (это не валидный ZIP).'
		};
	}

	const names = Object.keys(entries);
	if (names.length > MAX_ARCHIVE_ENTRIES) {
		return {
			ok: false,
			code: 'too-large',
			message: 'В архиве слишком много файлов.'
		};
	}

	const manifestBytes = entries[ARCHIVE_ENTRY_MANIFEST];
	if (!manifestBytes) {
		return {
			ok: false,
			code: 'not-a-session',
			message: 'Файл не является архивом сессии (нет manifest.json).'
		};
	}

	/** @type {SessionManifest} */
	let manifest;
	try {
		manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
	} catch {
		return {
			ok: false,
			code: 'not-a-session',
			message: 'Файл не является архивом сессии (битый manifest.json).'
		};
	}

	if (manifest?.format !== ARCHIVE_FORMAT) {
		return {
			ok: false,
			code: 'not-a-session',
			message: 'Файл не является архивом сессии. Возможно, это архив данных Licel.'
		};
	}
	if (!Number.isFinite(manifest.formatVersion) || manifest.formatVersion > FORMAT_VERSION) {
		return {
			ok: false,
			code: 'unsupported',
			message: 'Архив создан более новой версией приложения.'
		};
	}

	const snapshotBytes = entries[ARCHIVE_ENTRY_SNAPSHOT];
	if (!snapshotBytes) {
		return {
			ok: false,
			code: 'corrupt',
			message: 'Архив повреждён (нет session.json).'
		};
	}

	if (manifest.checksums?.sessionJson) {
		const actual = await sha256Hex(snapshotBytes);
		if (actual !== manifest.checksums.sessionJson) {
			return {
				ok: false,
				code: 'corrupt',
				message: 'Архив повреждён или усечён (контрольная сумма не совпадает).'
			};
		}
	}

	/** @type {any} */
	let snapshot;
	try {
		snapshot = JSON.parse(new TextDecoder().decode(snapshotBytes));
	} catch {
		return {
			ok: false,
			code: 'corrupt',
			message: 'Архив повреждён (битые данные сессии).'
		};
	}

	return { ok: true, manifest, snapshot };
}

/** @param {any} value @returns {boolean} */
function isJsonArrayOfNumbers(value) {
	return Array.isArray(value) && value.every((v) => typeof v === 'number');
}

/**
 * Accept either a plain JSON array or the `{"0":…}` index-keyed object that
 * naive JSON.stringify produces for typed arrays.
 * @param {any} value @returns {number[] | null}
 */
function numericListOf(value) {
	if (Array.isArray(value)) {
		return isJsonArrayOfNumbers(value) ? value : null;
	}
	if (value && typeof value === 'object') {
		const keys = Object.keys(value);
		if (keys.length === 0) return null;
		if (!keys.every((k) => /^(0|[1-9]\d*)$/.test(k))) return null;
		/** @type {number[]} */
		const out = [];
		for (const k of keys) {
			if (typeof value[k] !== 'number') return null;
			out.push(value[k]);
		}
		return out;
	}
	return null;
}

/** @param {any} value @returns {Float64Array} */
function toFloat64(value) {
	return Float64Array.from(/** @type {number[]} */ (value));
}

/**
 * Convert a snapshot parsed from JSON back into the in-memory shape: numeric
 * arrays become Float64Array, ISO date strings become Date. Mutates and returns
 * the input (the snapshot comes from a fresh JSON.parse, so no shared state).
 * @param {any} snapshot
 * @returns {any}
 */
export function rehydrateSnapshot(snapshot) {
	if (!snapshot || typeof snapshot !== 'object') return snapshot;

	const files = Array.isArray(snapshot.files) ? snapshot.files : [];
	for (const f of files) {
		const lf = f?.lf;
		if (!lf || typeof lf !== 'object') continue;
		for (const dateKey of ['measurementStartTime', 'measurementStopTime']) {
			const v = lf[dateKey];
			if (typeof v === 'string') {
				const parsed = new Date(v);
				if (Number.isFinite(parsed.getTime())) lf[dateKey] = parsed;
			}
		}
		const profiles = Array.isArray(lf.profiles) ? lf.profiles : [];
		for (const p of profiles) {
			const list = p && numericListOf(p.data);
			if (list) p.data = toFloat64(list);
		}
	}

	const meteo = snapshot?.settings?.molecular?.meteo;
	if (meteo && typeof meteo === 'object') {
		for (const key of ['heights', 'press', 'temp']) {
			const list = numericListOf(meteo[key]);
			if (list) meteo[key] = toFloat64(list);
		}
	}
	return snapshot;
}
