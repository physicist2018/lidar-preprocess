<script>
	import { MODAL_Z_INDEX } from '$lib/state/store';

	/**
	 * @type {{
	 *   onClose?: () => void,
	 *   onApply?: (cfg: { min: number, max: number } | null) => void,
	 *   autoMin?: number | null,
	 *   autoMax?: number | null,
	 *   value?: { min: number, max: number } | null
	 * }}
	 */
	let { onClose, onApply, autoMin = null, autoMax = null, value = null } = $props();

	let auto = $state(value == null);
	let minInput = $state(value ? String(value.min) : '');
	let maxInput = $state(value ? String(value.max) : '');

	/** @param {string} s */
	function parseValue(s) {
		if (s === '' || s == null) return NaN;
		const n = Number(s);
		return Number.isFinite(n) ? n : NaN;
	}

	const minValue = $derived(parseValue(minInput));
	const maxValue = $derived(parseValue(maxInput));
	const rangeValid = $derived(
		auto || (Number.isFinite(minValue) && Number.isFinite(maxValue) && minValue < maxValue)
	);
	const canApply = $derived(rangeValid);
	const rangeError = $derived(
		!auto &&
			((minInput !== '' && !Number.isFinite(minValue)) ||
				(maxInput !== '' && !Number.isFinite(maxValue)) ||
				(minInput !== '' &&
					maxInput !== '' &&
					Number.isFinite(minValue) &&
					Number.isFinite(maxValue) &&
					minValue >= maxValue))
	);

	function handleApply() {
		if (!canApply) return;
		onApply?.(auto ? null : { min: minValue, max: maxValue });
	}
</script>

<div
	class="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
	style="z-index: {MODAL_Z_INDEX}"
>
	<div
		role="dialog"
		aria-modal="true"
		class="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
	>
		<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
			<span class="text-sm font-semibold text-gray-700">Диапазон значений</span>
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
			<label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
				<input type="checkbox" bind:checked={auto} class="accent-blue-600" />
				Автоматически (5–95 %)
			</label>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="cb-min" class="mb-1 block text-xs text-gray-500">Минимум</label>
					<input
						id="cb-min"
						type="number"
						bind:value={minInput}
						disabled={auto}
						placeholder="авто"
						class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
					/>
				</div>
				<div>
					<label for="cb-max" class="mb-1 block text-xs text-gray-500">Максимум</label>
					<input
						id="cb-max"
						type="number"
						bind:value={maxInput}
						disabled={auto}
						placeholder="авто"
						class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
					/>
				</div>
			</div>

			{#if rangeError}
				<p class="text-xs text-red-600">Минимум должен быть меньше максимума.</p>
			{/if}

			{#if autoMin != null && autoMax != null}
				<p class="text-xs text-gray-400">
					Автоматический диапазон по текущим данным: {autoMin.toExponential(2)} — {autoMax.toExponential(
						2
					)}.
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
