/** Version of the snapshot format produced by this build. */
export const SCHEMA_VERSION = 1;

/**
 * Validate and normalize a snapshot so a corrupt or obsolete record can never
 * break the whole workspace. Broken records are dropped and reported in
 * `warnings` instead of failing. Pure: no store or DOM access.
 * @param {any} raw
 * @param {() => any} [emptyFactory]
 * @returns {{ snapshot: any, warnings: string[] }}
 */
export function sanitizeSnapshot(raw, emptyFactory = defaultEmptySnapshot) {
	const warnings = [];
	if (!raw || typeof raw !== 'object') {
		return { snapshot: emptyFactory(), warnings: ['Снимок сессии повреждён'] };
	}

	/** @type {Array<{ id: number, name: string, size: string, selected: boolean, lf: any }>} */
	const cleanedFiles = [];
	const usedFileIds = new Set();
	let nextFileId = 1;
	const rawFiles = Array.isArray(raw.files) ? raw.files : [];
	for (const f of rawFiles) {
		if (!f || typeof f !== 'object' || typeof f.name !== 'string' || !f.lf) {
			warnings.push('Файл с повреждёнными данными пропущен');
			continue;
		}
		let id = Number.isFinite(f.id) ? f.id : null;
		if (id == null || usedFileIds.has(id)) {
			while (usedFileIds.has(nextFileId)) nextFileId++;
			id = nextFileId++;
			warnings.push(`Файлу «${f.name}» назначен новый идентификатор`);
		}
		usedFileIds.add(id);
		nextFileId = Math.max(nextFileId, id + 1);
		cleanedFiles.push({
			id,
			name: f.name,
			size: typeof f.size === 'string' ? f.size : '—',
			selected: f.selected === true,
			lf: f.lf
		});
	}

	/** @type {Array<any>} */
	const cleanedWindows = [];
	const usedWindowIds = new Set();
	const rawWindows = Array.isArray(raw.windows) ? raw.windows : [];
	for (const w of rawWindows) {
		const cleaned = sanitizeWindow(w, warnings);
		if (!cleaned) continue;
		if (usedWindowIds.has(cleaned.id)) {
			warnings.push(`Окно «${cleaned.title}» с повторяющимся идентификатором пропущено`);
			continue;
		}
		usedWindowIds.add(cleaned.id);
		cleanedWindows.push(cleaned);
	}

	return {
		snapshot: {
			schemaVersion: SCHEMA_VERSION,
			savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString(),
			appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '1',
			ui: sanitizeUi(raw.ui),
			settings: sanitizeSettings(raw.settings, warnings),
			files: cleanedFiles,
			windows: cleanedWindows
		},
		warnings
	};
}

/** @returns {any} */
export function defaultEmptySnapshot() {
	return {
		schemaVersion: SCHEMA_VERSION,
		savedAt: new Date().toISOString(),
		appVersion: '1',
		ui: { leftPanelPercent: 20 },
		settings: {
			zenithAngle: 0,
			molecular: defaultMolecularState(),
			savedChannelSelection: null,
			savedYScale: 'linear'
		},
		files: [],
		windows: []
	};
}

/** The neutral (no anchoring data) molecular anchoring state. */
export function defaultMolecularState() {
	return { meteo: null, sourceName: '', zMin: 0, zMax: 0 };
}

/**
 * @param {any} ui
 * @returns {{ leftPanelPercent: number }}
 */
export function sanitizeUi(ui) {
	const value = ui && typeof ui === 'object' ? ui.leftPanelPercent : 20;
	const clamped = Number.isFinite(value) ? Math.min(Math.max(value, 15), 85) : 20;
	return { leftPanelPercent: clamped };
}

/**
 * @param {any} settings
 * @param {string[]} warnings
 * @returns {{ zenithAngle: number, molecular: any, savedChannelSelection: any, savedYScale: string }}
 */
export function sanitizeSettings(settings, warnings = []) {
	const raw = settings && typeof settings === 'object' ? settings : {};
	let angle = raw.zenithAngle;
	angle = Number.isFinite(angle) && angle >= 0 && angle <= 80 ? angle : 0;
	if (raw.zenithAngle !== undefined && raw.zenithAngle !== 0 && angle === 0) {
		warnings.push('Зенитный угол вне допустимого диапазона сброшен на 0');
	}
	return {
		zenithAngle: angle,
		molecular: coerceMolecularState(raw.molecular),
		savedChannelSelection:
			raw.savedChannelSelection && typeof raw.savedChannelSelection === 'object'
				? raw.savedChannelSelection
				: null,
		savedYScale:
			raw.savedYScale === 'log' || raw.savedYScale === 'linear' ? raw.savedYScale : 'linear'
	};
}

/**
 * Accept the stored molecular anchoring state only when it is structurally
 * sound (floating meteo vectors of equal length).
 * @param {any} state
 * @returns {any}
 */
