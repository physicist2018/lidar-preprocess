/**
 * Trigger a browser download of raw bytes and release the object URL.
 * @param {Uint8Array} bytes
 * @param {string} fileName
 * @param {string} [mime]
 */
export function downloadBytes(bytes, fileName, mime = 'application/zip') {
	const url = URL.createObjectURL(new Blob([/** @type {any} */ (bytes)], { type: mime }));
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}
