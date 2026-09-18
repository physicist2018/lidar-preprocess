<script>
	import { files, MODAL_Z_INDEX } from '$lib/state/store';
	import { applySmoothing } from '$lib/state/processing';
	import { SMOOTHING_ALGORITHMS, getAlgorithm } from '$lib/smoothing';
	import { get } from 'svelte/store';

	/** @type {{ onClose?: () => void, onApply?: (cfg: { algorithm: string, params: Record<string, number | string> }) => void }} */
	let { onClose, onApply } = $props();

	let totalFiles = $state(/** @type {number} */ (get(files).length));
	let selectedAlgorithm = $state('');
	let params = $state(/** @type {Record<string, string>} */ ({}));

	$effect(() => {
		const unsub = files.subscribe((val) => {
			totalFiles = val.length;
		});
		return unsub;
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
		currentParams.length > 0 && currentParams.every((p) => isParamValid(p))
	);
	const canApply = $derived(totalFiles > 0 && selectedAlgorithm !== '' && allParamsValid);

	function handleApply() {
		if (!canApply) return;
		/** @type {Record<string, number | string>} */
		const resolvedParams = {};
		for (const p of currentParams) {
			resolvedParams[p.key] = parseNumber(params[p.key], p);
		}
		onApply?.({ algorithm: selectedAlgorithm, params: resolvedParams });
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
			{:else}
				<!-- Algorithm selection -->
				<div>
					<label class="mb-1 block text-xs text-gray-500">Алгоритм сглаживания</label>
					<select
						bind:value={selectedAlgorithm}
						class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
