import { get } from 'svelte/store';
import {
	files,
	licelFiles,
	publishLicelData,
	zenithAngle,
	molecularState,
	savedChannelSelection,
	openWindows,
	leftPanelPercent,
	sessionEpoch,
	seedNextId,
	seedWindowZ
} from './store';
import {
	SCHEMA_VERSION,
	sanitizeSnapshot,
	migrateSnapshot,
	defaultEmptySnapshot,
	clampWindowsToViewport
} from './snapshot-core';

export { SCHEMA_VERSION, migrateSnapshot, clampWindowsToViewport };

const APP_VERSION = '1';

/** @param {any} snapshot @returns {number} rough persisted size in bytes */
export function estimateSnapshotBytes(snapshot) {
	let bytes = 512;
	for (const f of snapshot.files ?? []) {
		bytes += 256;
		for (const p of f.lf?.profiles ?? []) bytes += (p.nDataPoints || p.data?.length || 0) * 4;
	}
	bytes += (snapshot.windows?.length ?? 0) * 128;
	return bytes;
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * Deep-copy a value into plain objects, stripping Svelte runes reactivity
 * proxies (which IndexedDB refuses to store and `structuredClone` cannot
 * flatten). Kept as shared references: Date, typed arrays (Float64Array …),
 * plus every other structured-cloneable native. Handles cycles.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function plainClone(value, seen = new Map()) {
	if (value === null || typeof value !== 'object') return value;
	if (seen.has(value)) return /** @type {T} */ (seen.get(value));
	if (ArrayBuffer.isView(value) || value instanceof Date) return value;
	if (value instanceof Map) {
		/** @type {Map<any, any>} */
		const out = new Map();
		seen.set(value, out);
		for (const [k, v] of value) out.set(k, plainClone(v, seen));
		return /** @type {T} */ (out);
	}
	/** @type {any} */
	const src = value;
	/** @type {any} */
	const out = Array.isArray(src) ? [] : {};
	seen.set(src, out);
	for (const k of Object.keys(src)) out[k] = plainClone(src[k], seen);
	return /** @type {T} */ (out);
}

/** A blank workspace snapshot (no files, no windows, current settings). */
export function emptySnapshot() {
	return plainClone({
		schemaVersion: SCHEMA_VERSION,
		savedAt: new Date().toISOString(),
		appVersion: APP_VERSION,
		ui: { leftPanelPercent: get(leftPanelPercent) },
		settings: {
			zenithAngle: get(zenithAngle),
			molecular: get(molecularState),
			savedChannelSelection: get(savedChannelSelection)
		},
		files: [],
		windows: []
	});
}

/**
 * Serialize the current in-memory workspace into a plain snapshot object.
 * Window records are taken from the openWindows store, where every window
 * keeps its geometry, z-order, collapse/maximize flags and view state up to
 * date (see NonModalWindow).
 *
 * The snapshot is deep-copied into plain objects before returning: Svelte
 * runes wrap object `$state` values (e.g. channelStates of a graph window) in
 * reactivity proxies that IndexedDB refuses to store; `plainClone` flattens
 * them while keeping Date / typed arrays intact.
 * @returns {any}
 */
export function captureSnapshot() {
	const current = get(files);
	const data = get(licelFiles);
	const rows = [];
	for (const f of current) {
		const lf = data.get(f.id);
		if (!lf) continue;
		rows.push({ id: f.id, name: f.name, size: f.size, selected: f.selected === true, lf });
	}
	return plainClone({
		schemaVersion: SCHEMA_VERSION,
		savedAt: new Date().toISOString(),
		appVersion: APP_VERSION,
		ui: { leftPanelPercent: get(leftPanelPercent) },
		settings: {
			zenithAngle: get(zenithAngle),
			molecular: get(molecularState),
			savedChannelSelection: get(savedChannelSelection)
		},
		files: rows,
		windows: get(openWindows)
	});
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Replace the whole in-memory workspace with the given snapshot. Destroys every
 * live window first, then re-creates windows from the record (their module
 * level state, plotly instances etc. are released by the remount keyed on
 * sessionEpoch in the layout).
 * @param {any} snapshot
 * @returns {string[]} warnings produced by sanitizing
 */
export function applySnapshot(snapshot) {
	const { snapshot: s, warnings } = sanitizeSnapshot(snapshot, emptySnapshot);

	const items = [];
	const fileMap = new Map();
	let maxId = 0;
	for (const f of s.files) {
		items.push({ id: f.id, name: f.name, size: f.size, selected: f.selected });
		fileMap.set(f.id, f.lf);
		maxId = Math.max(maxId, f.id);
	}
	seedNextId(maxId + 1);

	const angle = s.settings.zenithAngle;
	if (angle !== get(zenithAngle)) zenithAngle.set(angle);
	molecularState.set(s.settings.molecular ?? { meteo: null, sourceName: '', zMin: 0, zMax: 0 });
	savedChannelSelection.set(s.settings.savedChannelSelection);
	leftPanelPercent.set(s.ui.leftPanelPercent);

	files.set(items);
	publishLicelData(fileMap, null);

	clampWindowsToViewport(s.windows);
	openWindows.set(s.windows);
	let maxZ = 0;
	for (const w of s.windows) maxZ = Math.max(maxZ, Number.isFinite(w.z) ? w.z : 0);
	seedWindowZ(maxZ);
	sessionEpoch.set(get(sessionEpoch) + 1);
	return warnings;
}
