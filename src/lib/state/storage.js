const DB_NAME = 'lidar-viewer';
const DB_VERSION = 2;

const STORE_KV = 'kv';
const STORE_SESSIONS = 'sessions';
const STORE_SESSION_DATA = 'sessionData';
const STORE_LEGACY_SESSION = 'session';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   lastOpenedAt: string | null,
 *   isDefault: boolean,
 *   revision: number,
 *   filesCount: number,
 *   windowsCount: number,
 *   dataBytes: number,
 *   appVersion: string,
 *   schemaVersion: number
 * }} SessionMeta
 */

// Smallest unused integer for new session ids.
let idCounter = 0;

/** @returns {string} a new unique session id */
export function newSessionId() {
	idCounter += 1;
	const ts = Date.now().toString(36) + idCounter.toString(36);
	try {
		return crypto.randomUUID();
	} catch {
		return `session-${ts}`;
	}
}

function openDb() {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB недоступна в этом окружении'));
			return;
		}
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			for (const store of [STORE_KV, STORE_SESSIONS, STORE_SESSION_DATA, STORE_LEGACY_SESSION]) {
				if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error('Не удалось открыть IndexedDB'));
	});
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/**
 * Open a read-only transaction and hand the caller the tx plus resolvers.
 * Matches the request/onsuccess pattern proven in the previous build: reads
 * resolve as soon as the underlying request finishes.
 * @param {string} storeName
 * @param {(tx: any, ok: (value: any) => void, fail: (err: any) => void, close: () => void) => void} fn
 * @returns {Promise<any>}
 */
async function withReadTx(storeName, fn) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readonly');
		const close = () => db.close();
		const fail = (/** @type {any} */ err) => {
			close();
			reject(err);
		};
		const ok = (/** @type {any} */ value) => {
			close();
			resolve(value);
		};
		try {
			fn(tx, ok, fail, close);
		} catch (err) {
			close();
			reject(err);
		}
	});
}

/**
 * Queue writes inside a read-write transaction and resolve when it commits.
 * @param {string} storeName
 * @param {(tx: any) => void} fn
 * @returns {Promise<void>}
 */
async function withWriteTx(storeName, fn) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, 'readwrite');
		try {
			fn(tx);
		} catch (err) {
			db.close();
			reject(err);
			return;
		}
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error || new Error(`Транзакция ${storeName} не удалась`));
		};
	});
}

// ---------------------------------------------------------------------------
// Key-value globals
// ---------------------------------------------------------------------------

/** @param {string} key @param {any} [fallback] @returns {Promise<any>} */
export async function kvGet(key, fallback = null) {
	return withReadTx(STORE_KV, (tx, ok, fail) => {
		const req = tx.objectStore(STORE_KV).get(key);
		req.onsuccess = () => ok(req.result === undefined ? fallback : req.result);
		req.onerror = () => fail(req.error || new Error(`Ошибка чтения kv/${key}`));
	});
}

/** @param {string} key @param {any} value @returns {Promise<void>} */
export async function kvSet(key, value) {
	return withWriteTx(STORE_KV, (tx) => {
		tx.objectStore(STORE_KV).put(value, key);
	});
}

// ---------------------------------------------------------------------------
// Session metadata
// ---------------------------------------------------------------------------

/** @returns {Promise<Array<SessionMeta>>} */
export async function storageListSessions() {
	return withReadTx(STORE_SESSIONS, (tx, ok, fail) => {
		const req = tx.objectStore(STORE_SESSIONS).getAll();
		req.onsuccess = () => ok(req.result ?? []);
		req.onerror = () => fail(req.error || new Error('Ошибка чтения sessions'));
	});
}

/** @param {string} id @returns {Promise<SessionMeta | null>} */
export async function storageGetSessionMeta(id) {
	return withReadTx(STORE_SESSIONS, (tx, ok, fail) => {
		const req = tx.objectStore(STORE_SESSIONS).get(id);
		req.onsuccess = () => ok(req.result === undefined ? null : req.result);
		req.onerror = () => fail(req.error || new Error(`Ошибка чтения sessions/${id}`));
	});
}

/** @param {SessionMeta} meta @returns {Promise<void>} */
export async function storagePutSessionMeta(meta) {
	const id = meta.id;
	return withWriteTx(STORE_SESSIONS, (tx) => {
		tx.objectStore(STORE_SESSIONS).put(meta, id);
	});
}

// ---------------------------------------------------------------------------
// Session data (snapshots) + reliability slots
// ---------------------------------------------------------------------------

/**
 * @param {string} id
 * @param {string} prefix key prefix used for slot records ('' for the main one)
 * @returns {Promise<any | null>}
 */
function readSlot(id, prefix) {
	const key = `${prefix}${id}`;
	return withReadTx(STORE_SESSION_DATA, (tx, ok, fail) => {
		const req = tx.objectStore(STORE_SESSION_DATA).get(key);
		req.onsuccess = () => ok(req.result === undefined ? null : req.result);
		req.onerror = () => fail(req.error || new Error(`Ошибка чтения sessionData/${key}`));
	});
}

