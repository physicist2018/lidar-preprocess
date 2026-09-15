import {
	newSessionId,
	kvGet,
	kvSet,
	storageListSessions,
	storageGetSessionMeta,
	storagePutSessionMeta,
	storageGetSessionData,
	storagePutSessionData,
	storagePutBackupData,
	storageGetBackupData,
	storageDeleteSession,
	storageQuarantineData,
	storageMigrateLegacy
} from './storage';
import {
	emptySnapshot,
	captureSnapshot,
	migrateSnapshot,
	applySnapshot,
	estimateSnapshotBytes,
	SCHEMA_VERSION
} from './snapshot';
import { sanitizeSnapshot } from './snapshot-core';
import { get } from 'svelte/store';
import {
	files,
	openWindows,
	licelFiles,
	zenithAngle,
	savedChannelSelection,
	savedYScale,
	molecularState,
	leftPanelPercent,
	showError
} from './store';

const APP_VERSION = '1';

/** @typedef {import('./storage').SessionMeta} SessionMeta */

/**
 * @typedef {{
 *   needName?: true,
 *   conflict?: true,
 *   deleted?: true,
 *   error?: true,
 *   saved?: true,
 *   id?: string,
 *   name?: string
 * }} SaveResult
 */

/**
 * @typedef {{
 *   ok?: true,
 *   warnings?: string[],
 *   missing?: true,
 *   corrupt?: true,
 *   unsupported?: true,
 *   name?: string
 * }} OpenResult
 */

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

/** @type {string | null} */
let activeSessionId = null;
let activeRevision = 0;

/** Whether the in-memory workspace differs from the last saved snapshot. */
let dirty = false;

/** @type {Array<any>} */
const dirtyStores = [
	files,
	openWindows,
	zenithAngle,
	savedChannelSelection,
	savedYScale,
	molecularState,
	leftPanelPercent,
	licelFiles
];

/**
 * Subscribe to every workspace store so unsaved changes can be detected.
 * `svelte/store` subscriptions replay the current value on subscribe, so each
 * store remembers its value and only marks the workspace dirty when the value
 * reference actually changes.
 */
export function initWorkspaceDirtyWatch() {
	/** @type {Map<any, any>} */
	const lastSeen = new Map();
	for (const store of dirtyStores) {
		lastSeen.set(store, get(store));
		store.subscribe((/** @type {any} */ val) => {
			if (val === lastSeen.get(store)) return;
			lastSeen.set(store, val);
			dirty = true;
		});
	}
}

/** @returns {boolean} */
export function isDirty() {
	return dirty;
}

function markClean() {
	dirty = false;
}

