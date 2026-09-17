import { describe, it, expect } from 'bun:test';
import { formatBytes, formatDate, fileNameStamp } from './format';
import { estimateLicelFileBytes } from './size';

describe('formatBytes', () => {
	it('returns a dash for non-positive or missing sizes', () => {
		expect(formatBytes(0)).toBe('—');
		expect(formatBytes(-5)).toBe('—');
		expect(formatBytes(NaN)).toBe('—');
	});

	it('converts to metric units with a comma decimal separator', () => {
		expect(formatBytes(100)).toBe('100 B');
		expect(formatBytes(1023)).toBe('1023 B');
		expect(formatBytes(1536)).toBe('1,5 KB');
		expect(formatBytes(10485760)).toBe('10,0 MB');
	});
});

describe('formatDate', () => {
	it('formats valid ISO timestamps in short ru-RU style', () => {
		const out = formatDate('2026-09-15T10:30:00.000Z');
		expect(out).not.toBe('—');
		expect(out.length).toBeGreaterThan(0);
	});

	it('returns a dash for unparsable input', () => {
		expect(formatDate(null)).toBe('—');
		expect(formatDate('junk')).toBe('—');
	});
});

describe('fileNameStamp', () => {
	it('produces a sortable YYYYMMDD_HHmmss stamp', () => {
		expect(fileNameStamp()).toMatch(/^\d{8}_\d{6}$/);
	});
});

describe('estimateLicelFileBytes', () => {
	it('scales with profile point counts', () => {
		const small = estimateLicelFileBytes({ profiles: [{ nDataPoints: 10 }] });
		const large = estimateLicelFileBytes({ profiles: [{ nDataPoints: 10000 }] });
		expect(small).toBe(256 + 10 * 4);
		expect(large).toBeGreaterThan(small);
	});

	it('handles missing profiles', () => {
		expect(estimateLicelFileBytes({})).toBe(256);
	});
});
