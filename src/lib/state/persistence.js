const DB_NAME = 'lidar-viewer';
const STORE_NAME = 'session';
const KEY = 'current';

function openDb() {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB недоступна в этом окружении'));
			return;
		}
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE_NAME)) {
				request.result.createObjectStore(STORE_NAME);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error('Не удалось открыть IndexedDB'));
	});
}

/**
 * Persist the session snapshot (current dataset) into IndexedDB.
 * @param {any} snapshot
 */
export async function saveSession(snapshot) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).put(snapshot, KEY);
		tx.oncomplete = () => {
			db.close();
			resolve(undefined);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error || new Error('Не удалось сохранить сессию'));
		};
	});
}

/**
 * Load the persisted session snapshot from IndexedDB.
 * @returns {Promise<any>}
 */
export async function loadSession() {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const request = tx.objectStore(STORE_NAME).get(KEY);
		request.onsuccess = () => {
			db.close();
			resolve(request.result ?? null);
		};
		request.onerror = () => {
			db.close();
			reject(request.error || new Error('Не удалось прочитать сессию'));
		};
	});
}
