import { describe, it, expect } from 'bun:test';
import { get } from 'svelte/store';
import { files, licelFiles, smoothingProgress } from './store';
import { applySmoothing } from './processing';

/** @param {number[]} data @param {any} overrides */
function channelProfile(data, overrides = {}) {
	return {
		deviceID: 'BT',
		wavelength: 355,
		polarization: 'P',
		binWidth: 7.5,
		active: true,
		data: Float64Array.from(data),
		...overrides
	};
}

/** @param {number} n */
function makeFiles(n) {
	const fileRows = [];
	const map = new Map();
	for (let id = 1; id <= n; id++) {
		fileRows.push({ id, name: `file${id}.lic`, size: '1 KB', selected: true });
		map.set(id, { measurementStartTime: new Date(), profiles: [channelProfile([10, 20, 30, 40])] });
	}
	return { fileRows, map };
}

/**
 * @typedef {Array<{ active: boolean, done: number, total: number, label: string }>} ProgressSnapshots
 */

describe('applySmoothing progress reporting', () => {
	it('reports one step per file and finishes with active=false', async () => {
		const { fileRows, map } = makeFiles(3);
		files.set(fileRows);
		licelFiles.set(map);

		/** @type {ProgressSnapshots} */
		const snapshots = [];
		const unsub = smoothingProgress.subscribe((s) => snapshots.push({ ...s }));

		await applySmoothing({ algorithm: 'moving_average', params: { windowSize: 3 } });

		unsub();

		const activeStates = snapshots.filter((s) => s.active);
		expect(activeStates.length).toBeGreaterThan(0);
		// done монотонно возрастает от 0 до total
		for (let i = 1; i < activeStates.length; i++) {
			expect(activeStates[i].done).toBeGreaterThanOrEqual(activeStates[i - 1].done);
		}
		expect(activeStates[activeStates.length - 1].done).toBe(activeStates[0].total);
		expect(activeStates[0].total).toBe(3);

		// Финальное состояние — неактивно, сброшено
		const last = snapshots[snapshots.length - 1];
		expect(last.active).toBe(false);
		expect(last.total).toBe(0);
	});

	it('total counts only files with profiles passing the channel filter', async () => {
		const { fileRows, map } = makeFiles(3);
		// Третий файл не содержит каналов, подходящих под фильтр
		const other = map.get(3);
		other.profiles[0].wavelength = 532; // не подходит под фильтр 355
		files.set(fileRows);
		licelFiles.set(map);

		/** @type {ProgressSnapshots} */
		const snapshots = [];
		const unsub = smoothingProgress.subscribe((s) => snapshots.push({ ...s }));

		await applySmoothing({
			algorithm: 'moving_average',
			params: { windowSize: 3 },
			channelKeys: ['BT|355|P']
		});

		unsub();

		const active = snapshots.filter((s) => s.active);
		expect(active[0].total).toBe(2);
		expect(active[active.length - 1].done).toBe(2);
	});

	it('publishes smoothed data after completion', async () => {
		const { fileRows, map } = makeFiles(2);
		files.set(fileRows);
		licelFiles.set(map);

		await applySmoothing({ algorithm: 'moving_average', params: { windowSize: 3 } });

		const result = get(licelFiles).get(1).profiles[0].data;
		expect(result).toBeInstanceOf(Float64Array);
		expect(result.length).toBe(4);
	});
});