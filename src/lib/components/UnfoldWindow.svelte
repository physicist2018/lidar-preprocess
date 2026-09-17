<script>
	import { zenithAngle, licelDataTouched } from '$lib/state/store';
	import { buildUnfoldData } from '$lib/state/unfold-data';
	import { onMount, onDestroy } from 'svelte';

	/** @type {{ config?: { fileIds: number[], channelKey: string, transform: string, channelLabel?: string, transformLabel?: string } | null }} */
	let { config = null } = $props();

	const unfoldConfig = config;
	let unfoldError = $state('');
	let unfoldInfo = $state('');
	/** @type {any} */
	let unfoldPlotData = null;
	let unfoldChartStarting = false;
	let unfoldRafId = 0;
	let chartRef = $state(/** @type {HTMLDivElement | null} */ (null));
	let plotlyInstance = $state(/** @type {any} */ (null));
	let PlotlyLib = /** @type {any} */ (null);

	/** @type {(() => void) | null} */
	let angleUnsub = null;
	/** @type {(() => void) | null} */
	let datasetUnsub = null;

	onMount(() => {
		// Rebuild the heatmap whenever the zenith angle changes.
		angleUnsub = zenithAngle.subscribe(() => {
			if (unfoldConfig) scheduleUnfoldUpdate();
		});
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
		initUnfoldChart();
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
</script>

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
