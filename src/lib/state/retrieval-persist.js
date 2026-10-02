import { kvGet, kvSet } from './storage.js';

const RETRIEVAL_PERSIST_KEY = 'retrievalConfig';

/**
 * @typedef {{ algorithm: string, params: Record<string, number>, channelKeys: string[] }} RetrievalSnapshot
 */

/** @param {any} raw @returns {raw is RetrievalSnapshot} */
function looksValid(raw) {
	return (
		raw &&
		typeof raw === 'object' &&
		typeof raw.algorithm === 'string' &&
		raw.params && typeof raw.params === 'object' &&
		Array.isArray(raw.channelKeys)
	);
}

/**
 * @returns {Promise<RetrievalSnapshot | null>}
 */
export async function loadRetrievalPrefill() {
	const raw = await kvGet(RETRIEVAL_PERSIST_KEY, null);
	if (!looksValid(raw)) return null;
	return raw;
}

/**
 * @param {RetrievalSnapshot} snap
 * @returns {Promise<void>}
 */
export async function saveRetrievalConfig(snap) {
	await kvSet(RETRIEVAL_PERSIST_KEY, snap);
}