import { writable, get } from 'svelte/store';

// --- File store ---
export const files = writable([
	{ id: 1, name: 'scan_001.las', size: '24.5 MB', selected: false },
	{ id: 2, name: 'scan_002.las', size: '31.2 MB', selected: false },
	{ id: 3, name: 'scan_003.las', size: '18.7 MB', selected: false },
	{ id: 4, name: 'scan_004.laz', size: '42.1 MB', selected: false },
	{ id: 5, name: 'scan_005.laz', size: '55.3 MB', selected: false },
]);

export const openWindows = writable([]);

// --- Background removal state ---
export const backgroundRemoval = writable({
	method: 'average', // 'average' | 'median' | 'reference'
	height: '',
	referenceFile: null,
});

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
	const selected = get(files).filter((f) => f.selected).map((f) => f.id);
	console.log('removeBackground', { selected, ...params });
	// Reset state
	backgroundRemoval.set({ method: 'average', height: '', referenceFile: null });
}

export function mergeChannels() {
	// TODO: implement
	console.log('mergeChannels', get(files).filter((f) => f.selected).map((f) => f.id));
}

export function openFiles() {
	// TODO: implement file picker
	console.log('openFiles');
}

export function cropByHeight() {
	// TODO: implement
	console.log('cropByHeight', get(files).filter((f) => f.selected).map((f) => f.id));
}

// --- NonModalWindow actions ---
export function addWindow(title, position) {
	const id = Date.now();
	const current = get(openWindows);
	openWindows.set([...current, { id, title, x: position?.x ?? 20 + Math.random() * 100, y: position?.y ?? 20 + Math.random() * 50 }]);
}

export function removeWindow(id) {
	const current = get(openWindows);
	openWindows.set(current.filter((w) => w.id !== id));
}
