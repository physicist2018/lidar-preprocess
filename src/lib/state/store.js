import { writable, get } from 'svelte/store';
import { newLicelPackFromZipBuffer } from 'licelfile-js';

// --- File store ---
export const files = writable([
	{ id: 1, name: 'scan_001.las', size: '24.5 MB', selected: false },
	{ id: 2, name: 'scan_002.las', size: '31.2 MB', selected: false },
	{ id: 3, name: 'scan_003.las', size: '18.7 MB', selected: false },
	{ id: 4, name: 'scan_004.laz', size: '42.1 MB', selected: false },
	{ id: 5, name: 'scan_005.laz', size: '55.3 MB', selected: false }
]);

export const openWindows = writable(
	/** @type {Array<{ id: number, title: string, x: number, y: number, payload?: any }>} */ ([])
);

// --- Error dialog state ---
export const errorMessage = writable('');

/** @param {string} message */
export function showError(message) {
	errorMessage.set(message);
}

export function clearError() {
	errorMessage.set('');
}

// --- Loaded Licel data ---
// Map file id -> parsed LicelFile (from the last successfully opened zip)
export const licelFiles = writable(new Map());

// --- Background removal state ---
export const backgroundRemoval = writable(
	/** @type {{ method: string, height: string, referenceFile: File | null }} */ ({
		method: 'average', // 'average' | 'median' | 'reference'
		height: '',
		referenceFile: null
	})
);

// --- Mock profile data for graph windows ---
const channelColors = [
	'#3b82f6', // blue
	'#10b981', // green
	'#ef4444', // red
	'#f59e0b', // amber
	'#8b5cf6', // violet
	'#ec4899', // pink
	'#06b6d4', // cyan
	'#84cc16' // lime
];

/**
 * @param {number} count
 * @param {number} baseSignal
 * @param {number} noise
 * @returns {Array<{ x: number, y: number }>}
 */
function generateProfile(count, baseSignal, noise) {
	const points = [];
	for (let i = 0; i < count; i++) {
		const height = (i / count) * 17000;
		const signal = baseSignal + Math.sin(height * 0.001) * 30 + (Math.random() - 0.5) * noise;
		points.push({ x: height, y: Math.max(0, signal) });
	}
	return points;
}

/** @type {Record<number, Array<{ name: string, color: string, points: Array<{ x: number, y: number }> }>>} */
export const fileProfiles = {
	1: [
		{ name: 'Backscatter — Main', color: channelColors[0], points: generateProfile(17000, 80, 20) },
		{
			name: 'Backscatter — Secondary',
			color: channelColors[1],
			points: generateProfile(17000, 40, 15)
		},
		{ name: 'Intensity', color: channelColors[2], points: generateProfile(17000, 60, 25) },
		{ name: 'RGB', color: channelColors[3], points: generateProfile(17000, 50, 10) }
	],
	2: [
		{ name: 'Backscatter — Main', color: channelColors[0], points: generateProfile(17000, 90, 18) },
		{
			name: 'Backscatter — Secondary',
			color: channelColors[1],
			points: generateProfile(17000, 35, 12)
		},
		{ name: 'Intensity', color: channelColors[2], points: generateProfile(17000, 70, 20) }
	],
	3: [
		{ name: 'Backscatter — Main', color: channelColors[0], points: generateProfile(17000, 75, 22) },
		{
			name: 'Backscatter — Tertiary',
			color: channelColors[4],
			points: generateProfile(17000, 25, 8)
		}
	],
	4: [
		{ name: 'Backscatter — Main', color: channelColors[0], points: generateProfile(17000, 85, 16) },
		{
			name: 'Backscatter — Secondary',
			color: channelColors[1],
			points: generateProfile(17000, 45, 14)
		},
		{
			name: 'Backscatter — Tertiary',
			color: channelColors[4],
			points: generateProfile(17000, 20, 10)
		},
		{ name: 'Intensity', color: channelColors[2], points: generateProfile(17000, 55, 22) }
	],
	5: [
		{ name: 'Backscatter — Main', color: channelColors[0], points: generateProfile(17000, 95, 15) },
		{
			name: 'Backscatter — Secondary',
			color: channelColors[1],
			points: generateProfile(17000, 50, 18)
		},
		{ name: 'Intensity', color: channelColors[2], points: generateProfile(17000, 65, 20) },
		{ name: 'RGB', color: channelColors[3], points: generateProfile(17000, 40, 8) }
	]
};