/** @returns {string | null} id of the active session, if any */
export function getActiveSessionId() {
	return activeSessionId;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Open the storage, migrate legacy data and return boot information.
 * @returns {Promise<{ activeSessionId: string | null, autoOpenLast: boolean, hasSessions: boolean }>}
 */
export async function boot() {
	let migratedId = null;
	try {
		migratedId = await storageMigrateLegacy();
	} catch {
		migratedId = null;
	}
	if (migratedId) activeSessionId = migratedId;

	if (!activeSessionId) {
		const saved = await kvGet('activeSessionId', null);
		if (typeof saved === 'string') activeSessionId = saved;
	}
	if (!activeSessionId || !(await storageGetSessionMeta(activeSessionId))) {
		activeSessionId = null;
		await kvSet('activeSessionId', null);
	}

	const metas = await storageListSessions();
	return {
		activeSessionId,
		autoOpenLast: (await kvGet('autoOpenLast', false)) === true,
		hasSessions: metas.length > 0
	};
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

/**
 * Sorted session list for the picker: the default session first, the rest by
 * most recently updated.
 * @returns {Promise<Array<object>>}
 */
export async function listSessions() {
	const metas = await storageListSessions();
	return metas
		.map((m) => ({
			id: m.id,
			name: m.name,
			createdAt: m.createdAt,
			updatedAt: m.updatedAt,
			lastOpenedAt: m.lastOpenedAt,
			isDefault: m.isDefault === true,
			filesCount: Number.isFinite(m.filesCount) ? m.filesCount : 0,
			windowsCount: Number.isFinite(m.windowsCount) ? m.windowsCount : 0,
			dataBytes: Number.isFinite(m.dataBytes) ? m.dataBytes : 0
		}))
		.sort((a, b) => {
			if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
			return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
		});
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

function defaultName() {
	return 'Сессия';
}

/**
 * @param {string} id
 * @param {string} name
 * @param {{ files: any[], windows: any[] }} snapshot
 * @param {string} now
 * @returns {SessionMeta}
 */
function buildMeta(id, name, snapshot, now) {
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
		appVersion: APP_VERSION,
		schemaVersion: SCHEMA_VERSION
	};
}

/**
 * Create a new empty session, make it active and reset the workspace.
 * @param {string} [name]
 * @returns {Promise<object>}
 */
export async function createSession(name = '') {
	const id = newSessionId();
	const now = new Date().toISOString();
	const snapshot = emptySnapshot();
	const meta = buildMeta(id, name.trim() || defaultName(), snapshot, now);
	await storagePutSessionData(id, snapshot);
	await storagePutSessionMeta(meta);
	activeSessionId = id;
	activeRevision = 0;
	await kvSet('activeSessionId', id);
	applySnapshot(snapshot);
	markClean();
	return meta;
}

/**
 * Persist the current workspace into the active session. Manual save only.
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<SaveResult>}
 */
export async function saveActiveSession(options = {}) {
	if (!activeSessionId) return { needName: true };
	const meta = await storageGetSessionMeta(activeSessionId);
	if (!meta) return { deleted: true };
	return saveTo(activeSessionId, meta, options);
}

/**
 * Save the current workspace into a newly created session and make it active.
 * @param {string} [name]
 * @returns {Promise<object>}
 */
export async function saveSessionAs(name = '') {
	const id = newSessionId();
	const now = new Date().toISOString();
	const snapshot = captureSnapshot();
	const meta = buildMeta(id, name.trim() || defaultName(), snapshot, now);
	await storagePutSessionData(id, snapshot);
	await storagePutSessionMeta(meta);
	activeSessionId = id;
	activeRevision = meta.revision;
	await kvSet('activeSessionId', id);
	markClean();
	return meta;
}

/**
 * @param {string} id
 * @param {SessionMeta} meta
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<SaveResult>}
 */
async function saveTo(id, meta, options = {}) {
	if (!options.force && activeRevision < meta.revision) {
		return { conflict: true, name: meta.name };
	}

	const snapshot = captureSnapshot();
	const previous = await storageGetSessionData(id);
	if (previous) {
		try {
			await storagePutBackupData(id, previous);
		} catch {
			// Backing up is best-effort; a quota error must not block the save.
		}
	}
	const now = new Date().toISOString();
	try {
		await storagePutSessionData(id, snapshot);
		await storagePutSessionMeta({
			...meta,
			updatedAt: now,
			lastOpenedAt: now,
			revision: meta.revision + 1,
			filesCount: snapshot.files.length,
			windowsCount: snapshot.windows.length,
			dataBytes: estimateSnapshotBytes(snapshot)
		});
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		showError(`Не удалось сохранить сессию «${meta.name}»: ${detail}`);
		return { error: true, name: meta.name };
	}
	activeSessionId = id;
	activeRevision = meta.revision + 1;
	await kvSet('activeSessionId', id);
	markClean();
	return { saved: true, id };
}

/**
 * Load a saved session into the workspace.
 * @param {string} id
 * @returns {Promise<OpenResult>}
 */
export async function openSession(id) {
	const meta = await storageGetSessionMeta(id);
	if (!meta) return { missing: true };

	let data = await storageGetSessionData(id);
	if (!data) data = await storageGetBackupData(id);
	if (!data) return { missing: true };

	const { snapshot, error } = migrateSnapshot(data);
	if (error) return { unsupported: true, name: meta.name };

	const cleaned = sanitizeSnapshot(snapshot);
	const emptied = cleaned.snapshot.files.length === 0 && cleaned.snapshot.windows.length === 0;
	if (emptied && cleaned.warnings.length > 0) {
		try {
			await storageQuarantineData(id, data);
		} catch {
			// Best effort; the session stays closed either way.
		}
		return { corrupt: true, name: meta.name };
	}

	activeSessionId = id;
	activeRevision = meta.revision;
	applySnapshot(cleaned.snapshot);
	await storagePutSessionMeta({
		...meta,
		lastOpenedAt: new Date().toISOString()
	});
	await kvSet('activeSessionId', id);
	markClean();
	return { ok: true, warnings: cleaned.warnings };
}

/**
 * Start a blank workspace without any active session.
 * @returns {Promise<void>}
 */
export async function beginEmptySession() {
	activeSessionId = null;
	activeRevision = 0;
	await kvSet('activeSessionId', null);
	applySnapshot(emptySnapshot());
	markClean();
}

/** @param {string} id @param {string} name @returns {Promise<{ missing: boolean }>} */
export async function renameSession(id, name) {
	const meta = await storageGetSessionMeta(id);
	if (!meta) return { missing: true };
	await storagePutSessionMeta({ ...meta, name: (name || '').trim() || meta.name });
	return { missing: false };
}

/** @param {string} id @returns {Promise<boolean>} */
export async function deleteSession(id) {
	await storageDeleteSession(id);
	const wasActive = activeSessionId === id;
	if (wasActive) {
		activeSessionId = null;
		activeRevision = 0;
		await kvSet('activeSessionId', null);
	}
	return wasActive;
}

/**
 * Duplicate a session (data and metadata) under a new id.
 * @param {string} id @returns {Promise<object | null>}
 */
export async function copySession(id) {
	const meta = await storageGetSessionMeta(id);
	const data = await storageGetSessionData(id);
	if (!meta) return null;
	const newId = newSessionId();
	const now = new Date().toISOString();
	const snapshot = data || emptySnapshot();
	const clean = sanitizeSnapshot(snapshot).snapshot;
	await storagePutSessionData(newId, clean);
	await storagePutSessionMeta({
		...buildMeta(newId, `Копия ${meta.name}`, clean, now),
		createdAt: now,
		revision: 0
	});
	return { id: newId };
}

/**
 * Mark a session as the default (highlighted in the picker). At most one.
 * @param {string | null} id
 */
export async function setDefaultSession(id) {
	for (const m of await storageListSessions()) {
		if (!m || typeof m.id !== 'string') continue;
		const isDefault = m.id === id;
		if (m.isDefault === isDefault) continue;
		await storagePutSessionMeta({ ...m, isDefault });
	}
}

// ---------------------------------------------------------------------------
// Global prefs
// ---------------------------------------------------------------------------

/** @returns {Promise<boolean>} */
export async function getAutoOpenLast() {
	return (await kvGet('autoOpenLast', false)) === true;
}

/** @param {boolean} value */
export async function setAutoOpenLast(value) {
	await kvSet('autoOpenLast', value === true);
}
