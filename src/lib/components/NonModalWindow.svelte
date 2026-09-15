<script>
	import {
		licelFiles,
		licelDataTouched,
		savedChannelSelection,
		rememberChannelSelection,
		savedYScale,
		zenithAngle
	} from '$lib/state/store';
	import {
		removeWindow,
		nextWindowZ,
		seedWindowZ,
		MAX_WINDOW_Z,
		updateWindowState
	} from '$lib/state/windows';
	import { buildUnfoldData } from '$lib/state/unfold-data';
	import { get } from 'svelte/store';
	import { resampleMolecular } from '$lib/molecular';
	import { onMount, onDestroy } from 'svelte';

	/** @typedef {import('licelfile-js').LicelFile} LicelFile */
	/** @typedef {import('licelfile-js').LicelProfile} LicelProfile */
	/** @typedef {import('licelfile-js').LicelProfile & { molecular?: { data: ArrayLike<number>, zenithDeg?: number } }} ProfileWithMolecular */

	const channelPalette = [
		'#2563eb', // blue
		'#dc2626', // red
		'#16a34a', // green
		'#ea580c', // orange
		'#9333ea', // purple
		'#0d9488', // teal
		'#ca8a04', // amber
		'#db2777', // pink
		'#0891b2', // cyan
		'#4f46e5', // indigo
		'#65a30d', // lime
		'#334155' // slate
	];

	let {
		id,
		x,
		y,
		title,
		width = null,
		height = null,
		z = null,
		collapsed = false,
		maximized = false,
		view = null,
		payload = {}
	} = $props();
	let posX = $state(x);
	let posY = $state(y);
	let windowRef = $state(/** @type {HTMLDivElement | null} */ (null));
	let isDragging = $state(false);
	let dragOffset = { x: 0, y: 0 };
	seedWindowZ(z ?? 0);
	let zIndex = $state(Number.isFinite(z) ? Math.min(z, MAX_WINDOW_Z) : nextWindowZ());
	let chartRef = $state(/** @type {HTMLDivElement | null} */ (null));
	let plotlyInstance = $state(/** @type {any} */ (null));
	let PlotlyLib = /** @type {any} */ (null);
	let isResizing = $state(false);
	let resizeStart = { x: 0, y: 0, w: 0, h: 0 };
	let windowWidth = $state(
		width ?? (title.startsWith('График: ') ? 640 : title.startsWith('Развертка: ') ? 820 : 360)
	);
	let windowHeight = $state(/** @type {number | null} */ (height)); // null = auto, explicit px after manual resize
	let collapsedState = $state(collapsed === true);
	let maximizedState = $state(maximized === true);
	let lastBounds = { x: posX, y: posY, width: windowWidth, height: windowHeight };

	let channelStates = $state(/** @type {Record<string, boolean>} */ ({}));
	// Per-window data resolved from the current dataset; refreshed whenever
	// licelFiles changes so graph windows reflect data-modifying operations.
	let fileName = $state('');
	/** @type {any} */
	let licel = null;
	/** @type {Array<{ name: string, color: string, points: Array<{ x: number, y: number }>, molecularPoints: Array<{ x: number, y: number }> | null }>} */
	let channels = [];
	// Y axis scale of the graph window: 'linear' | 'log'. Falls back to the
	// globally remembered scale ("Кнопка 2"), otherwise linear.
	let yScale = $state(
		view?.yScale === 'log' || view?.yScale === 'linear'
			? view.yScale
			: get(savedYScale) === 'log'
				? 'log'
				: 'linear'
	);
	// Zenith angle whose height extent is currently refit into the x axis range.
	let chartAlpha = /** @type {number | null} */ (null);

	// Extract filename from title "График: filename" and resolve the data source
	// from the current working dataset (licelFiles, keyed by file id via window payload).
	if (title.startsWith('График: ')) {
		fileName = title.slice(8);
		if (payload?.fileId != null) {
			licel = get(licelFiles).get(payload.fileId) ?? null;
		}
		if (licel) {
			channels = profilesToChannels(licel);
		}
	}

	// Unfold window: the payload carries the channel/transform config, while the
	// heatmap matrix is (re)built from the current dataset on every change.
	const isUnfoldWindow = title.startsWith('Развертка: ');
	/** @type {{ fileIds: number[], channelKey: string, transform: string, channelLabel?: string, transformLabel?: string } | null} */
	let unfoldConfig = isUnfoldWindow && payload?.unfold ? payload.unfold : null;

	let unfoldError = $state('');
	let unfoldInfo = $state('');
	/** @type {any} */
	let unfoldPlotData = null;
	let unfoldChartStarting = false;
	let unfoldRafId = 0;

	/** @param {LicelFile} lf */
	function profilesToChannels(lf) {
		const alphaRad = (get(zenithAngle) * Math.PI) / 180;
		const cosAlpha = Math.cos(alphaRad);
		return (lf.profiles ?? [])
			.filter((p) => p.active !== false)
			.map((/** @type {ProfileWithMolecular} */ p, i) => {
				const binWidth = p.binWidth > 0 ? p.binWidth : 1;
				const data = p.data ? Array.from(p.data) : [];
				const points = data.map((y, j) => ({ x: j * binWidth * cosAlpha, y }));
				let molecularPoints = null;
				if (p.molecular && p.molecular.data) {
					const molecular = p.molecular.data;
					const n = Math.min(molecular.length, data.length);
					// The stored profile lives on the height grid of the anchoring
					// zenith (z = j * binWidth * cos(zenithDeg)); when the current
					// zenith differs, resample it onto the current grid so the
					// overlay stays aligned with the measured signal.
					const anchorZenithDeg =
						typeof p.molecular.zenithDeg === 'number' ? p.molecular.zenithDeg : get(zenithAngle);
					const anchorDz = binWidth * Math.cos((anchorZenithDeg * Math.PI) / 180);
					const currentDz = binWidth * cosAlpha;
					const values =
						Math.abs(anchorDz - currentDz) <= 1e-6 * Math.max(anchorDz, currentDz)
							? molecular
							: resampleMolecular(molecular, anchorDz, currentDz);
					molecularPoints = new Array(n);
					let count = 0;
					for (let j = 0; j < n; j++) {
						const y = values[j];
						if (!Number.isFinite(y)) continue;
						molecularPoints[count++] = { x: j * binWidth * cosAlpha, y };
					}
					if (count === 0) molecularPoints = null;
					else if (count < n) molecularPoints = molecularPoints.slice(0, count);
				}
				const mode =
					p.deviceID === 'BC' ? 'фотон' : p.deviceID === 'BT' ? 'аналог' : p.deviceID || 'канал';
				const pol = p.polarization ? ` (${p.polarization})` : '';
				return {
					name: `${p.wavelength} нм${pol} · ${mode}`,
					color: channelPalette[i % channelPalette.length],
					points,
					molecularPoints
				};
			});
	}

	// Initialize channel states before mount: restore the persisted per-window
	// selection, otherwise the globally remembered selection ("Кнопка 2"),
	// otherwise every channel enabled.
	{
		/** @type {Record<string, boolean>} */
		const states = {};
		const saved = view?.channelStates || get(savedChannelSelection);
		for (const ch of channels) {
			states[ch.name] = saved ? (saved[ch.name] ?? false) : true;
		}
		channelStates = states;
	}
	if (channels.length > 0) pushView();

	// Keep graph windows in sync with the current dataset. Data-modifying
	// operations (background removal, crop by height, median filtering) mutate
	// profiles in place and publish a new licelFiles map, so re-read the file
	// and redraw the chart with fresh channel data instead of the snapshot taken
	// at window creation. The subscription is registered in onMount (not in
	// $effect) so that state writes here cannot re-trigger the effect.
	/** @type {(() => void) | null} */
	let datasetUnsub = null;
	/** @type {(() => void) | null} */
	let angleUnsub = null;

	onMount(() => {
		// Redraw whenever the zenith angle changes: graph windows re-derive the
		// height axis from the pristine distances, unfold windows rebuild the
		// heatmap with the new height rows.
		angleUnsub = zenithAngle.subscribe(() => {
			if (isUnfoldWindow) {
				if (unfoldConfig) scheduleUnfoldUpdate();
				return;
			}
			if (title.startsWith('График: ') && licel) {
				channels = profilesToChannels(licel);
				updateChart();
			}
		});
		if (isUnfoldWindow) {
			initUnfoldChart();
			if (unfoldConfig) {
				datasetUnsub = licelDataTouched.subscribe((touchedIds) => {
					// Skip rebuilds when the published change does not affect any of
					// this window's files (null = whole dataset may have changed).
					if (touchedIds != null && !touchedIds.some((id) => unfoldConfig.fileIds.includes(id))) {
						return;
					}
					scheduleUnfoldUpdate();
				});
			}
			return;
		}
		if (!chartRef || channels.length === 0) return;
		initChart();
		if (title.startsWith('График: ') && payload?.fileId != null) {
			const fileId = payload.fileId;
			datasetUnsub = licelFiles.subscribe((map) => {
				const next = map.get(fileId);
				if (!next) return;
				licel = next;
				const rebuilt = profilesToChannels(next);
				const nextStates = { ...channelStates };
				for (const ch of rebuilt) {
					if (!(ch.name in nextStates)) nextStates[ch.name] = true;
				}
				channelStates = nextStates;
				channels = rebuilt;
				updateChart();
				pushView();
			});
		}
	});

	onDestroy(() => {
		if (angleUnsub) {
			angleUnsub();
			angleUnsub = null;
		}
		if (datasetUnsub) {
			datasetUnsub();
			datasetUnsub = null;
		}
		if (unfoldRafId) {
			cancelAnimationFrame(unfoldRafId);
			unfoldRafId = 0;
		}
		if (plotlyInstance && PlotlyLib) {
			PlotlyLib.purge(chartRef);
			plotlyInstance = null;
		}
	});

	$effect(() => {
		if (!chartRef || !plotlyInstance || !PlotlyLib) return;
		if (typeof ResizeObserver === 'undefined' || typeof requestAnimationFrame === 'undefined')
			return;
		const el = chartRef;
		let rafId = 0;
		const observer = new ResizeObserver(() => {
			if (rafId) return;
			rafId = requestAnimationFrame(() => {
				rafId = 0;
				PlotlyLib.Plots.resize(el);
			});
		});
		observer.observe(el);
		// Guarantee a redraw even when the chart was first created with a zero
		// or stale size (e.g. right after a session restore): fire one resize
		// pass once the element has real dimensions.
		requestAnimationFrame(() => {
			const rect = el.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) PlotlyLib.Plots.resize(el);
		});
		return () => {
			observer.disconnect();
			if (rafId) cancelAnimationFrame(rafId);
		};
	});

	function initChart() {
		import('plotly.js-dist-min').then((Plotly) => {
			PlotlyLib = Plotly;
			if (channels.length === 0) return;

			const traces = buildTraces();

			let xRange = [0, 17000];
			if (licel) {
				let maxRange = 0;
				for (const ch of channels) {
					const last = ch.points[ch.points.length - 1];
					if (last) maxRange = Math.max(maxRange, last.x);
				}
				xRange = [0, maxRange || 1];
			}

			const layout = {
				xaxis: {
					title: { text: 'Высота, м' },
					range: xRange,
					zeroline: false,
					automargin: true
				},
				yaxis: {
					title: { text: 'Сигнал' },
					type: yScale,
					zeroline: false,
					automargin: true
				},
				hovermode: 'closest',
				showlegend: true,
				legend: {
					orientation: 'h',
					x: 0.5,
					xanchor: 'center',
					y: 1.15,
					yanchor: 'bottom'
				},
				margin: { l: 70, r: 30, t: 70, b: 70 },
				paper_bgcolor: 'white',
				plot_bgcolor: 'white'
			};

			const configPlotly = {
				responsive: true,
				displayModeBar: true,
				modeBarButtonsToRemove: ['lasso2d', 'select2d']
			};

			Plotly.newPlot(chartRef, traces, layout, configPlotly).then((/** @type {any} */ instance) => {
				plotlyInstance = instance;
				// Mirror Plotly's legend visibility toggle into the channel checkboxes.
				/** @type {any} */ (chartRef)?.on('plotly_legendclick', handlePlotlyLegendClick);
			});
		});
	}

	function buildTraces() {
		return channels.flatMap((ch) => {
			if (!channelStates[ch.name]) return [];
			const traces = [
				{
					x: ch.points.map((p) => p.x),
					y: ch.points.map((p) => p.y),
					name: ch.name,
					mode: 'lines',
					showlegend: true,
					line: { color: ch.color, width: 1.5, dash: 'solid' },
					connectgaps: false
				}
			];
			if (ch.molecularPoints && ch.molecularPoints.length > 0) {
				traces.push({
					x: ch.molecularPoints.map((p) => p.x),
					y: ch.molecularPoints.map((p) => p.y),
					name: `${ch.name} · мол.`,
					mode: 'lines',
					showlegend: false,
					line: { color: ch.color, width: 1.2, dash: 'dash' },
					connectgaps: false
				});
			}
			return traces;
		});
	}

	function updateChart() {
		if (!PlotlyLib || !plotlyInstance || !chartRef) return;
		if (channels.length === 0) return;
		const alpha = get(zenithAngle);
		let layout = plotlyInstance.layout;
		// Re-fit the height axis only when the zenith angle changed; otherwise
		// keep the live layout so the user's zoom/pan survives redraws.
		if (chartAlpha !== alpha) {
			let maxX = 0;
			for (const ch of channels) {
				const last = ch.points[ch.points.length - 1];
				if (last) maxX = Math.max(maxX, last.x);
			}
			layout = {
				...plotlyInstance.layout,
				xaxis: { ...plotlyInstance.layout.xaxis, range: [0, maxX || 1] }
			};
			chartAlpha = alpha;
		}
		PlotlyLib.react(chartRef, buildTraces(), layout);
	}

	/** @param {Date} d */
	function formatUnfoldTime(d) {
		if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return '—';
		return d.toLocaleTimeString('ru-RU', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function rebuildUnfoldData() {
		unfoldPlotData = null;
		if (!unfoldConfig) return;
		const res = buildUnfoldData(unfoldConfig);
		if (res && 'error' in res) {
			unfoldError = res.error;
			unfoldInfo = '';
			return;
		}
		unfoldError = '';
		unfoldPlotData = res;
		const decimated = res.downsampled ? ' · сетка прорежена' : '';
		unfoldInfo = `${res.nFiles} изм. · ${formatUnfoldTime(res.timeStart)} — ${formatUnfoldTime(
			res.timeStop
		)}${decimated}`;
	}

	function purgeUnfoldChart() {
		if (PlotlyLib && plotlyInstance && chartRef) {
			PlotlyLib.purge(chartRef);
		}
		plotlyInstance = null;
	}

	function drawUnfoldChart() {
		if (!PlotlyLib || !unfoldPlotData || !chartRef) return;
		const { times, y, z, transformLabel, zMin, zMax } = unfoldPlotData;
		const spanMs = times[times.length - 1].getTime() - times[0].getTime();
		const trace = {
			x: times,
			y,
			z,
			type: 'heatmap',
			colorscale: 'Viridis',
			...(zMin != null && zMax != null && { zmin: zMin, zmax: zMax }),
			connectgaps: false,
			colorbar: { title: { text: transformLabel }, thickness: 14 }
		};
		const layout = {
			xaxis: {
				title: { text: 'Время' },
				type: 'date',
				tickformat: spanMs <= 86400000 ? '%H:%M:%S' : '%d.%m %H:%M',
				hoverformat: '%d.%m.%Y %H:%M:%S',
				automargin: true,
				zeroline: false
			},
			yaxis: {
				title: { text: 'Высота, м' },
				automargin: true,
				zeroline: false
			},
			hovermode: 'closest',
			margin: { l: 70, r: 30, t: 30, b: 70 },
			paper_bgcolor: 'white',
			plot_bgcolor: 'white'
		};
		const plotlyConfig = {
			responsive: true,
			displayModeBar: true,
			modeBarButtonsToRemove: ['lasso2d', 'select2d']
		};
		PlotlyLib.react(chartRef, [trace], layout, plotlyConfig).then((/** @type {any} */ instance) => {
			plotlyInstance = instance;
		});
	}

	async function initUnfoldChart() {
		if (!unfoldConfig || !chartRef || unfoldChartStarting) return;
		unfoldChartStarting = true;
		try {
			if (!PlotlyLib) PlotlyLib = await import('plotly.js-dist-min');
			rebuildUnfoldData();
			if (!unfoldError && unfoldPlotData) drawUnfoldChart();
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			unfoldError = `Не удалось построить график: ${detail}`;
		} finally {
			unfoldChartStarting = false;
		}
	}

	function updateUnfoldChart() {
		if (!unfoldConfig) return;
		if (!PlotlyLib || !plotlyInstance || !chartRef) {
			initUnfoldChart();
			return;
		}
		rebuildUnfoldData();
		if (unfoldError || !unfoldPlotData) {
			purgeUnfoldChart();
			return;
		}
		drawUnfoldChart();
	}

	function scheduleUnfoldUpdate() {
		if (unfoldRafId) return;
		unfoldRafId = requestAnimationFrame(() => {
			unfoldRafId = 0;
			updateUnfoldChart();
		});
	}

	/** @param {string} name */
	function channelCheckboxId(name) {
		return 'channel-checkbox-' + name.replace(/\s+/g, '_');
	}

	/**
	 * Sync the channel checkbox with the trace's visibility after a legend
	 * click. Plotly toggles the trace visibility on its own; here the resulting
	 * state is mirrored into the channel state and the checkbox element located
	 * by the trace's unique name-based id.
	 * @param {any} e
	 */
	function handlePlotlyLegendClick(e) {
		const trace = e?.fullData?.[e.curveNumber];
		if (!trace || typeof trace.name !== 'string' || !(trace.name in channelStates)) return;
		const wasVisible = trace.visible !== false && trace.visible !== 'legendonly';
		const nextState = !wasVisible;
		if (channelStates[trace.name] !== nextState) {
			channelStates = { ...channelStates, [trace.name]: nextState };
			pushView();
		}
		const checkbox = /** @type {HTMLInputElement | null} */ (
			document.getElementById(channelCheckboxId(trace.name))
		);
		if (checkbox && checkbox.checked !== nextState) {
			checkbox.checked = nextState;
		}
	}

	/** @param {string} name */
	function handleChannelToggle(name) {
		channelStates = { ...channelStates, [name]: !channelStates[name] };
		updateChart();
		pushView();
	}

	function handleToggleAllChannels() {
		const values = Object.values(channelStates);
		const allEnabled = values.length > 0 && values.every((v) => v);
		/** @type {Record<string, boolean>} */
		const next = {};
		for (const name of Object.keys(channelStates)) {
			next[name] = !allEnabled;
		}
		channelStates = next;
		updateChart();
		pushView();
	}

	function handleRememberChannels() {
		rememberChannelSelection(channelStates, yScale);
	}

	function handleToggleYScale() {
		const next = yScale === 'linear' ? 'log' : 'linear';
		yScale = next;
		pushView();
		if (!PlotlyLib || !plotlyInstance || !chartRef) return;
		const layout = {
			...plotlyInstance.layout,
			yaxis: { ...plotlyInstance.layout.yaxis, type: next, autorange: true }
		};
		PlotlyLib.react(chartRef, buildTraces(), layout).then((/** @type {any} */ instance) => {
			plotlyInstance = instance;
		});
	}

	/** Write the current y scale / channel states back into the window record. */
	function pushView() {
		updateWindowState(id, { view: { yScale, channelStates } });
	}

	/** Bring the window to the front and record the new z-order. */
	function bringToFront() {
		if (maximizedState) return;
		zIndex = nextWindowZ();
		updateWindowState(id, { z: zIndex });
	}

	function handleToggleCollapse() {
		collapsedState = !collapsedState;
		if (collapsedState) {
			lastBounds = { x: posX, y: posY, width: windowWidth, height: windowHeight };
		} else {
			posX = lastBounds.x;
			posY = lastBounds.y;
			windowWidth = lastBounds.width;
			windowHeight = lastBounds.height;
			updateWindowState(id, { x: posX, y: posY, width: windowWidth, height: windowHeight });
		}
		updateWindowState(id, { collapsed: collapsedState });
	}

	function handleToggleMaximize() {
		maximizedState = !maximizedState;
		if (maximizedState) {
			lastBounds = { x: posX, y: posY, width: windowWidth, height: windowHeight };
		} else {
			posX = lastBounds.x;
			posY = lastBounds.y;
			windowWidth = lastBounds.width;
			windowHeight = lastBounds.height;
			updateWindowState(id, { x: posX, y: posY, width: windowWidth, height: windowHeight });
		}
		updateWindowState(id, { maximized: maximizedState });
	}

	/** @param {MouseEvent} e */
	function handleResizeStart(e) {
		if (e.button !== 0 || !windowRef || maximizedState) return;
		const rect = windowRef.getBoundingClientRect();
		resizeStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
		isResizing = true;
		bringToFront();
		e.preventDefault();
		e.stopPropagation();

		/** @param {MouseEvent} e2 */
		function handleMove(e2) {
			if (!isResizing) return;
			windowWidth = Math.max(400, resizeStart.w + (e2.clientX - resizeStart.x));
			windowHeight = Math.max(445, resizeStart.h + (e2.clientY - resizeStart.y));
		}

		function handleUp() {
			isResizing = false;
			document.removeEventListener('mousemove', handleMove);
			document.removeEventListener('mouseup', handleUp);
			updateWindowState(id, {
				x: posX,
				y: posY,
				width: windowWidth,
				height: windowHeight
			});
		}

		document.addEventListener('mousemove', handleMove);
		document.addEventListener('mouseup', handleUp);
	}

	/** @param {MouseEvent} e */
	function handleMouseDown(e) {
		if (e.button !== 0) return;
		const target = /** @type {HTMLElement | null} */ (e.target);
		if (!target || target.closest('.no-drag')) return;
		if (!windowRef || maximizedState) return;

		const rect = windowRef.getBoundingClientRect();
		const startClientX = e.clientX;
		const startClientY = e.clientY;
		const startX = posX;
		const startY = posY;
		dragOffset.x = startClientX - rect.left;
		dragOffset.y = startClientY - rect.top;
		isDragging = true;
		bringToFront();
		e.preventDefault();

		/** @param {MouseEvent} e2 */
		function handleMove(e2) {
			if (!isDragging) return;
			let newX = startX + (e2.clientX - startClientX);
			let newY = startY + (e2.clientY - startClientY);
			newX = Math.max(newX, -dragOffset.x);
			newY = Math.max(newY, -dragOffset.y);
			posX = newX;
			posY = newY;
		}

		function handleUp() {
			isDragging = false;
			document.removeEventListener('mousemove', handleMove);
			document.removeEventListener('mouseup', handleUp);
			updateWindowState(id, { x: posX, y: posY });
		}

		document.addEventListener('mousemove', handleMove);
		document.addEventListener('mouseup', handleUp);
	}

	function handleClose() {
		removeWindow(id);
	}
</script>

<div
	bind:this={windowRef}
	tabindex="-1"
	class="absolute flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
	style="left: {maximizedState ? 0 : posX}px; top: {maximizedState
		? 0
		: posY}px; width: {maximizedState
		? '100%'
		: windowWidth + 'px'}; min-width: 320px; height: {maximizedState
		? '100%'
		: collapsedState
			? 32 + 'px'
			: windowHeight
				? windowHeight + 'px'
				: 'auto'}; min-height: {maximizedState || collapsedState ? 0 : 200}px; z-index: {zIndex}"
	onmousedown={bringToFront}
>
	<div
		role="presentation"
		class="flex cursor-move items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 select-none"
		onmousedown={handleMouseDown}
	>
		<span class="truncate text-sm font-medium text-gray-700">{title}</span>
		<div class="no-drag flex items-center gap-1">
			<button
				onclick={handleToggleCollapse}
				aria-label={collapsedState ? 'Развернуть' : 'Свернуть'}
				class="flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d={collapsedState ? 'M5 6l14 0M5 10l14 0M12 4l0 14' : 'M7 13l10 4M7 9l10 4'}
					/>
				</svg>
			</button>
			<button
				onclick={handleToggleMaximize}
				aria-label={maximizedState ? 'Восстановить размер' : 'Развернуть на весь экран'}
				class="flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d={maximizedState ? 'M6 7l12 4v8h12M10 16v-3M14 13v3' : 'M6 6l12 0v12h12'}
					/>
				</svg>
			</button>
			<button
				onclick={handleClose}
				aria-label="Закрыть"
				class="flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	</div>

	{#if !collapsedState}
		<!-- Graph window -->
		{#if title.startsWith('График: ')}
			<div class="flex h-full" style="min-height: 400px;">
				<!-- Left panel: channel list -->
				<div class="flex w-56 shrink-0 flex-col border-r border-gray-200">
					<div class="border-b border-gray-200 px-3 py-2">
						<h3 class="text-xs font-semibold tracking-wider text-gray-500 uppercase">Каналы</h3>
					</div>
					<div class="flex-1 space-y-1 overflow-auto p-2">
						{#if fileName}
							{#each Object.entries(channelStates) as [name, enabled]}
								<label
									class="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-gray-50"
								>
									<input
										type="checkbox"
										id={channelCheckboxId(name)}
										checked={enabled}
										onchange={() => handleChannelToggle(name)}
										class="accent-blue-600"
									/>
									<span class="truncate text-xs">{name}</span>
								</label>
							{/each}
						{/if}
					</div>
					<div class="space-y-1 border-t border-gray-200 px-2 py-2">
						<button
							onclick={handleToggleAllChannels}
							class="w-full rounded bg-gray-100 px-2 py-1.5 text-xs transition-colors hover:bg-gray-200"
						>
							Вкл / Выкл все
						</button>
						<button
							onclick={handleRememberChannels}
							class="w-full rounded bg-gray-100 px-2 py-1.5 text-xs transition-colors hover:bg-gray-200"
						>
							Запомнить
						</button>
						<button
							onclick={handleToggleYScale}
							class="w-full rounded px-2 py-1.5 text-xs font-medium transition-colors {yScale ===
							'log'
								? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
								: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
						>
							{yScale === 'log' ? 'Лин. по Y' : 'Лог. по Y'}
						</button>
					</div>
				</div>

				<!-- Right panel: chart -->
				<div class="flex-1 p-2">
					{#if channels.length === 0}
						<div class="flex h-full items-center justify-center text-sm text-gray-400">
							Данные файла недоступны
						</div>
					{:else}
						<div bind:this={chartRef} style="width: 100%; height: 100%; min-height: 300px;"></div>
					{/if}
				</div>
			</div>
		{:else if isUnfoldWindow}
			<div class="flex h-full flex-col" style="min-height: 400px;">
				{#if unfoldInfo}
					<div
						class="flex items-center justify-between border-b border-gray-200 px-3 py-1.5 text-xs text-gray-500"
					>
						<span>{unfoldInfo}</span>
						<span>{unfoldConfig?.channelLabel}</span>
					</div>
				{/if}
				<div class="relative min-h-0 flex-1 p-2">
					<div bind:this={chartRef} style="width: 100%; height: 100%; min-height: 300px;"></div>
					{#if unfoldError}
						<div
							class="absolute inset-2 z-10 flex items-center justify-center rounded bg-white/90 p-3 text-center text-sm text-red-600"
						>
							{unfoldError}
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex-1 overflow-auto p-4">
				<div class="text-sm text-gray-600">
					<p>Окно: {title}</p>
					<p class="mt-2 text-xs text-gray-400">Перетащите за заголовок для перемещения.</p>
				</div>
			</div>
		{/if}

		{#if title.startsWith('График: ') || isUnfoldWindow}
			<button
				onmousedown={handleResizeStart}
				aria-label="Изменить размер окна"
				class="no-drag absolute right-1 bottom-1 flex h-4 w-4 cursor-nwse-resize items-end justify-end text-gray-400 transition-colors select-none hover:text-blue-600"
				style="touch-action: none;"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="10"
					height="10"
					viewBox="0 0 10 10"
					fill="none"
				>
					<path
						d="M0 10 L10 0 M0 6 L6 0 M4 10 L10 4"
						stroke="currentColor"
						stroke-width="1.2"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		{/if}
	{/if}
</div>
