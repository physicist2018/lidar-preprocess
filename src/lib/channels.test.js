import { describe, it, expect } from 'bun:test';
import {
	forEachProfile,
	profileKey,
	profileLabel,
	sameChannelAxis,
	collectDistinctChannels,
	findChannelProfile,
	selectableProfile,
	meanValue,
	medianValue
} from './channels';

/** @param {any} overrides */
function profile(overrides = {}) {
	return {
		deviceID: 'BT',
		wavelength: 355,
		polarization: 'P',
		binWidth: 7.5,
		active: true,
		data: new Float64Array([1, 2, 3, 4]),
		...overrides
	};
}

/** @param {any[]} profiles */
function file(profiles) {
	return { name: 'f.lcd', profiles };
}

describe('profileKey / profileLabel', () => {
	it('builds a stable channel signature', () => {
		expect(profileKey(profile({ deviceID: 'BC', wavelength: 532, polarization: '' }))).toBe(
			'BC|532|'
		);
		expect(profileKey(profile())).toBe('BT|355|P');
	});

	it('describes channels in the graph-window convention', () => {
		expect(profileLabel(profile({ deviceID: 'BC' }))).toBe('355 нм (P) · фотон');
		expect(profileLabel(profile({ deviceID: 'BT', polarization: '' }))).toBe('355 нм · аналог');
		expect(profileLabel(profile({ deviceID: 'X', polarization: '' }))).toBe('355 нм · X');
	});
});

describe('sameChannelAxis', () => {
	it('requires identical wavelength and polarization', () => {
		expect(
			sameChannelAxis(
				{ wavelength: 355, polarization: 'P' },
				{ wavelength: 355, polarization: 'P' }
			)
		).toBe(true);
		expect(
			sameChannelAxis(
				{ wavelength: 355, polarization: 'P' },
				{ wavelength: 532, polarization: 'P' }
			)
		).toBe(false);
		expect(
			sameChannelAxis(
				{ wavelength: 355, polarization: 'P' },
				{ wavelength: 355, polarization: 'S' }
			)
		).toBe(false);
	});
});

describe('forEachProfile', () => {
	it('iterates profiles with data, skipping inactive ones', () => {
		const data = new Map([
			[1, file([profile(), profile({ active: false }), profile({ data: new Float64Array(0) })])],
			[2, file([profile({ wavelength: 532 })])]
		]);
		const seen = /** @type {Array<[number, number]>} */ ([]);
		forEachProfile(data, [1, 2], (p, lf, id) => {
			seen.push([id, p.wavelength]);
		});
		expect(seen).toEqual([
			[1, 355],
			[2, 532]
		]);
	});

	it('supports includeInactive and early stop', () => {
		const data = new Map([[1, file([profile(), profile({ active: false })])]]);
		const seen = /** @type {Array<any>} */ ([]);
		forEachProfile(
			data,
			[1],
			(p) => {
				seen.push(p);
			},
			{ includeInactive: true }
		);
		expect(seen).toHaveLength(2);

		const stopped = forEachProfile(data, [1], () => false);
		expect(stopped).toBe(false);
	});
});

describe('collectDistinctChannels', () => {
	it('groups channels, counting files and molecular profiles', () => {
		const lf1 = file([
			profile({ wavelength: 355, polarization: 'P' }),
			profile({ wavelength: 532, polarization: 'P', molecular: { data: new Float64Array(2) } })
		]);
		const lf2 = file([profile({ wavelength: 355, polarization: 'P' })]);
		const data = new Map([
			[1, lf1],
			[2, lf2]
		]);
		const groups = collectDistinctChannels(data, [1, 2]);
		const all = groups.get('all') ?? [];
		expect(all).toHaveLength(2);
		const by355 = /** @type {any} */ (all.find((c) => c.wavelength === 355));
		const by532 = /** @type {any} */ (all.find((c) => c.wavelength === 532));
		expect(by355.fileCount).toBe(2);
		expect(by355.molecularCount).toBe(0);
		expect(by532.fileCount).toBe(1);
		expect(by532.molecularCount).toBe(1);
		// Sorted by wavelength.
		expect(all.map((c) => c.wavelength)).toEqual([355, 532]);
	});

	it('classifies analog and photon channels into groups', () => {
		const data = new Map([
			[
				1,
				file([
					profile({ deviceID: 'BT' }),
					profile({ deviceID: 'BC' }),
					profile({ deviceID: 'BG' })
				])
			]
		]);
		const groups = collectDistinctChannels(data, [1], (p) =>
			p.deviceID === 'BT' ? 'analog' : p.deviceID === 'BC' ? 'photon' : ''
		);
		expect(groups.get('analog')).toHaveLength(1);
		expect(groups.get('photon')).toHaveLength(1);
		expect(groups.get('all')).toBeUndefined();
	});
});

describe('findChannelProfile', () => {
	it('finds a single usable match', () => {
		const lf = file([profile(), profile({ active: false })]);
		const res = findChannelProfile(lf, 'BT|355|P');
		expect('profile' in res).toBe(true);
	});

	it('reports missing and ambiguous results', () => {
		expect(findChannelProfile(file([profile()]), 'BC|532|')).toEqual({ missing: true });
		expect(findChannelProfile(file([profile(), profile()]), 'BT|355|P')).toEqual({
			ambiguous: true
		});
	});
});

describe('selectableProfile', () => {
	const lf = file([
		profile({ deviceID: 'BG' }),
		profile({ deviceID: 'BT', wavelength: 355, polarization: '' }),
		profile({ deviceID: 'BC', wavelength: 355, polarization: 'P' })
	]);

	it('mirrors licel-js selectProfile wildcard semantics', () => {
		expect(selectableProfile(lf, false, 355, '')?.deviceID).toBe('BT');
		expect(selectableProfile(lf, true, 355, 'P')?.deviceID).toBe('BC');
		expect(selectableProfile(lf, true, 355, 'S')).toBeNull();
		expect(selectableProfile(lf, false, 532, '')).toBeNull();
	});
});

describe('meanValue / medianValue', () => {
	it('computes mean and median', () => {
		expect(meanValue(new Float64Array([1, 2, 3]))).toBe(2);
		expect(medianValue(new Float64Array([3, 1, 2]))).toBe(2);
		expect(medianValue(new Float64Array([1, 2]))).toBe(1.5);
		expect(medianValue(new Float64Array(0))).toBeNaN();
	});
});
