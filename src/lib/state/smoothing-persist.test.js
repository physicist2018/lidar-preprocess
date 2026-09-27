import { describe, it, expect } from 'bun:test';
import {
	sanitizeSmoothingSnapshot,
	snapshotToDialogPrefill,
	SMOOTHING_PERSIST_SCHEMA
} from './smoothing-persist';

function baseSnapshot(overrides = /** @type {any} */ ({})) {
	return {
		schemaVersion: SMOOTHING_PERSIST_SCHEMA,
		algorithm: 'savitzky_golay',
		params: {
			polynomialOrder: 3,
			baseWindowSize: 11,
			adaptivity: 1,
			minWindowSize: 3,
			maxWindowSize: 21
		},
		channelKeys: ['an:0:355', 'an:1:387'],
		options: {},
		...overrides
	};
}

describe('sanitizeSmoothingSnapshot', () => {
	it('accepts a well-formed snapshot and passes values through', () => {
		const snap = sanitizeSmoothingSnapshot(baseSnapshot());
		expect(snap).not.toBeNull();
		expect(snap?.algorithm).toBe('savitzky_golay');
		expect(snap?.params.polynomialOrder).toBe(3);
		expect(snap?.channelKeys).toEqual(['an:0:355', 'an:1:387']);
	});

	it('rejects a snapshot from an unknown future schemaVersion', () => {
		const snap = sanitizeSmoothingSnapshot(
			baseSnapshot({ schemaVersion: /** @type {any} */ (SMOOTHING_PERSIST_SCHEMA + 1) })
		);
		expect(snap).toBeNull();
	});

	it('rejects a snapshot referencing an algorithm that no longer exists', () => {
		const snap = sanitizeSmoothingSnapshot(baseSnapshot({ algorithm: 'ghost_algo' }));
		expect(snap).toBeNull();
	});

	it('substitutes defaults for params outside their declared range', () => {
		const snap = sanitizeSmoothingSnapshot(
			baseSnapshot({
				params: {
					polynomialOrder: 99, // max is 5
					baseWindowSize: 0, // min is 3
					adaptivity: 1,
					minWindowSize: 'not a number',
					maxWindowSize: 21
				}
			})
		);
		expect(snap?.params.polynomialOrder).toBe(2); // default
		expect(snap?.params.baseWindowSize).toBe(11); // default
		expect(snap?.params.minWindowSize).toBe(3); // default
		expect(snap?.params.maxWindowSize).toBe(21);
	});

	it('drops unknown param keys silently', () => {
		const snap = sanitizeSmoothingSnapshot(
			baseSnapshot({
				params: {
					polynomialOrder: 3,
					baseWindowSize: 11,
					adaptivity: 1,
					minWindowSize: 3,
					maxWindowSize: 21,
					someObsoleteKey: 42
				}
			})
		);
		expect(snap?.params.someObsoleteKey).toBeUndefined();
	});

	it('drops non-string entries from channelKeys', () => {
		const snap = sanitizeSmoothingSnapshot(
			baseSnapshot({
				channelKeys: ['an:0:355', 42, null, 'an:1:387', 'an:0:355']
			})
		);
		expect(snap?.channelKeys).toEqual(['an:0:355', 'an:1:387']);
	});

	it('ignores useMolecularProfile for non-regularization algorithms', () => {
		const snap = sanitizeSmoothingSnapshot(
			baseSnapshot({ options: { useMolecularProfile: true } })
		);
		expect(snap?.options.useMolecularProfile).toBe(false);
	});

	it('keeps useMolecularProfile=true only for regularization', () => {
		const snap = sanitizeSmoothingSnapshot(
			baseSnapshot({
				algorithm: 'regularization',
				params: {
					eps: 0.001,
					H: 4000,
					L: 300,
					lambda: 1,
					mu: 1
				},
				options: { useMolecularProfile: true }
			})
		);
		expect(snap?.options.useMolecularProfile).toBe(true);
	});

	it('rejects garbage payloads', () => {
		expect(sanitizeSmoothingSnapshot(null)).toBeNull();
		expect(sanitizeSmoothingSnapshot(undefined)).toBeNull();
		expect(sanitizeSmoothingSnapshot('oops')).toBeNull();
		expect(sanitizeSmoothingSnapshot({ algorithm: 42 })).toBeNull();
		expect(sanitizeSmoothingSnapshot({ algorithm: 'moving_average', params: 'nope' })).toBeNull();
	});
});

describe('snapshotToDialogPrefill', () => {
	it('returns null for an unsanitizable snapshot', () => {
		expect(snapshotToDialogPrefill(null)).toBeNull();
	});

	it('coerces numeric params to strings for <input type="number">', () => {
		const snap = sanitizeSmoothingSnapshot(baseSnapshot());
		const prefill = snapshotToDialogPrefill(snap);
		expect(prefill).not.toBeNull();
		expect(typeof prefill?.params.polynomialOrder).toBe('string');
		expect(prefill?.params.polynomialOrder).toBe('3');
	});

	it('clones channelKeys so later mutation cannot corrupt the snapshot', () => {
		const snap = sanitizeSmoothingSnapshot(baseSnapshot());
		const prefill = snapshotToDialogPrefill(snap);
		prefill?.channelKeys.push('mutated');
		expect(snap?.channelKeys.length).toBe(2);
	});
});

describe('saveSmoothingConfig (pure-coercion path)', () => {
	// saveSmoothingConfig is identical to sanitizeSmoothingSnapshot + kvSet:
	// it cannot be unit-tested for the IDB write without fake-indexeddb, so we
	// exercise the exact same coercion/clamping logic by running the snapshot
	// through sanitizeSmoothingSnapshot and asserting the resulting payload.

	it('drops unknown algorithms before reaching IDB', () => {
		const snap = sanitizeSmoothingSnapshot({
			schemaVersion: SMOOTHING_PERSIST_SCHEMA,
			algorithm: 'unknown',
			params: {},
			channelKeys: [],
			options: {}
		});
		expect(snap).toBeNull();
	});

	it('clamps out-of-range params to defaults before reaching IDB', () => {
		const snap = sanitizeSmoothingSnapshot({
			schemaVersion: SMOOTHING_PERSIST_SCHEMA,
			algorithm: 'savitzky_golay',
			params: {
				polynomialOrder: 999,
				baseWindowSize: 1,
				adaptivity: 1,
				minWindowSize: 3,
				maxWindowSize: 21
			},
			channelKeys: [],
			options: {}
		});
		expect(snap?.params.polynomialOrder).toBe(2);
		expect(snap?.params.baseWindowSize).toBe(11);
	});
});
