<script>
	import { files, zenithAngle, MODAL_Z_INDEX } from '$lib/state/store';
	import { get } from 'svelte/store';

	/** @type {{ onClose?: () => void, onApply?: (alpha: number) => void }} */
	let { onClose, onApply } = $props();

	let totalFiles = $state(/** @type {number} */ (get(files).length));
	let alphaInput = $state(/** @type {string} */ (String(get(zenithAngle) ?? 0)));

	$effect(() => {
		const unsub = files.subscribe((val) => {
			totalFiles = val.length;
		});
		return unsub;
	});

	function parseAlpha() {
		const value = Number(alphaInput);
		return Number.isFinite(value) ? value : NaN;
	}

	const alphaValue = $derived(parseAlpha());
	const alphaValid = $derived(
		alphaInput !== '' && Number.isFinite(alphaValue) && alphaValue >= 0 && alphaValue <= 80
	);
	const canApply = $derived(totalFiles > 0 && alphaValid);

	function handleApply() {
		if (!canApply) return;
		onApply?.(alphaValue);
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
			<span class="text-sm font-semibold text-gray-700">Зенитный угол лидара</span>
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
				<div>
					<label for="zenith-angle" class="mb-1 block text-xs text-gray-500"
						>Зенитный угол, град</label
					>
					<input
						id="zenith-angle"
						type="number"
						bind:value={alphaInput}
						min="0"
						max="80"
						step="0.1"
						placeholder="0"
						class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none {alphaValid
							? 'border-gray-300'
							: 'border-red-400 bg-red-50'}"
					/>
					{#if !alphaValid}
						<p class="mt-1 text-xs text-red-600">Введите число от 0 до 80 градусов.</p>
					{/if}
					<p class="mt-1 text-xs text-gray-400">
						Высота пересчитается как z = r · cos(alpha) для всех точек всех каналов загруженных
						файлов.
					</p>
				</div>
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
