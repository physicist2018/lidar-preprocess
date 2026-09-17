<script>
	import { files, licelFiles, MODAL_Z_INDEX } from '$lib/state/store';
	import { listMergeChannels } from '$lib/state/processing';
	import { sameChannelAxis } from '$lib/channels';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';

	/** @type {{ onClose?: () => void, onApply?: (cfg: { analogKey: string, photonKey: string, h1: number, h2: number, target: 'analog' | 'photon' }) => void }} */
	let { onClose, onApply } = $props();

	let analogOptions = $state(/** @type {Array<any>} */ ([]));
	let photonOptions = $state(/** @type {Array<any>} */ ([]));
	let selectedAnalogKey = $state('');
	let selectedPhotonKey = $state('');
	let selectedTarget = $state(/** @type {'analog' | 'photon'} */ ('analog'));
	let startHeight = $state('');
	let endHeight = $state('');
	let totalFiles = $state(0);
	let allPhotonOptions = /** @type {Array<any>} */ ([]);

	/**
	 * Pair a photon list with the analog channel selected by `analogKey` and
	 * fall back to the first compatible option when the current photon key no
	 * longer matches.
	 * @param {Array<any>} analogList
	 * @param {Array<any>} photonList
	 * @param {string} analogKey
	 * @param {string} photonKey
	 */
	function resolveSelection(analogList, photonList, analogKey, photonKey) {
		const analog = analogList.find((o) => o.key === analogKey) ?? analogList[0] ?? null;
		const photons = analog
			? photonList.filter((/** @type {any} */ p) => sameChannelAxis(p, analog))
			: photonList;
		const nextPhotonKey = photons.some((o) => o.key === photonKey)
			? photonKey
			: (photons[0]?.key ?? '');
		return { analogKey: analog?.key ?? '', photons, photonKey: nextPhotonKey };
	}

	function recompute() {
		const current = get(files);
		totalFiles = current.length;
		const opts = listMergeChannels(current.map((f) => f.id));
		const resolved = resolveSelection(
			opts.analog,
			opts.photon,
			selectedAnalogKey,
			selectedPhotonKey
		);

		analogOptions = opts.analog;
		allPhotonOptions = opts.photon;
		photonOptions = resolved.photons;
		selectedAnalogKey = resolved.analogKey;
		selectedPhotonKey = resolved.photonKey;
	}

	function handleAnalogChange() {
		const resolved = resolveSelection(
			analogOptions,
			allPhotonOptions,
			selectedAnalogKey,
			selectedPhotonKey
		);
		photonOptions = resolved.photons;
		selectedPhotonKey = resolved.photonKey;
	}

	// Registered in onMount so state writes from the store callback are not
	// tracked by an effect (which would re-trigger the subscription endlessly).
	onMount(() => {
		const unsubData = licelFiles.subscribe(() => recompute());
		return unsubData;
	});

	/** @param {string} value */
	function parseHeight(value) {
		if (value === '' || value == null) return NaN;
		const number = Number(value);
		return Number.isFinite(number) ? number : NaN;
	}

	const startValue = $derived(parseHeight(startHeight));
	const endValue = $derived(parseHeight(endHeight));
	const canApply = $derived(
		Boolean(selectedAnalogKey) &&
			Boolean(selectedPhotonKey) &&
			Number.isFinite(startValue) &&
			Number.isFinite(endValue) &&
			startValue >= 0 &&
			startValue < endValue
	);

	function handleApply() {
		if (!canApply) return;
		onApply?.({
			analogKey: selectedAnalogKey,
			photonKey: selectedPhotonKey,
			h1: startValue,
			h2: endValue,
			target: selectedTarget
		});
	}
</script>

<div
	class="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
	style="z-index: {MODAL_Z_INDEX}"
>
	<div
		role="dialog"
		aria-modal="true"
		class="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
	>
		<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
			<span class="text-sm font-semibold text-gray-700">Склейка каналов</span>
			<button
				onclick={() => onClose?.()}
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

		<div class="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
			{#if totalFiles === 0}
				<p class="text-sm text-gray-500">Нет открытых файлов для склейки.</p>
			{:else if analogOptions.length === 0 || photonOptions.length === 0}
				<p class="text-sm text-gray-500">
					В открытых файлах нет подходящей пары каналов «аналог» и «фотон».
				</p>
			{:else}
				<div>
					<label
						for="merge-analog"
						class="mb-1 block text-xs font-semibold tracking-wider text-gray-500 uppercase"
					>
						Канал «аналог»
					</label>
					<select
						id="merge-analog"
						bind:value={selectedAnalogKey}
						onchange={handleAnalogChange}
						class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
					>
						{#each analogOptions as ch (ch.key)}
							<option value={ch.key}>{ch.label} · в {ch.fileCount} файл(ах)</option>
						{/each}
					</select>
				</div>

				<div>
					<label
						for="merge-photon"
						class="mb-1 block text-xs font-semibold tracking-wider text-gray-500 uppercase"
					>
						Канал «фотон»
					</label>
					<select
						id="merge-photon"
						bind:value={selectedPhotonKey}
						class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
					>
						{#each photonOptions as ch (ch.key)}
							<option value={ch.key}>{ch.label} · в {ch.fileCount} файл(ах)</option>
						{/each}
					</select>
				</div>

				<div>
					<h3 class="mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">
						Привести к уровню
					</h3>
					<div class="space-y-1.5">
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="radio"
								name="mergeTarget"
								value="analog"
								checked={selectedTarget === 'analog'}
								onchange={() => (selectedTarget = 'analog')}
								class="accent-blue-600"
							/>
							<span class="text-sm text-gray-700">Аналогового канала (BT)</span>
						</label>
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="radio"
								name="mergeTarget"
								value="photon"
								checked={selectedTarget === 'photon'}
								onchange={() => (selectedTarget = 'photon')}
								class="accent-blue-600"
							/>
							<span class="text-sm text-gray-700">Фотонного канала (BC)</span>
						</label>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="merge-start" class="mb-1 block text-xs text-gray-500">Начало, м</label>
						<input
							id="merge-start"
							type="number"
							bind:value={startHeight}
							min="0"
							placeholder="500"
							class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
						/>
					</div>
					<div>
						<label for="merge-end" class="mb-1 block text-xs text-gray-500">Конец, м</label>
						<input
							id="merge-end"
							type="number"
							bind:value={endHeight}
							min="0"
							placeholder="2000"
							class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
						/>
					</div>
				</div>
				{#if (startHeight !== '' && Number.isFinite(startValue) && startValue < 0) || (endHeight !== '' && Number.isFinite(endValue) && startValue >= endValue)}
					<p class="text-xs text-red-600">
						Начало должно быть не меньше 0 и меньше конца диапазона.
					</p>
				{/if}
				<p class="text-xs text-gray-400">
					Диапазон задаёт участок, по которому подбирается коэффициент склейки аналогового и
					фотонного каналов.
				</p>
			{/if}
		</div>

		<div class="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
			<button
				onclick={() => onClose?.()}
				class="rounded bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
			>
				Отмена
			</button>
			<button
				onclick={handleApply}
				disabled={!canApply}
				class="rounded px-4 py-1.5 text-sm font-medium transition-colors {canApply
					? 'bg-blue-600 text-white hover:bg-blue-700'
					: 'cursor-not-allowed bg-gray-200 text-gray-400'}"
			>
				Применить
			</button>
		</div>
	</div>
</div>
