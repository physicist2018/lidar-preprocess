import { writable } from 'svelte/store';

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

/** Open files of the current working dataset. */
export const files = writable(
	/** @type {Array<{ id: number, name: string, size: string, selected: boolean }>} */ ([])
);

/** Non-modal application windows ("график", "развертка", ...). */
export const openWindows = writable(
	/** @type {Array<{ id: number, title: string, x: number, y: number, width: number | null, height: number | null, z: number, collapsed: boolean, maximized: boolean, view: any, payload?: any }>} */ ([])
);

/**
 * Width of the left file panel in percent. Part of the workspace snapshot.
 */
export const leftPanelPercent = writable(20);

/**
 * Bumped on every session apply so the window container is hard-remounted and
 * every NonModalWindow is rebuilt from scratch (plotly instances included).
 */
export const sessionEpoch = writable(0);

/**
 * CSS z-index reserved for modal overlays. Every modal dialog renders at exactly
 * this value so it always stays above non-modal windows no matter how long the
 * session runs. Non-modal windows allocate z-indexes strictly below it.
 */
export const MODAL_Z_INDEX = 100000;

/**
 * Ceiling of the z-order counter for non-modal windows, just under the modal
 * band. The counter starts at WINDOW_Z_BASE and is bounded, so window stacking
 * can never overtake modal overlays again.
 */
export const MAX_WINDOW_Z = MODAL_Z_INDEX - 1;

/** Largest allowed median filter window (odd). */
export const MEDIAN_WINDOW_MAX = 101;

/** Message shown in the error dialog ('' hides it). */
export const errorMessage = writable('');

/**
 * Map of file id -> parsed/modified LicelFile of the current working dataset.
 * @type {import('svelte/store').Writable<Map<number, any>>}
 */
export const licelFiles = writable(/** @type {Map<number, any>} */ (new Map()));

/**
 * File ids touched by the last licelFiles publish; null means every file may
 * have changed (new pack loaded / session restored). Published together with
 * the new licelFiles map so dependent windows can skip unaffected rebuilds.
 */
export const licelDataTouched = writable(/** @type {number[] | null} */ (null));

/** Background removal settings for the dialog form. */
export const backgroundRemoval = writable(
	/** @type {{ method: string, height: string, referenceFile: File | null }} */ ({
		method: 'average', // 'average' | 'median' | 'reference'
		height: '',
		referenceFile: null
	})
);

/** Median filter settings for the dialog form. */
export const medianFilter = writable(
	/** @type {{ windowSize: string }} */ ({
		windowSize: ''
	})
);

/** Height crop settings for the dialog form. */
export const cropByHeightConfig = writable(
	/** @type {{ maxHeight: string }} */ ({
		maxHeight: ''
	})
);

/** Smoothing dialog settings: selected algorithm and its parameters. */
export const smoothingConfig = writable(
	/** @type {{ algorithm: string, params: Record<string, string> }} */ ({
		algorithm: '',
		params: {}
	})
);

/**
 * Snapshot of channel visibility (channel name -> enabled) remembered from a
 * graph window; applied to graph windows opened afterwards.
 */
export const savedChannelSelection = writable(/** @type {Record<string, boolean> | null} */ (null));

/**
 * OY axis scale ('linear' | 'log') of the graph window remembered together
 * with the channel selection ("Кнопка 2"); applied to graph windows opened
 * afterwards.
 */
export const savedYScale = writable('linear');

/** @param {Record<string, boolean>} states @param {'linear' | 'log'} [yScale] */
export function rememberChannelSelection(states, yScale) {
	savedChannelSelection.set({ ...states });
	if (yScale === 'log' || yScale === 'linear') savedYScale.set(yScale);
}

/**
 * Zenith angle (degrees) applied to the working dataset. Graph windows derive
 * their height axis as z = r · cos(alpha) from the pristine distances of every
 * channel, so this single value keeps all windows consistent.
 */
export const zenithAngle = writable(0);

/**
 * State of the last molecular anchoring run: the parsed meteo profiles, the
 * source file name and the anchoring height window. Persisted with the session
 * so the dialog can be prefilled and the anchoring re-applied without
 * re-selecting the meteo file.
 */
export const molecularState = writable(
	/** @type {{ meteo: any | null, sourceName: string, zMin: number, zMax: number }} */ ({
		meteo: null,
		sourceName: '',
		zMin: 0,
		zMax: 0
	})
);

// ---------------------------------------------------------------------------
// Error dialog
// ---------------------------------------------------------------------------

/** @param {string} message */
export function showError(message) {
	errorMessage.set(message);
}

export function clearError() {
	errorMessage.set('');
}

// ---------------------------------------------------------------------------
// Data publication
// ---------------------------------------------------------------------------

/**
 * Publish a new licelFiles map together with the set of file ids it changed.
 * @param {Map<number, any>} map
 * @param {number[] | null} touchedIds
 */
export function publishLicelData(map, touchedIds) {
	licelFiles.set(map);
	licelDataTouched.set(touchedIds);
}

// ---------------------------------------------------------------------------
// File id sequence
// ---------------------------------------------------------------------------

// Smallest unused integer for new working-dataset file ids. Seeded from the
// loaded snapshot so restored sessions never collide with newly opened files.
let nextId = 1;

/** @param {number} n */
export function seedNextId(n) {
	nextId = Math.max(nextId, n);
}

/** @returns {number} the next unused file id */
export function nextFileId() {
	return nextId++;
}
