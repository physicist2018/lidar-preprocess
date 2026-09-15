/**
 * Pure helpers for inspecting Licel files and their profiles/channels.
 * No store or DOM access — everything data-dependent is passed in explicitly so
 * the module stays testable and free of import cycles.
 */

/**
 * Whether a profile carries data at all, regardless of its active flag.
 * @param {any} p
 */
export function hasData(p) {
	return p && p.data && p.data.length > 0;
}

/**
 * Whether a profile is a candidate for channel processing — it is active and
 * carries data. Inactive/empty profiles are ignored everywhere.
 * @param {any} p
 */
export function isProfileUsable(p) {
	return hasData(p) && p.active !== false;
}

/**
 * Iterate over the profiles carrying data of the given files, in file order,
 * invoking `fn(profile, licelFile, fileId)` for each. Inactive profiles are
 * skipped unless `includeInactive` is set. Stops early (and returns false) when
 * `fn` returns false, so validations can bail out of the whole batch.
 * @param {Map<number, any>} data
 * @param {number[]} fileIds
 * @param {(profile: any, licelFile: any, fileId: number) => boolean | void} fn
 * @param {{ includeInactive?: boolean }} [options]
 * @returns {boolean} false when iteration was stopped early
 */
export function forEachProfile(data, fileIds, fn, options = {}) {
	const includeInactive = options.includeInactive ?? false;
	for (const id of fileIds) {
		const lf = data.get(id);
		if (!lf) continue;
		for (const p of lf.profiles ?? []) {
			if (!hasData(p)) continue;
			if (!includeInactive && p.active === false) continue;
			if (fn(p, lf, id) === false) return false;
		}
	}
	return true;
}

/** @param {Float64Array} values */
export function allFinite(values) {
	for (let i = 0; i < values.length; i++) {
		if (!Number.isFinite(values[i])) return false;
	}
	return true;
}

/** @param {Float64Array} values */
export function meanValue(values) {
	let sum = 0;
	for (let i = 0; i < values.length; i++) sum += values[i];
	return sum / values.length;
}

/** @param {Float64Array} values */
export function medianValue(values) {
	if (values.length === 0) return NaN;
	const sorted = Float64Array.from(values);
	sorted.sort();
	const mid = sorted.length >> 1;
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Stable channel signature used to pair profiles across files.
 * @param {any} p
 */
export function profileKey(p) {
	return `${p.deviceID || ''}|${p.wavelength || ''}|${p.polarization || ''}`;
}

/**
 * Human-readable channel description (same convention as graph windows).
 * @param {any} p
 */
export function profileLabel(p) {
	const mode =
		p.deviceID === 'BC' ? 'фотон' : p.deviceID === 'BT' ? 'аналог' : p.deviceID || 'канал';
	const pol = p.polarization ? ` (${p.polarization})` : '';
	return `${p.wavelength || '?'} нм${pol} · ${mode}`;
}

/**
 * Whether two channels share the same axis: identical wavelength and
 * polarization. Uses exact equality to match licel-js `selectProfile`, which
 * pairs analog/photon channels by strict wavelength and polarization.
 * @param {{ wavelength: number, polarization: string }} a
 * @param {{ wavelength: number, polarization: string }} b
 */
export function sameChannelAxis(a, b) {
	return a.wavelength === b.wavelength && a.polarization === b.polarization;
}

/**
 * Collect distinct channels present in the given files, grouped by a
 * classifier. Each channel is keyed by `profileKey`; lists are sorted by
 * wavelength, device and polarization. Shared by the graph/unfold channel
 * picker and the merge dialog so their channel lists cannot drift apart.
 * A channel's `molecularCount` is the number of selected files in which the
 * channel already carries a computed pure molecular profile.
 * @param {Map<number, any>} data
 * @param {number[]} fileIds
 * @param {(p: any) => string} [classify] group name; empty string skips the profile
 * @returns {Map<string, Array<{ key: string, label: string, fileCount: number, molecularCount: number, wavelength: number, deviceID: string, polarization: string }>>}
 */
export function collectDistinctChannels(data, fileIds, classify = () => 'all') {
	/** @type {Map<string, Map<string, any>>} */
	const groups = new Map();

	forEachProfile(data, fileIds, (p) => {
		const group = classify(p);
		if (!group) return;
		let found = groups.get(group);
		if (!found) {
			found = new Map();
			groups.set(group, found);
		}
		const key = profileKey(p);
		const entry = found.get(key);
		const hasMolecular = Boolean(p.molecular && p.molecular.data && p.molecular.data.length > 0);
		if (entry) {
			entry.fileCount++;
			if (hasMolecular) entry.molecularCount++;
		} else {
			found.set(key, {
				key,
				label: profileLabel(p),
				fileCount: 1,
				molecularCount: hasMolecular ? 1 : 0,
				wavelength: p.wavelength,
				deviceID: p.deviceID,
				polarization: p.polarization
			});
		}
	});

	/** @type {Map<string, Array<any>>} */
	const result = new Map();
	for (const [group, found] of groups) {
		result.set(
			group,
			[...found.values()].sort(
				(a, b) =>
					Number(a.wavelength) - Number(b.wavelength) ||
					a.deviceID.localeCompare(b.deviceID) ||
					a.polarization.localeCompare(b.polarization)
			)
		);
	}
	return result;
}

/**
 * Find the single usable profile of a file whose channel key matches. Returns
 * a status: absent (`missing`) or several matches with the same key
 * (`ambiguous`). Inactive/data-less profiles are ignored, consistently with the
 * channel listings.
 * @param {any} lf
 * @param {string} key
 * @returns {{ profile: any } | { missing: true } | { ambiguous: true }}
 */
export function findChannelProfile(lf, key) {
	const matches = (lf.profiles ?? []).filter(
		/** @param {any} p */ (p) => isProfileUsable(p) && profileKey(p) === key
	);
	if (matches.length === 0) return { missing: true };
	if (matches.length > 1) return { ambiguous: true };
	return { profile: matches[0] };
}

/**
 * Mirror of the licel-js `selectProfile` routine: first non-glued profile of
 * the requested mode/wavelength whose polarization matches, where an empty
 * polarization acts as a wildcard. Used to confirm that `glue` will operate on
 * the exact validated profiles rather than an unintended same-wavelength one.
 * @param {any} lf
 * @param {boolean} isPhotonMode
 * @param {number} wavelength
 * @param {string} polarization
 * @returns {any}
 */
export function selectableProfile(lf, isPhotonMode, wavelength, polarization) {
	for (const p of lf.profiles ?? []) {
		if (p.deviceID === 'BG') continue;
		if ((p.deviceID === 'BC') !== isPhotonMode) continue;
		if (p.wavelength !== wavelength) continue;
		if (polarization === '' || p.polarization === polarization) return p;
	}
	return null;
}
