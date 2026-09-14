import { describe, it, expect } from 'bun:test';
import {
	sanitizeSnapshot,
	sanitizeWindow,
	migrateSnapshot,
	estimateSnapshotBytes,
	SCHEMA_VERSION,
	defaultEmptySnapshot
} from './snapshot-core';

describe('sanitizeSnapshot', () => {
	it('passes an empty snapshot through', () => {
		const { snapshot, warnings } = sanitizeSnapshot(defaultEmptySnapshot());
		expect(snapshot.files).toEqual([]);
		expect(snapshot.windows).toEqual([]);
		expect(snapshot.schemaVersion).toBe(SCHEMA_VERSION);
		expect(warnings).toEqual([]);
	});

	it('drops files without a valid lf payload', () => {
		const { snapshot, warnings } = sanitizeSnapshot({
			files: [{ id: 1, name: 'a.lcd', lf: { profiles: [] } }, { id: 'bad', name: 'b.lcd' }, null],
			windows: []
		});
		expect(snapshot.files.length).toBe(1);
		expect(snapshot.files[0].name).toBe('a.lcd');
		expect(warnings.length).toBeGreaterThan(0);
	});

	it('reassigns duplicate and missing file ids', () => {
		const { snapshot, warnings } = sanitizeSnapshot({
			files: [
				{ id: 7, name: 'a.lcd', lf: {} },
				{ id: 7, name: 'b.lcd', lf: {} },
				{ name: 'c.lcd', lf: {} }
			],
			windows: []
		});
		const ids = snapshot.files.map((/** @type {any} */ f) => f.id);
		expect(new Set(ids).size).toBe(3);
		expect(ids).toContain(7);
		expect(warnings.length).toBeGreaterThan(0);
	});

	it('drops windows that are not objects or have no title', () => {
		const { snapshot, warnings } = sanitizeSnapshot({
			files: [],
			windows: [{ id: 1, title: 'Окно', x: 10 }, { id: 2 }, null]
		});
		expect(snapshot.windows.length).toBe(1);
		expect(snapshot.windows[0].title).toBe('Окно');
		expect(warnings.length).toBeGreaterThan(0);
	});

	it('clamps window geometry, flags and view state', () => {
		const { snapshot } = sanitizeSnapshot({
			files: [],
			windows: [
				{
					id: 1,
					title: 'График: a.lcd',
					x: -50,
					y: 10,
					width: 10,
					height: Infinity,
					z: 'high',
					collapsed: 1,
					maximized: true,
					view: { yScale: 'banana', channelStates: { '1 нм': true } },
					payload: { fileId: 3 }
				}
			]
		});
		const w = snapshot.windows[0];
		expect(w.x).toBe(0);
		expect(w.width).toBe(320);
		expect(w.height).toBeNull();
		expect(w.z).toBe(0);
		expect(w.collapsed).toBe(false);
		expect(w.maximized).toBe(true);
		expect(w.view.yScale).toBeNull();
		expect(w.view.channelStates['1 нм']).toBe(true);
	});

	it('rejects non-object snapshots', () => {
		const { snapshot, warnings } = sanitizeSnapshot(null);
		expect(snapshot.files).toEqual([]);
		expect(warnings.length).toBeGreaterThan(0);
	});
});

describe('sanitizeWindow', () => {
	it('keeps valid records with defaults for missing numeric fields', () => {
		const w = sanitizeWindow({ id: 1, title: 'Окно' });
		expect(w.x).toBe(20);
		expect(w.z).toBe(0);
		expect(w.view).toBeNull();
	});
});

describe('migrateSnapshot', () => {
	it('keeps the current version untouched', () => {
		const data = { schemaVersion: SCHEMA_VERSION, files: [], windows: [] };
		const { snapshot, migrated } = migrateSnapshot(data);
		expect(migrated).toBe(true);
		expect(snapshot).toBe(data);
	});

	it('rejects newer formats', () => {
		const { error } = migrateSnapshot({ schemaVersion: SCHEMA_VERSION + 1 });
		expect(error).toBeDefined();
	});
});

describe('estimateSnapshotBytes', () => {
	it('scales with profile point counts', () => {
		const small = estimateSnapshotBytes({
			files: [{ lf: { profiles: [{ nDataPoints: 100 }] } }],
			windows: []
		});
		const large = estimateSnapshotBytes({
			files: [{ lf: { profiles: [{ nDataPoints: 10000 }] } }],
			windows: []
		});
		expect(large).toBeGreaterThan(small);
	});
});

describe('clampWindowsToViewport', () => {
	it('keeps windows inside the viewport', () => {
		const { clampWindowsToViewport } = require('./snapshot-core');
		const windows = [
			{ x: -500, y: -100, z: 1 },
			{ x: 200, y: 300, z: 2 },
			{ x: 5000, y: 4000, z: 3 },
			{ x: 'junk', y: 10, z: 4 }
		];
		clampWindowsToViewport(windows);
		for (const w of windows) {
			expect(w.x).toBeGreaterThanOrEqual(0);
			expect(w.y).toBeGreaterThanOrEqual(0);
			expect(w.x).toBeLessThanOrEqual(960);
			expect(w.y).toBeLessThanOrEqual(650);
		}
		expect(windows[2].x).toBeLessThanOrEqual(960);
	});
});
