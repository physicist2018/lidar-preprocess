<script>
	import {
		licelFiles,
		savedChannelSelection,
		rememberChannelSelection,
		savedYScale,
		zenithAngle
	} from '$lib/state/store';
	import { updateWindowState } from '$lib/state/windows';
	import { resampleMolecular } from '$lib/molecular';
	import { get } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';

	/** @typedef {import('licelfile-js').LicelFile} LicelFile */
	/** @typedef {import('licelfile-js').LicelProfile} LicelProfile */
	/** @typedef {import('licelfile-js').LicelProfile & { molecular?: { data: ArrayLike<number>, zenithDeg?: number } }} ProfileWithMolecular */

	/** @type {{ id: number, fileName: string, fileId?: number | null, initialView?: any }} */
	let { id, fileName, fileId = null, initialView = null } = $props();

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

	let chartRef = $state(/** @type {HTMLDivElement | null} */ (null));
	let plotlyInstance = $state(/** @type {any} */ (null));
	let PlotlyLib = /** @type {any} */ (null);

	let channelStates = $state(/** @type {Record<string, boolean>} */ ({}));
	/** @type {any} */
	let licel = null;
	/** @type {Array<{ name: string, color: string, points: Array<{ x: number, y: number }>, molecularPoints: Array<{ x: number, y: number }> | null }>} */
	let channels = [];
	// Y axis scale of the graph window: 'linear' | 'log'. Falls back to the
	// globally remembered scale ("Кнопка 2"), otherwise linear.
	let yScale = $state(
		initialView?.yScale === 'log' || initialView?.yScale === 'linear'
			? initialView.yScale
			: get(savedYScale) === 'log'
				? 'log'
				: 'linear'
	);
	// Profile value transform: 'P' (raw signal) or 'Pr2' (range-corrected P·r²).
	let profileTransform = $state(
		initialView?.profileTransform === 'P' || initialView?.profileTransform === 'Pr2'
			? initialView.profileTransform
			: 'P'
	);
	// Zenith angle whose height extent is currently refit into the x axis range.
	let chartAlpha = /** @type {number | null} */ (null);

	if (fileId != null) {
		licel = get(licelFiles).get(fileId) ?? null;
	}
	if (licel) {
		channels = profilesToChannels(licel);
	}

	/** Apply range correction to a single value: P·r² when transform is 'Pr2'. */
	function correctY(y, j, binWidth) {
		if (profileTransform !== 'Pr2') return y;
		const distance = (j + 0.5) * binWidth;
		return y * distance * distance;
	}

	/** @param {LicelFile} lf */
	function profilesToChannels(lf) {
		const alphaRad = (get(zenithAngle) * Math.PI) / 180;
		const cosAlpha = Math.cos(alphaRad);
		return (lf.profiles ?? [])
			.filter((p) => p.active !== false)
			.map((/** @type {ProfileWithMolecular} */ p, i) => {
				const binWidth = p.binWidth > 0 ? p.binWidth : 1;
				const data = p.data ? Array.from(p.data) : [];
				const points = data.map((y, j) => ({
					x: j * binWidth * cosAlpha,
					y: correctY(y, j, binWidth)
				}));
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
						molecularPoints[count++] = { x: j * binWidth * cosAlpha, y: correctY(y, j, binWidth) };
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
		const saved = initialView?.channelStates || get(savedChannelSelection);
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
	let angleUnsub = null;
	/** @type {(() => void) | null} */
	let datasetUnsub = null;

	onMount(() => {
		// Redraw whenever the zenith angle changes: the height axis is derived
		// from the pristine distances.
		angleUnsub = zenithAngle.subscribe(() => {
			if (licel) {
				channels = profilesToChannels(licel);
				updateChart();
			}
		});
		if (!chartRef || channels.length === 0) return;
		initChart();
		if (fileId != null) {
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

	function handleToggleProfileTransform() {
		const next = profileTransform === 'P' ? 'Pr2' : 'P';
		profileTransform = next;
		if (licel) {
			channels = profilesToChannels(licel);
		}
		pushView();
		updateChart();
	}

	/** Write the current y scale / channel states back into the window record. */
	function pushView() {
		updateWindowState(id, { view: { yScale, channelStates, profileTransform } });
	}
</script>

<div class="flex h-full" style="min-height: 400px;">
	<!-- Left panel: channel list -->
	<div class="flex w-56 shrink-0 flex-col border-r border-gray-200">
		<div class="border-b border-gray-200 px-3 py-2">
			<h3 class="text-xs font-semibold tracking-wider text-gray-500 uppercase">Каналы</h3>
		</div>
		<div class="flex-1 space-y-1 overflow-auto p-2">
			{#if fileName}
				{#each Object.entries(channelStates) as [name, enabled]}
					<label class="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-gray-50">
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
				class="w-full rounded px-2 py-1.5 text-xs font-medium transition-colors {yScale === 'log'
					? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
					: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
			>
				{yScale === 'log' ? 'Лин. по Y' : 'Лог. по Y'}
			</button>
			<button
				onclick={handleToggleProfileTransform}
				class="w-full rounded px-2 py-1.5 text-xs font-medium transition-colors {profileTransform === 'Pr2'
					? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
					: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
			>
				{profileTransform === 'Pr2' ? 'P·r²' : 'P'}
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