/**
 * @param {string} id
 * @param {string} prefix
 * @param {any} data
 * @returns {Promise<void>}
 */
function writeSlot(id, prefix, data) {
	const key = `${prefix}${id}`;
	return withWriteTx(STORE_SESSION_DATA, (tx) => {
		tx.objectStore(STORE_SESSION_DATA).put(data, key);
	});
}

/** @param {string} id @param {any} data @returns {Promise<void>} */
export async function storagePutSessionData(id, data) {
	return writeSlot(id, '', data);
}

/** @param {string} id @returns {Promise<any | null>} */
export async function storageGetSessionData(id) {
	return readSlot(id, '');
}

/** @param {string} id @returns {Promise<any | null>} */
export async function storageGetBackupData(id) {
	return readSlot(id, 'backup:');
}

/** @param {string} id @param {any} data @returns {Promise<void>} */
export async function storagePutBackupData(id, data) {
	return writeSlot(id, 'backup:', data);
}

/**
 * Move a broken snapshot out of the way so it stops breaking every restore.
 * @param {string} id @param {any} raw @returns {Promise<void>}
 */
export async function storageQuarantineData(id, raw) {
	return writeSlot(id, 'quarantine:', raw);
}

/** Remove every record of a session (meta, data, backup, quarantine). @param {string} id */
export async function storageDeleteSession(id) {
	await withWriteTx(STORE_SESSION_DATA, (tx) => {
		const store = tx.objectStore(STORE_SESSION_DATA);
		store.delete(id);
		store.delete(`backup:${id}`);
		store.delete(`quarantine:${id}`);
	});
	await withWriteTx(STORE_SESSIONS, (tx) => {
		tx.objectStore(STORE_SESSIONS).delete(id);
	});
}

/** @param {string} id @returns {Promise<any | null>} */
export async function storageGetQuarantineData(id) {
	return readSlot(id, 'quarantine:');
}

// ---------------------------------------------------------------------------
// Legacy migration (single-session record written by the previous build)
// ---------------------------------------------------------------------------

/**
 * Migrate the old single-session record (key `current` in store `session`)
 * into a proper named session. Runs once per database.
 * @returns {Promise<string | null>} id of the migrated session, or null
 */
export async function storageMigrateLegacy() {
	if (await kvGet('legacyMigrated', false)) return null;

	/** @type {any} */
	let legacy = null;
	try {
		legacy = await withReadTx(STORE_LEGACY_SESSION, (tx, ok, fail) => {
			const req = tx.objectStore(STORE_LEGACY_SESSION).get('current');
			req.onsuccess = () => ok(req.result);
			req.onerror = () => fail(req.error || new Error('Ошибка чтения legacy-сессии'));
		});
	} catch {
		legacy = null;
	}

	if (legacy && typeof legacy === 'object' && Array.isArray(legacy.rows)) {
		const id = newSessionId();
		const now = new Date().toISOString();
		const rows = legacy.rows.filter(
			(/** @type {any} */ r) => r && typeof r.name === 'string' && r.lf
		);
		const snapshot = {
			schemaVersion: 1,
			savedAt: now,
			appVersion: 'legacy-v2',
			ui: { leftPanelPercent: 20 },
			settings: {
				zenithAngle:
					typeof legacy.zenithAngle === 'number' && legacy.zenithAngle >= 0
						? legacy.zenithAngle
						: 0,
				molecular: legacy.molecular,
				savedChannelSelection: null
			},
			files: rows.map((/** @type {any} */ r) => ({
				id: r.id,
				name: r.name,
				size: typeof r.size === 'string' ? r.size : '—',
				selected: false,
				lf: r.lf
			})),
			windows: []
		};
		await storagePutSessionData(id, snapshot);
		await storagePutSessionMeta({
			id,
			name: 'Рабочая сессия',
			createdAt: now,
			updatedAt: now,
			lastOpenedAt: now,
			isDefault: false,
			revision: 0,
			filesCount: snapshot.files.length,
			windowsCount: 0,
			dataBytes: estimateLegacyBytes(snapshot),
			appVersion: 'legacy-v2',
			schemaVersion: 1
		});
		await kvSet('activeSessionId', id);
	}

	try {
		await withWriteTx(STORE_LEGACY_SESSION, (tx) => {
			tx.objectStore(STORE_LEGACY_SESSION).delete('current');
		});
	} catch {
		// Best effort: leaving the legacy key in place is harmless.
	}
	await kvSet('legacyMigrated', true);
	if (legacy && Array.isArray(legacy.rows) && legacy.rows.length > 0) {
		return await kvGet('activeSessionId', null);
	}
	return null;
}

/** @param {{ files?: Array<{ lf?: any }> }} snapshot @returns {number} */
function estimateLegacyBytes(snapshot) {
	let bytes = 0;
	for (const f of snapshot.files ?? []) {
		bytes += 256;
		for (const p of f.lf?.profiles ?? []) bytes += (p.nDataPoints || p.data?.length || 0) * 4;
	}
	return bytes;
}
