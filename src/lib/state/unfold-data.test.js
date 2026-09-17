import { describe, it, expect } from 'bun:test';
import { licelFiles, zenithAngle } from './store';
import {
	buildUnfoldData,
	listUnfoldChannels,
	unfoldTransformById,
	UNFOLD_TRANSFORMS
} from './unfold-data';

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

function sampleData() {
	return new Map([
		[
			1,
			{
				measurementStartTime: new Date('2026-06-15T12:00:00Z'),
				profiles: [channelProfile([10, 20, 30, 40])]
			}
		],
		[
			2,
			{
				measurementStartTime: new Date('2026-06-15T12:05:00Z'),
				profiles: [channelProfile([20, 30, 40, 50])]
			}
		]
	]);
}

/** @param {Date} d @returns {number} */
function timeOf(d) {
	return d.getTime();
}

describe('unfold-data channels and transforms', () => {
	it('lists distinct channels across files', () => {
		licelFiles.set(sampleData());
		const channels = listUnfoldChannels([1, 2]);
		expect(channels).toHaveLength(1);
		expect(channels[0].key).toBe('BT|355|P');
		expect(channels[0].fileCount).toBe(2);
	});

	it('resolves transform ids and falls back to the default', () => {
		expect(unfoldTransformById('symlogP').short).toBe('symlog(P)');
		expect(unfoldTransformById('asinhP').short).toBe('asinh(P/ε)');
		expect(unfoldTransformById('asinhPr2').short).toBe('asinh(P·r²/ε)');
		expect(unfoldTransformById('nope')).toBe(UNFOLD_TRANSFORMS[0]);
	});
});

describe('buildUnfoldData', () => {
	it('builds the heatmap matrix for the plain signal transform', () => {
		licelFiles.set(sampleData());
		zenithAngle.set(0);
		const res = /** @type {any} */ (
			buildUnfoldData({ fileIds: [1, 2], channelKey: 'BT|355|P', transform: 'P' })
		);
		expect('error' in res).toBe(false);
		expect(res.nFiles).toBe(2);
		expect(res.times.map(timeOf)).toEqual([
			new Date('2026-06-15T12:00:00Z').getTime(),
			new Date('2026-06-15T12:05:00Z').getTime()
		]);
		expect(res.y).toEqual([0, 7.5, 15, 22.5]);
		expect(Array.from(res.z[0])).toEqual([10, 20]);
		expect(Array.from(res.z[3])).toEqual([40, 50]);
		expect(res.zMin).toBeDefined();
		expect(res.zMax).toBeGreaterThan(res.zMin);
	});

	it('builds the asinh(P/ε) transform matrix', () => {
		licelFiles.set(sampleData());
		zenithAngle.set(0);
		const res = /** @type {any} */ (
			buildUnfoldData({ fileIds: [1, 2], channelKey: 'BT|355|P', transform: 'asinhP' })
		);
		expect('error' in res).toBe(false);
		expect(res.z[0][0]).toBeCloseTo(Math.asinh(10 / 1e-6), 10);
		expect(res.z[0][1]).toBeCloseTo(Math.asinh(20 / 1e-6), 10);
		expect(res.z[3][0]).toBeCloseTo(Math.asinh(40 / 1e-6), 10);
	});

	it('builds the asinh(P·r²/ε) transform matrix', () => {
		licelFiles.set(sampleData());
		zenithAngle.set(0);
		const res = /** @type {any} */ (
			buildUnfoldData({ fileIds: [1, 2], channelKey: 'BT|355|P', transform: 'asinhPr2' })
		);
		expect('error' in res).toBe(false);
		const r0 = 0.5 * 7.5;
		const r3 = 3.5 * 7.5;
		expect(res.z[0][0]).toBeCloseTo(Math.asinh((10 * r0 * r0) / 1e-6), 10);
		expect(res.z[3][0]).toBeCloseTo(Math.asinh((40 * r3 * r3) / 1e-6), 10);
	});

	it('requires a molecular profile for the SR transform', () => {
		licelFiles.set(sampleData());
		const res = /** @type {any} */ (
			buildUnfoldData({ fileIds: [1, 2], channelKey: 'BT|355|P', transform: 'SR' })
		);
		expect('error' in res).toBe(true);
	});

	it('reports a missing channel', () => {
		licelFiles.set(sampleData());
		const res = /** @type {any} */ (
			buildUnfoldData({ fileIds: [1], channelKey: 'BT|999|P', transform: 'P' })
		);
		expect(res).toEqual({ error: 'Канал не найден в выбранных файлах.' });
	});

	it('sorts measurements chronologically', () => {
		const outOfOrder = new Map([
			[
				2,
				{
					measurementStartTime: new Date('2026-06-15T12:05:00Z'),
					profiles: [channelProfile([20, 30, 40, 50])]
				}
			],
			[
				1,
				{
					measurementStartTime: new Date('2026-06-15T12:00:00Z'),
					profiles: [channelProfile([10, 20, 30, 40])]
				}
			]
		]);
		licelFiles.set(outOfOrder);
		const res = /** @type {any} */ (
			buildUnfoldData({ fileIds: [1, 2], channelKey: 'BT|355|P', transform: 'P' })
		);
		expect(Array.from(res.z[0])).toEqual([10, 20]);
	});
});
