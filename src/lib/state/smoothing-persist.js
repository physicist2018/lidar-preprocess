import { kvGet, kvSet } from './storage.js';
import { SMOOTHING_ALGORITHMS } from '$lib/smoothing.js';

/**
 * Persisted snapshot of the last applied smoothing configuration. The same
 * shape is handed back to SmoothDialog on the next open so the form can be
 * prefilled with the values the user accepted last time.
 * @typedef {{
 *   schemaVersion: 1,
 *   algorithm: string,
 *   params: Record<string, number | string>,
 *   channelKeys: string[],
 *   options: { useMolecularProfile?: boolean }
 * }} SmoothingPersistSnapshot
 */

/** @type {1} */
export const SMOOTHING_PERSIST_SCHEMA = 1;

/** IndexedDB key used by the existing kv-store layer in storage.js. */
export const SMOOTHING_PERSIST_KEY = 'smoothingConfig';

/**
 * Shape produced for the dialog: the dialog stores params as strings (because
 * <input type="number"> binds to strings), so the hydrated form uses strings.
 * @typedef {{
 *   algorithm: string,
 *   params: Record<string, string>,
 *   channelKeys: string[],
 *   useMolecularProfile: boolean
 * }} SmoothDialogPrefill
 */

/** @param {any} raw @returns {raw is SmoothingPersistSnapshot} */
function looksLikeSnapshot(raw) {
	return (
		raw &&
		typeof raw === 'object' &&
		typeof raw.algorithm === 'string' &&
		raw.params &&
		typeof raw.params === 'object' &&
		Array.isArray(raw.channelKeys) &&
		raw.options &&
		typeof raw.options === 'object'
	);
}

/**
 * Normalize a value into a valid parameter value for the given param
 * definition. Returns the default if the value is missing, non-finite or out
 * of range.
 * @param {any} value
 * @param {{ key: string, min?: number, max?: number, default: number | string }} param
 * @returns {number | string}
 */
function coerceParamValue(value, param) {
	const num = typeof value === 'number' ? value : Number(value);
	if (Number.isFinite(num)) {
		if (param.min !== undefined && num < param.min) return param.default;
		if (param.max !== undefined && num > param.max) return param.default;
		return num;
	}
	return param.default;
}

/**
 * Validate and normalize a stored snapshot against the current SMOOTHING_ALGORITHMS
 * schema. Unknown algorithms or snapshots from a future schema version are
 * rejected by returning null so the caller can fall back to empty defaults.
 *
 * The function is pure (no I/O) so it is straightforward to unit-test.
 * @param {any} raw
 * @returns {SmoothingPersistSnapshot | null}
 */
export function sanitizeSmoothingSnapshot(raw) {
	if (!looksLikeSnapshot(raw)) return null;
	if (raw.schemaVersion !== SMOOTHING_PERSIST_SCHEMA) return null;

	const algo = SMOOTHING_ALGORITHMS.find((a) => a.id === raw.algorithm);
	if (!algo) return null;

	/** @type {Record<string, number | string>} */
	const params = {};
	for (const def of algo.params) {
		params[def.key] = coerceParamValue(raw.params[def.key], def);
	}

	/** @type {string[]} */
	const channelKeys = [];
	const seen = new Set();
	for (const key of raw.channelKeys) {
		if (typeof key === 'string' && !seen.has(key)) {
			seen.add(key);
			channelKeys.push(key);
		}
	}

	const useMolecular = algo.id === 'regularization' && raw.options.useMolecularProfile === true;

	return {
		schemaVersion: SMOOTHING_PERSIST_SCHEMA,
		algorithm: algo.id,
		params,
		channelKeys,
		options: { useMolecularProfile: useMolecular }
	};
}

/**
 * Convert a sanitized snapshot into the dialog's local state shape (params as
 * strings for <input type="number">, useMolecularProfile always present even
 * for non-regularization algorithms so the component can render uniformly).
 * @param {SmoothingPersistSnapshot | null} snap
 * @returns {SmoothDialogPrefill | null}
 */
export function snapshotToDialogPrefill(snap) {
	if (!snap) return null;
	const algo = SMOOTHING_ALGORITHMS.find((a) => a.id === snap.algorithm);
	if (!algo) return null;
	/** @type {Record<string, string>} */
	const params = {};
	for (const def of algo.params) {
		const v = snap.params[def.key];
		params[def.key] = v === undefined ? String(def.default) : String(v);
	}
	return {
		algorithm: snap.algorithm,
		params,
		channelKeys: [...snap.channelKeys],
		useMolecularProfile: snap.options.useMolecularProfile === true
	};
}

/**
 * Load the persisted snapshot from IndexedDB and sanitize it against the
 * current SMOOTHING_ALGORITHMS schema. Returns null if nothing is stored, the
 * stored payload is malformed, the algorithm has been removed, or parameters
 * no longer fit their declared ranges.
 * @returns {Promise<SmoothDialogPrefill | null>}
 */
export async function loadSmoothingPrefill() {
	const raw = await kvGet(SMOOTHING_PERSIST_KEY, null);
	return snapshotToDialogPrefill(sanitizeSmoothingSnapshot(raw));
}

/**
 * Persist the configuration the user just accepted. Designed to be called
 * from SmoothDialog.handleApply, before applySmoothing runs, so that the form
 * value survives even if the smoothing step fails on some files.
 * @param {{ algorithm: string, params: Record<string, number | string>, channelKeys: string[], options?: { useMolecularProfile?: boolean } }} cfg
 * @returns {Promise<void>}
 */
export async function saveSmoothingConfig(cfg) {
	if (!cfg || typeof cfg.algorithm !== 'string' || cfg.algorithm === '') return;
	const algo = SMOOTHING_ALGORITHMS.find((a) => a.id === cfg.algorithm);
	if (!algo) return;

	/** @type {Record<string, number | string>} */
	const params = {};
	for (const def of algo.params) {
		params[def.key] = coerceParamValue(cfg.params?.[def.key], def);
	}

	/** @type {string[]} */
	const channelKeys = [];
	const seen = new Set();
	for (const key of cfg.channelKeys ?? []) {
		if (typeof key === 'string' && !seen.has(key)) {
			seen.add(key);
			channelKeys.push(key);
		}
	}

	/** @type {SmoothingPersistSnapshot} */
	const snap = {
		schemaVersion: SMOOTHING_PERSIST_SCHEMA,
		algorithm: algo.id,
		params,
		channelKeys,
		options: {
			useMolecularProfile: algo.id === 'regularization' && cfg.options?.useMolecularProfile === true
		}
	};

	await kvSet(SMOOTHING_PERSIST_KEY, snap);
}

/** Forget the persisted snapshot. Wired to a "Сбросить" button in the dialog. */
export async function clearSmoothingConfig() {
	await kvSet(SMOOTHING_PERSIST_KEY, null);
}
