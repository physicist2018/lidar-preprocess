import { describe, it, expect } from 'bun:test';
import { unzipSync, zipSync } from 'fflate';
import {
	ARCHIVE_ENTRY_MANIFEST,
	ARCHIVE_ENTRY_SNAPSHOT,
	FORMAT_VERSION,
	buildSessionArchive,
	parseSessionArchive,
	rehydrateSnapshot,
	sanitizeFileName
} from './session-archive';

/**
 * Runtime assertion that doubles as a type-guard: after it passes, TS narrows
 * the checked value (and any discriminant narrowed by it.
 * @param {any} value
 * @returns {asserts value}
 */
function truthy(value) {
	if (!value) throw new Error('expected truthy');
}

/** @param {Uint8Array} bytes @param {string} name @returns {string} */
function extractJsonEntry(bytes, name) {
	const entries = unzipSync(bytes);
	return new TextDecoder().decode(entries[name]);
}

function sampleSnapshot() {
	return {
		schemaVersion: 1,
		savedAt: '2026-09-15T00:00:00.000Z',
		appVersion: '1',
		ui: { leftPanelPercent: 33 },
		settings: {
			zenithAngle: 12.5,
			molecular: {
				meteo: {
					heights: new Float64Array([0, 1000, 2000]),
					press: new Float64Array([1013.25, 900.1, 800]),
					temp: new Float64Array([15.5, 8, 1])
				},
				sourceName: 'meteo.txt',
				zMin: 0,
				zMax: 5000
			},
			savedChannelSelection: null,
			savedYScale: 'log'
		},
		files: [
			{
				id: 1,
				name: 'a.lcd',
				size: '12 КБ',
				selected: true,
				lf: {
					measurementStartTime: new Date('2026-06-15T12:00:00.000Z'),
					measurementStopTime: null,
					latitude: 55.75,
					profiles: [
						{
							deviceID: 'BT',
							wavelength: 355,
							nDataPoints: 4,
							reserved: [7, 8, 9],
							data: new Float64Array([1.5, 2000000.25, -0.001, 0.1 + 0.2])
						}
					]
				}
			}
		],
		windows: [{ id: 5, title: 'График: a.lcd', x: 10, y: 40, z: 2 }]
	};
}

describe('buildSessionArchive', () => {
	it('produces an archive with a valid manifest', async () => {
		const res = await buildSessionArchive(sampleSnapshot(), { name: 'Тест' });
		truthy(res.ok);
		expect(res.bytes.byteLength).toBeGreaterThan(0);
		const manifest = JSON.parse(extractJsonEntry(res.bytes, ARCHIVE_ENTRY_MANIFEST));
		expect(manifest.format).toBe('lidar-session');
		expect(manifest.formatVersion).toBe(FORMAT_VERSION);
		expect(manifest.name).toBe('Тест');
		expect(typeof manifest.checksums.sessionJson).toBe('string');
	});
});

