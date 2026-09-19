<script>
	import { files, licelFiles, MODAL_Z_INDEX } from '$lib/state/store';
	import { applySmoothing } from '$lib/state/processing';
	import { SMOOTHING_ALGORITHMS, getAlgorithm } from '$lib/smoothing';
	import { collectDistinctChannels } from '$lib/channels';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';

	/** @type {{ onClose?: () => void, onApply?: (cfg: { algorithm: string, params: Record<string, number | string>, channelKeys: string[] }) => void }} */
	let { onClose, onApply } = $props();

	let totalFiles = $state(/** @type {number} */ (0));
	let selectedAlgorithm = $state('');
	let params = $state(/** @type {Record<string, string>} */ ({}));
	let allChannels = $state(/** @type {Array<{ key: string, label: string, fileCount: number }>} */ ([]));
	let channelStates = $state(/** @type {Record<string, boolean>} */ ({}));

	function rebuildChannels() {
		const current = get(files);
		totalFiles = current.length;
		if (totalFiles === 0) {
			allChannels = [];
			channelStates = {};
			return;
		}
		const fileIds = current.map((f) => f.id);
		const groups = collectDistinctChannels(get(licelFiles), fileIds, () => 'all');
		const list = groups.get('all') ?? [];
		// Preserve existing selections for channels that still exist
		const next = {};
		for (const ch of list) {
			next[ch.key] = channelStates[ch.key] ?? true;
		}
		allChannels = list;
		channelStates = next;
	}

	// Registered in onMount so state writes from the store callback are not
	// tracked by an effect (which would re-trigger the subscription endlessly).
	onMount(() => {
		rebuildChannels();
		const unsubFiles = files.subscribe(() => rebuildChannels());
		const unsubData = licelFiles.subscribe(() => rebuildChannels());
		return () => {
			unsubFiles();
			unsubData();
		};
	});

	const algorithm = $derived(getAlgorithm(selectedAlgorithm));
	const currentParams = $derived(algorithm.params);

	/** @param {string} value @param {{ key: string, min?: number, max?: number }} param */
	function parseNumber(value, param) {
		if (value === '' || value == null) return NaN;
		const number = Number(value);
		return Number.isFinite(number) ? number : NaN;
	}

	/** @param {{ key: string, min?: number, max?: number }} param */
	function isParamValid(param) {
		const value = params[param.key];
		const num = parseNumber(value, param);
		if (!Number.isFinite(num)) return false;
		if (param.min !== undefined && num < param.min) return false;
		if (param.max !== undefined && num > param.max) return false;
		return true;
	}

	const allParamsValid = $derived(
		currentParams.length === 0 || currentParams.every((p) => isParamValid(p))
	);

	const selectedChannelKeys = $derived(
		Object.entries(channelStates)
			.filter(([, v]) => v)
			.map(([k]) => k)
	);
	const canApply = $derived(
		totalFiles > 0 && selectedAlgorithm !== '' && allParamsValid && selectedChannelKeys.length > 0
	);

	function handleToggleAll() {
		const allEnabled = Object.values(channelStates).every((v) => v);
		const next = {};
		for (const ch of allChannels) {
			next[ch.key] = !allEnabled;
		}
		channelStates = next;
	}

	function handleApply() {
		if (!canApply) return;
		/** @type {Record<string, number | string>} */
		const resolvedParams = {};
		for (const p of currentParams) {
			resolvedParams[p.key] = parseNumber(params[p.key], p);
		}
		onApply?.({
			algorithm: selectedAlgorithm,
			params: resolvedParams,
			channelKeys: selectedChannelKeys
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
		class="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
	>
		<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
			<span class="text-sm font-semibold text-gray-700">Сглаживание данных</span>
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
				<p class="text-sm text-gray-500">Нет загруженных файлов. Сначала откройте данные.</p>
			{:else if allChannels.length === 0}
				<p class="text-sm text-gray-500">В открытых файлах нет каналов с данными.</p>
			{:else}
				<!-- Channel selection -->
				<div>
					<div class="mb-1 flex items-center justify-between">
						<label class="block text-xs font-semibold tracking-wider text-gray-500 uppercase">
							Каналы
						</label>
						<button
							onclick={handleToggleAll}
							class="text-xs text-blue-600 hover:text-blue-800"
						>
							{Object.values(channelStates).every((v) => v) ? 'Снять все' : 'Выбрать все'}
						</button>
					</div>
					<div class="max-h-40 space-y-1 overflow-auto rounded border border-gray-200 p-2">
						{#each allChannels as ch (ch.key)}
							<label class="flex cursor-pointer items-center gap-2">
								<input
									type="checkbox"
									checked={channelStates[ch.key] ?? true}
									onchange={() => {
										channelStates = { ...channelStates, [ch.key]: !channelStates[ch.key] };
									}}
									class="accent-blue-600"
								/>
								<span class="truncate text-xs">{ch.label}</span>
								<span class="shrink-0 text-xs text-gray-400">({ch.fileCount})</span>
							</label>
						{/each}
					</div>
				</div>

				<!-- Algorithm selection -->
				<div>
					<label class="mb-1 block text-xs text-gray-500">Алгоритм сглаживания</label>
					<select
						bind:value={selectedAlgorithm}
						class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
					>
						<option value="" disabled>Выберите алгоритм…</option>
						{#each SMOOTHING_ALGORITHMS as alg}
							<option value={alg.id}>{alg.label}</option>
						{/each}
					</select>
				</div>

				<!-- Algorithm-specific parameters -->
				{#if selectedAlgorithm && currentParams.length > 0}
					<div class="space-y-3">
						{#each currentParams as param}
							<div>
								<label for="smooth-{param.key}" class="mb-1 block text-xs text-gray-500">
									{param.label}
								</label>
								<input
									id="smooth-{param.key}"
									type="number"
									bind:value={params[param.key]}
									min={param.min}
									max={param.max}
									step={param.step}
									placeholder={String(param.default)}
									class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none {isParamValid(
										param
									)
										? 'border-gray-300'
										: 'border-red-400 bg-red-50'}"
								/>
								{#if param.hint}
									<p class="mt-1 text-xs text-gray-400">{param.hint}</p>
								{/if}
								{#if params[param.key] !== '' && params[param.key] != null && !isParamValid(param)}
									<p class="mt-1 text-xs text-red-600">
										Введите число от {param.min ?? '—'} до {param.max ?? '—'}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
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
