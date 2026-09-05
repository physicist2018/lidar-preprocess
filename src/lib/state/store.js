import { writable, get } from 'svelte/store';

// --- File store ---
export const files = writable([
	{ id: 1, name: 'scan_001.las', size: '24.5 MB', selected: false },
	{ id: 2, name: 'scan_002.las', size: '31.2 MB', selected: false },
	{ id: 3, name: 'scan_003.las', size: '18.7 MB', selected: false },
	{ id: 4, name: 'scan_004.laz', size: '42.1 MB', selected: false },
	{ id: 5, name: 'scan_005.laz', size: '55.3 MB', selected: false }
]);

export const openWindows = writable([]);

// --- Background removal state ---
export const backgroundRemoval = writable({
	method: 'average', // 'average' | 'median' | 'reference'
	height: '',
	referenceFile: null
});

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

function generateProfile(count, baseSignal, noise) {
	const points = [];
	for (let i = 0; i < count; i++) {
		const height = (i / count) * 17000;
		const signal = baseSignal + Math.sin(height * 0.001) * 30 + (Math.random() - 0.5) * noise;
		points.push({ x: height, y: Math.max(0, signal) });
	}
	return points;
}

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
export const fileNameToId = {};
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
export function toggleSelectAll(selected) {
	const current = get(files);
	files.set(current.map((f) => ({ ...f, selected })));
}

export function toggleFile(id) {
	const current = get(files);
	files.set(current.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)));
}

export function deleteSelected() {
	const current = get(files);
	files.set(current.filter((f) => !f.selected));
}

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

export function openFiles(buffer, zipName) {
	// Clear old files
	files.set([]);

	// TODO: parse zip archive and extract file list
	// Stub: generate fake file names from zip name
	const baseName = zipName.replace(/\.zip$/i, '');
	const stubFiles = [
		{ id: nextId++, name: `${baseName}/scan_001.las`, size: '12.3 MB', selected: false },
		{ id: nextId++, name: `${baseName}/scan_002.las`, size: '15.7 MB', selected: false },
		{ id: nextId++, name: `${baseName}/scan_003.laz`, size: '22.1 MB', selected: false }
	];

	// Register new files with profiles
	for (const f of stubFiles) {
		registerFile(f.name, ((f.id - 1) % 5) + 1);
	}

	files.set(stubFiles);
	console.log('openFiles', { zipName, buffer, stubFiles });
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
export function addWindow(title, position) {
	const id = Date.now();
	const current = get(openWindows);
	openWindows.set([
		...current,
		{
			id,
			title,
			x: position?.x ?? 20 + Math.random() * 100,
			y: position?.y ?? 20 + Math.random() * 50
		}
	]);
}

export function removeWindow(id) {
	const current = get(openWindows);
	openWindows.set(current.filter((w) => w.id !== id));
}
