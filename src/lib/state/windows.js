import { get } from 'svelte/store';
import { openWindows, MAX_WINDOW_Z } from './store';
export { MAX_WINDOW_Z };
import { listUnfoldChannels, unfoldTransformById } from './unfold-data';

// Global z-order counter for windows; seeded from the loaded snapshot. Kept
// here (shared by every window) instead of per-component so window records can
// persist their stacking order across sessions.
let windowZCounter = 100;

/** @returns {number} */
export function nextWindowZ() {
	if (windowZCounter >= MAX_WINDOW_Z) normalizeWindowZ();
	return ++windowZCounter;
}

/** @param {number} z */
export function seedWindowZ(z) {
	if (Number.isFinite(z) && z > windowZCounter) {
		// Clamp so a snapshot saved when window z-indexes were unbounded can
		// never place a window inside or above the modal band.
		windowZCounter = Math.min(Math.floor(z), MAX_WINDOW_Z);
	}
}

/**
 * Renumber every open window into a compact [101, …] range preserving the
 * current relative order, then restart the counter so window z-indexes keep
 * growing without ever reaching the modal band.
 */
function normalizeWindowZ() {
	const current = get(openWindows);
	const sorted = [...current].sort(
		(a, b) => (Number.isFinite(a.z) ? a.z : 0) - (Number.isFinite(b.z) ? b.z : 0)
	);
	sorted.forEach((w, i) => {
		w.z = 100 + i + 1;
	});
	openWindows.set(sorted);
	windowZCounter = 100 + sorted.length;
}

/**
 * Merge a patch into a window record (geometry, z-order, collapse/maximize
 * flags, view state). Called by NonModalWindow whenever the user changes any
 * of those so a manual save always captures the live layout.
 * @param {number} id
 * @param {any} patch
 */
export function updateWindowState(id, patch) {
	const current = get(openWindows);
	openWindows.set(current.map((w) => (w.id === id ? { ...w, ...patch } : w)));
}

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
			width: null,
			height: null,
			z: nextWindowZ(),
			collapsed: false,
			maximized: false,
			view: null,
			payload
		}
	]);
}

/** @param {number} id */
export function removeWindow(id) {
	const current = get(openWindows);
	openWindows.set(current.filter((w) => w.id !== id));
}

/**
 * Open a new non-modal unfold window ("Развертка: …") for the given channel
 * and value transform over the given files.
 * @param {{ fileIds: number[], channelKey: string, transform: string }} config
 */
export function addUnfoldWindow(config) {
	const channel = listUnfoldChannels(config.fileIds).find((c) => c.key === config.channelKey);
	const tf = unfoldTransformById(config.transform);
	const label = channel?.label ?? config.channelKey;
	addWindow(`Развертка: ${label} · ${tf.short}`, undefined, {
		unfold: { ...config, channelLabel: label, transformLabel: tf.short }
	});
}