describe('parseSessionArchive', () => {
	it('rejects an empty file', async () => {
		const res = await parseSessionArchive(new Uint8Array(0));
		truthy(!res.ok);
		expect(res.code).toBe('empty');
	});

	it('rejects a random zip without a manifest', async () => {
		const bytes = zipSync({ 'readme.txt': new TextEncoder().encode('hi') });
		const res = await parseSessionArchive(bytes);
		truthy(!res.ok);
		expect(res.code).toBe('not-a-session');
	});

	it('rejects a random byte blob', async () => {
		const res = await parseSessionArchive(new TextEncoder().encode('not a zip'));
		truthy(!res.ok);
		expect(res.code).toBe('not-a-session');
	});

	it('rejects manifests of another format', async () => {
		const bytes = zipSync({
			[ARCHIVE_ENTRY_MANIFEST]: new TextEncoder().encode(
				JSON.stringify({ format: 'licel-pack', formatVersion: 1 })
			),
			[ARCHIVE_ENTRY_SNAPSHOT]: new TextEncoder().encode('{}')
		});
		const res = await parseSessionArchive(bytes);
		truthy(!res.ok);
		expect(res.code).toBe('not-a-session');
	});

	it('rejects future archive versions', async () => {
		const res = await buildSessionArchive(sampleSnapshot(), { name: 'x' });
		truthy(res.ok);
		const manifest = JSON.parse(extractJsonEntry(res.bytes, ARCHIVE_ENTRY_MANIFEST));
		const bytes = zipSync({
			[ARCHIVE_ENTRY_MANIFEST]: new TextEncoder().encode(
				JSON.stringify({ ...manifest, formatVersion: manifest.formatVersion + 1 })
			),
			[ARCHIVE_ENTRY_SNAPSHOT]: new TextEncoder().encode('{}')
		});
		const parsed = await parseSessionArchive(bytes);
		truthy(!parsed.ok);
		expect(parsed.code).toBe('unsupported');
	});

	it('detects a tampered session.json checksum', async () => {
		const res = await buildSessionArchive(sampleSnapshot(), { name: 'x' });
		truthy(res.ok);
		const manifest = JSON.parse(extractJsonEntry(res.bytes, ARCHIVE_ENTRY_MANIFEST));
		const bytes = zipSync({
			[ARCHIVE_ENTRY_MANIFEST]: new TextEncoder().encode(JSON.stringify(manifest)),
			[ARCHIVE_ENTRY_SNAPSHOT]: new TextEncoder().encode('{"tampered":true}')
		});
		const parsed = await parseSessionArchive(bytes);
		truthy(!parsed.ok);
		expect(parsed.code).toBe('corrupt');
	});

	it('rejects archives with too many entries', async () => {
		/** @type {Record<string, Uint8Array>} */
		const entries = {
			[ARCHIVE_ENTRY_MANIFEST]: new TextEncoder().encode(
				JSON.stringify({ format: 'lidar-session', formatVersion: 1 })
			)
		};
		for (let i = 0; i < 10_001; i++) {
			entries[`file${i}`] = new TextEncoder().encode('x');
		}
		const res = await parseSessionArchive(zipSync(entries));
		truthy(!res.ok);
		expect(res.code).toBe('too-large');
	});

	it('round-trips a snapshot with float64 fidelity', async () => {
		const source = sampleSnapshot();
		const res = await buildSessionArchive(source, { name: 'Сессия' });
		truthy(res.ok);
		const parsed = await parseSessionArchive(res.bytes);
		truthy(parsed.ok);
		const restored = rehydrateSnapshot(parsed.snapshot);

		expect(restored.files[0].lf.profiles[0].data).toBeInstanceOf(Float64Array);
		expect(Array.from(restored.files[0].lf.profiles[0].data)).toEqual([
			1.5,
			2000000.25,
			-0.001,
			0.1 + 0.2
		]);
		expect(restored.files[0].lf.profiles[0].reserved).toEqual([7, 8, 9]);
		expect(restored.files[0].lf.measurementStartTime).toBeInstanceOf(Date);
		expect(restored.settings.molecular.meteo.heights).toBeInstanceOf(Float64Array);
		expect(restored.windows).toEqual([{ id: 5, title: 'График: a.lcd', x: 10, y: 40, z: 2 }]);
		expect(restored.settings.zenithAngle).toBe(12.5);
		expect(parsed.manifest.schemaVersion).toBe(1);
	});

	it('serializes profile data as compact JSON arrays', async () => {
		const res = await buildSessionArchive(sampleSnapshot(), { name: 'Сессия' });
		truthy(res.ok);
		const sessionJson = JSON.parse(extractJsonEntry(res.bytes, ARCHIVE_ENTRY_SNAPSHOT));
		expect(Array.isArray(sessionJson.files[0].lf.profiles[0].data)).toBe(true);
		expect(sessionJson.files[0].lf.profiles[0].data).toEqual([1.5, 2000000.25, -0.001, 0.1 + 0.2]);
	});

	it('does not mutate the exported snapshot', async () => {
		const source = sampleSnapshot();
		await buildSessionArchive(source, { name: 'Сессия' });
		expect(source.files[0].lf.profiles[0].data).toBeInstanceOf(Float64Array);
		expect(source.files[0].lf.measurementStartTime).toBeInstanceOf(Date);
		expect(source.settings.molecular.meteo.heights).toBeInstanceOf(Float64Array);
	});
});

describe('rehydrateSnapshot', () => {
	it('converts numeric arrays and leaves other fields untouched', () => {
		const snap = {
			files: [
				{
					lf: {
						measurementStartTime: 'junk',
						measurementStopTime: null,
						profiles: [{ data: [1, 2], reserved: [1, 2, 3] }]
					}
				}
			],
			settings: { molecular: { meteo: { heights: [1, 2], press: 'x', temp: null } } }
		};
		rehydrateSnapshot(snap);
		expect(snap.files[0].lf.measurementStartTime).toBe('junk');
		expect(snap.files[0].lf.measurementStopTime).toBe(null);
		expect(snap.files[0].lf.profiles[0].data).toBeInstanceOf(Float64Array);
		expect(snap.files[0].lf.profiles[0].reserved).toEqual([1, 2, 3]);
		expect(snap.settings.molecular.meteo.press).toBe('x');
		expect(snap.settings.molecular.meteo.temp).toBe(null);
		expect(snap.settings.molecular.meteo.heights).toBeInstanceOf(Float64Array);
	});
});

describe('sanitizeFileName', () => {
	it('strips separators and control characters', () => {
		expect(sanitizeFileName('../Сессия: тест')).toBe('Сессия_тест');
		expect(sanitizeFileName('a/b\\c*d?e')).toBe('a_b_c_d_e');
	});

	it('falls back to a default', () => {
		expect(sanitizeFileName('')).toBe('session');
		expect(sanitizeFileName('   ')).toBe('session');
	});
});
