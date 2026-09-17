/**
 * Rough persisted size estimates. Used for the file list display and for
 * session metadata, so byte counts across the UI stay consistent.
 */

/**
 * Approximate number of bytes a single parsed Licel file takes in storage.
 * @param {any} lf
 * @returns {number}
 */
export function estimateLicelFileBytes(lf) {
	let bytes = 256; // header overhead approximation
	for (const p of lf.profiles ?? []) {
		bytes += (p.nDataPoints || 0) * 4;
	}
	return bytes;
}
