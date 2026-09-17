/**
 * Shared display/formatting helpers used across components and modules.
 */

/**
 * Format a byte count as a human-readable string with metric units.
 * Uses a comma decimal separator (Russian locale style) like the rest of the UI.
 * @param {number} bytes
 * @returns {string} e.g. "1,5 КБ", "12 КБ", or "—" when not finite/positive
 */
export function formatBytes(bytes) {
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
 * Format an ISO timestamp (or any Date-compatible string) in the short
 * ru-RU date+time style, or "—" when it cannot be parsed.
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatDate(iso) {
	const d = new Date(iso ?? '');
	return Number.isFinite(d.getTime())
		? d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
		: '—';
}

/**
 * Sortable timestamp used in generated download file names, e.g. 20260915_101530.
 * @returns {string}
 */
export function fileNameStamp() {
	const now = new Date();
	const pad2 = (/** @type {number} */ n) => String(n).padStart(2, '0');
	return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(
		now.getHours()
	)}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
}