// Map file names to profile IDs
/** @type {Record<string, number>} */
export const fileNameToId = {};
/** @param {string} name @param {number} profileId */
export function registerFile(name, profileId) {
	fileNameToId[name] = profileId;
}

// Register default files
registerFile('scan_001.las', 1);
registerFile('scan_002.las', 2);
registerFile('scan_003.las', 3);
registerFile('scan_004.laz', 4);
registerFile('scan_005.laz', 5);

// --- Actions ---
/** @param {boolean} selected */
export function toggleSelectAll(selected) {
	const current = get(files);
	files.set(current.map((f) => ({ ...f, selected })));
}

/** @param {number} id */
export function toggleFile(id) {
	const current = get(files);
	files.set(current.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)));
}

export function deleteSelected() {
	const current = get(files);
	files.set(current.filter((f) => !f.selected));
}

/**
 * @param {{ method?: string, height?: number | null, referenceFile?: File | null }} [params]
 */
export function removeBackground(params) {
	// params: { method, height, referenceFile }
	const selected = get(files)
		.filter((f) => f.selected)
		.map((f) => f.id);
	console.log('removeBackground', { selected, ...params });
	// Reset state
	backgroundRemoval.set({ method: 'average', height: '', referenceFile: null });
}

export function mergeChannels() {
	// TODO: implement
	console.log(
		'mergeChannels',
		get(files)
			.filter((f) => f.selected)
			.map((f) => f.id)
	);
}

let nextId = 100;

/** @param {any} lf */
function licelFileBytes(lf) {
	let bytes = 256; // header overhead approximation
	for (const p of lf.profiles) {
		bytes += (p.nDataPoints || 0) * 4;
	}
	return bytes;
}

/** @param {number} bytes */
function formatSize(bytes) {
	if (!Number.isFinite(bytes) || bytes <= 0) return '—';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	const text = value >= 100 ? value.toFixed(0) : value.toFixed(1);
	return `${text.replace('.', ',')} ${units[unit]}`;
}

/**
 * @param {ArrayBuffer} buffer
 * @param {string} zipName
 */
export function openFiles(buffer, zipName) {
	// newLicelPackFromZipBuffer is synchronous; parse errors must not break the UI.
	try {
		const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
		const pack = newLicelPackFromZipBuffer(bytes);

		if (!pack.data || pack.data.size === 0) {
			showError(`В архиве "${zipName}" не найдено файлов данных Licel.`);
			return;
		}

		const items = [];
		const fileMap = new Map();
		for (const [path, lf] of pack.data) {
			const id = nextId++;
			const name = path.replace(/^\/+/, '');
			items.push({ id, name, size: formatSize(licelFileBytes(lf)), selected: false });
			fileMap.set(id, lf);
		}

		files.set(items);
		licelFiles.set(fileMap);
		console.log('openFiles', { zipName, files: items });
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		showError(`Не удалось прочитать архив "${zipName}": ${detail}`);
	}
}

export function cropByHeight() {
	// TODO: implement
	console.log(
		'cropByHeight',
		get(files)
			.filter((f) => f.selected)
			.map((f) => f.id)
	);
}

// --- NonModalWindow actions ---
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
			payload
		}
	]);
}

/** @param {number} id */
export function removeWindow(id) {
	const current = get(openWindows);
	openWindows.set(current.filter((w) => w.id !== id));
}