export function coerceMolecularState(state) {
	if (!state || typeof state !== 'object') return defaultMolecularState();
	const meteo = state.meteo;
	const isFlatProfile =
		meteo &&
		isNumericProfile(meteo.heights) &&
		isNumericProfile(meteo.press) &&
		isNumericProfile(meteo.temp) &&
		meteo.heights.length >= 2 &&
		meteo.heights.length === meteo.press.length &&
		meteo.press.length === meteo.temp.length;
	if (!isFlatProfile) return defaultMolecularState();
	return {
		meteo,
		sourceName: typeof state.sourceName === 'string' ? state.sourceName : '',
		zMin: Number.isFinite(state.zMin) ? state.zMin : 0,
		zMax: Number.isFinite(state.zMax) ? state.zMax : 0
	};
}

/** @param {any} x */
export function isNumericProfile(x) {
	return x && (Array.isArray(x) || ArrayBuffer.isView(x));
}

/**
 * @param {any} w
 * @param {string[]} warnings
 * @returns {any | null}
 */
export function sanitizeWindow(w, warnings = []) {
	if (!w || typeof w !== 'object' || typeof w.title !== 'string') {
		warnings.push('Окно с повреждёнными данными пропущено');
		return null;
	}
	const num = (/** @type {any} */ v, /** @type {number} */ d) => (Number.isFinite(v) ? v : d);
	const rawView = w.view && typeof w.view === 'object' ? w.view : null;
	return {
		id: Number.isFinite(w.id) ? w.id : Date.now(),
		title: w.title,
		x: Math.max(0, num(w.x, 20)),
		y: Math.max(0, num(w.y, 20)),
		width: Number.isFinite(w.width) ? Math.max(320, w.width) : null,
		height: Number.isFinite(w.height) ? Math.max(200, w.height) : null,
		z: Math.max(0, num(w.z, 0)),
		collapsed: w.collapsed === true,
		maximized: w.maximized === true,
		view:
			rawView && typeof rawView === 'object'
				? {
						yScale: rawView.yScale === 'log' || rawView.yScale === 'linear' ? rawView.yScale : null,
						channelStates:
							rawView.channelStates && typeof rawView.channelStates === 'object'
								? rawView.channelStates
								: null
					}
				: null,
		payload: w.payload && typeof w.payload === 'object' ? w.payload : {}
	};
}

/**
 * Bring an old snapshot up to the current format. Unknown (newer) versions are
 * rejected so a future format cannot be silently destroyed.
 * @param {any} data
 * @returns {{ snapshot: any, migrated: boolean, error?: string }}
 */
export function migrateSnapshot(data) {
	if (!data || typeof data.schemaVersion !== 'number') {
		data = { ...(data || {}), schemaVersion: 1 };
	}
	if (data.schemaVersion > SCHEMA_VERSION) {
		return {
			snapshot: data,
			migrated: false,
			error: `Формат сессии новее поддерживаемого (${data.schemaVersion} > ${SCHEMA_VERSION}).`
		};
	}
	let snapshot = data;
	while (typeof snapshot.schemaVersion === 'number' && snapshot.schemaVersion < SCHEMA_VERSION) {
		const next = MIGRATIONS[snapshot.schemaVersion];
		if (!next) break;
		snapshot = next(snapshot);
	}
	return { snapshot, migrated: snapshot.schemaVersion === SCHEMA_VERSION };
}

/**
 * Registry of format migrations: version N -> version N+1. A migration must
 * return a snapshot with schemaVersion = N+1.
 * @type {Record<number, (data: any) => any>}
 */
export const MIGRATIONS = {};

/** @param {any} snapshot @returns {number} rough persisted size in bytes */
export function estimateSnapshotBytes(snapshot) {
	let bytes = 512;
	for (const f of snapshot.files ?? []) {
		bytes += 256;
		for (const p of f.lf?.profiles ?? []) bytes += (p.nDataPoints || p.data?.length || 0) * 4;
	}
	bytes += (snapshot.windows?.length ?? 0) * 128;
	return bytes;
}

/**
 * Snap restored window origins into the current viewport so windows saved on a
 * larger monitor (or with positions far outside the visible area) can never
 * land fully off-screen and look "missing" after reopening a session.
 * @param {Array<any>} windows
 */
export function clampWindowsToViewport(windows) {
	const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
	const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
	const maxX = Math.max(0, vw - 320);
	const maxY = Math.max(0, vh - 150);
	for (const w of windows) {
		if (!w || typeof w !== 'object') continue;
		w.x = Number.isFinite(w.x) ? Math.min(Math.max(w.x, 0), maxX) : 20;
		w.y = Number.isFinite(w.y) ? Math.min(Math.max(w.y, 0), maxY) : 20;
	}
}
