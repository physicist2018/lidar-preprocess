import {
	buildSessionArchive,
	parseSessionArchive,
	rehydrateSnapshot,
	sanitizeFileName
} from './session-archive';
import { migrateSnapshot, estimateSnapshotBytes, SCHEMA_VERSION } from './snapshot';
import { sanitizeSnapshot } from './snapshot-core';
import {
	newSessionId,
	storageGetSessionMeta,
	storageGetSessionData,
	storageGetBackupData,
	storagePutSessionData,
	storagePutSessionMeta,
	storageDeleteSession
} from './storage';
import { openSession, listSessions } from './sessions';
import { fileNameStamp } from '$lib/format';

const APP_VERSION = '1';

/** @typedef {{ ok: false, code: string, message: string }} TransferFailure */
/** @typedef {{ ok: true, bytes: Uint8Array, fileName: string }} ExportOk */
/** @typedef {{ ok: true, id: string, name: string, warnings: string[] }} ImportOk */

/** @param {any} err @returns {boolean} */
function isQuotaError(err) {
	const name = String(err?.name ?? '');
	const message = String(err?.message ?? '');
	return name === 'QuotaExceededError' || /quota/i.test(`${name} ${message}`);
}

/**
 * Build a session ZIP archive from the stored snapshot of a session.
 * Never touches the live workspace; the stored record is read-only.
 * @param {string} id
 * @returns {Promise<ExportOk | TransferFailure>}
 */
export async function exportSessionToArchive(id) {
	const meta = await storageGetSessionMeta(id);
	if (!meta) {
		return {
			ok: false,
			code: 'missing',
			message: 'Сессия не найдена. Возможно, она была удалена в другой вкладке.'
		};
	}

	const data = (await storageGetSessionData(id)) || (await storageGetBackupData(id));
	if (!data) {
		return {
			ok: false,
			code: 'missing',
			message: 'Данные сессии не найдены.'
		};
	}

	const built = await buildSessionArchive(data, { name: meta.name, sourceId: meta.id });
	if (!built.ok) return built;

	return {
		ok: true,
		bytes: built.bytes,
		fileName: `${sanitizeFileName(meta.name)}_${fileNameStamp()}.zip`
	};
}

/**
 * Import a session ZIP archive as a new session. Everything is validated in
 * memory first; the session is written to storage only after the archive and
 * its snapshot pass all checks, and a failed write is rolled back.
 * @param {Uint8Array} bytes
 * @returns {Promise<ImportOk | TransferFailure>}
 */
export async function importSessionFromArchive(bytes) {
	const parsed = await parseSessionArchive(bytes);
	if (!parsed.ok) return parsed;

	const migrated = migrateSnapshot(parsed.snapshot);
	if (migrated.error) {
		return { ok: false, code: 'unsupported', message: migrated.error };
	}

	const cleaned = sanitizeSnapshot(migrated.snapshot);
	// Warnings collected before rehydration: all further steps reuse the same
	// pipeline as a regular session open.
	const snapshot = rehydrateSnapshot(cleaned.snapshot);

	const name = await uniqueSessionName(parsed.manifest.name);
	const meta = buildMeta(name, snapshot, { source: parsed.manifest });

	try {
		await storagePutSessionData(meta.id, snapshot);
	} catch (err) {
		if (isQuotaError(err)) {
			return { ok: false, code: 'quota', message: 'Не хватает места для импорта сессии.' };
		}
		return {
			ok: false,
			code: 'error',
			message: `Не удалось импортировать сессию: ${err instanceof Error ? err.message : String(err)}`
		};
	}

	try {
		await storagePutSessionMeta(meta);
	} catch (err) {
		try {
			await storageDeleteSession(meta.id);
		} catch {
			// Best effort rollback.
		}
		if (isQuotaError(err)) {
			return { ok: false, code: 'quota', message: 'Не хватает места для импорта сессии.' };
		}
		return {
			ok: false,
			code: 'error',
			message: `Не удалось импортировать сессию: ${err instanceof Error ? err.message : String(err)}`
		};
	}

	/** @type {string[]} */
	const warnings = [...cleaned.warnings];
	const opened = await openSession(meta.id);
	if (opened.ok && Array.isArray(opened.warnings)) warnings.push(...opened.warnings);
	return { ok: true, id: meta.id, name: meta.name, warnings };
}

/**
 * @param {string} base
 * @returns {Promise<string>} an unused session name, appending (N) on clash
 */
async function uniqueSessionName(base) {
	const names = new Set((await listSessions()).map((/** @type {any} */ m) => m.name));
	if (!names.has(base)) return base;
	let n = 2;
	while (names.has(`${base} (${n})`)) n += 1;
	return `${base} (${n})`;
}

/**
 * @param {string} name
 * @param {any} snapshot
 * @param {{ source: { schemaVersion?: number, appVersion?: string } }} options
 */
function buildMeta(name, snapshot, options) {
	const id = newSessionId();
	const now = new Date().toISOString();
	return {
		id,
		name,
		createdAt: now,
		updatedAt: now,
		lastOpenedAt: now,
		isDefault: false,
		revision: 0,
		filesCount: snapshot.files.length,
		windowsCount: snapshot.windows.length,
		dataBytes: estimateSnapshotBytes(snapshot),
		appVersion:
			typeof options.source?.appVersion === 'string' ? options.source.appVersion : APP_VERSION,
		schemaVersion: Number.isFinite(options.source?.schemaVersion)
			? Number(options.source.schemaVersion)
			: SCHEMA_VERSION
	};
}
