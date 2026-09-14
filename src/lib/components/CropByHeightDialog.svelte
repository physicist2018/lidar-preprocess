<script>
	import { files, cropByHeightConfig, cropByHeight } from '$lib/state/store';
	import { get } from 'svelte/store';

	/** @type {{ onClose?: () => void }} */
	let { onClose } = $props();

	let totalFiles = $state(/** @type {number} */ (get(files).length));
	let maxHeight = $state('');

	$effect(() => {
		const unsub = files.subscribe((val) => {
			totalFiles = val.length;
		});
		return unsub;
	});

	$effect(() => {
		const unsub = cropByHeightConfig.subscribe((val) => {
			maxHeight = val.maxHeight;
		});
		return unsub;
	});

	/** @returns {number | null} */
	function parseMaxHeight() {
		const value = Number(maxHeight);
		if (!Number.isFinite(value) || value <= 0) return null;
		return value;
	}

	function isApplyDisabled() {
		return totalFiles === 0 || parseMaxHeight() == null;
	}

	async function handleApply() {
		const height = parseMaxHeight();
		if (height == null) return;
		await cropByHeight(height);
		onClose?.();
	}
</script>

<div class="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style="z-index: 10000">
	<div
		role="dialog"
		aria-modal="true"
		class="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
	>
		<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
			<span class="text-sm font-semibold text-gray-700">Обрезка по высоте</span>
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
					<label class="mb-1 block text-xs text-gray-500">Максимальная высота, м</label>
					<input
						type="number"
						bind:value={maxHeight}
						min="0"
						placeholder="7500"
						class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
					{#if maxHeight !== '' && maxHeight != null && parseMaxHeight() == null}
						<p class="mt-1 text-xs text-red-600">Введите положительное число</p>
					{/if}
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
				disabled={isApplyDisabled()}
				class="rounded px-4 py-1.5 text-sm font-medium transition-colors {isApplyDisabled()
					? 'cursor-not-allowed bg-gray-200 text-gray-400'
					: 'bg-blue-600 text-white hover:bg-blue-700'}"
			>
				Применить
			</button>
		</div>
	</div>
</div>
