<script>
	import { files, backgroundRemoval, removeBackground } from '$lib/state/store';
	import { get } from 'svelte/store';

	/** @type {{ onClose?: () => void }} */
	let { onClose } = $props();

	let totalFiles = $state(/** @type {number} */ (get(files).length));
	let method = $state('average');
	let height = $state('');
	/** @type {File | null} */
	let referenceFile = $state(null);
	let referenceName = $state('');

	$effect(() => {
		const unsub = files.subscribe((val) => {
			totalFiles = val.length;
		});
		return unsub;
	});

	$effect(() => {
		const unsub = backgroundRemoval.subscribe((val) => {
			method = val.method;
			height = val.height;
			referenceFile = val.referenceFile;
			referenceName = val.referenceFile?.name || '';
		});
		return unsub;
	});

	/** @returns {number | null} */
	function parseHeight() {
		if (height === '' || height == null) return null;
		const value = Number(height);
		if (!Number.isFinite(value) || value < 0) return null;
		return value;
	}

	function isApplyDisabled() {
		if (totalFiles === 0) return true;
		if (method === 'reference') return !referenceFile;
		return parseHeight() == null;
	}

	/** @param {Event} e */
	function handleFileChange(e) {
		const input = /** @type {HTMLInputElement | null} */ (e.target);
		const file = input?.files?.[0];
		if (file) {
			referenceFile = file;
			referenceName = file.name;
		}
	}

	async function handleApply() {
		if (isApplyDisabled()) return;
		if (method === 'reference') {
			await removeBackground({ method, height: null, referenceFile });
		} else {
			const h = parseHeight();
			if (h == null) return;
			await removeBackground({ method, height: h, referenceFile: null });
		}
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
			<span class="text-sm font-semibold text-gray-700">Удаление фона</span>
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
				<div class="space-y-2">
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="radio"
							name="bgMethod"
							checked={method === 'average'}
							onchange={() => (method = 'average')}
							class="accent-blue-600"
						/>
						<span class="text-sm text-gray-700">Среднее арифметическое</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="radio"
							name="bgMethod"
							checked={method === 'median'}
							onchange={() => (method = 'median')}
							class="accent-blue-600"
						/>
						<span class="text-sm text-gray-700">Медиана</span>
					</label>
					<label class="flex cursor-pointer items-center gap-2">
						<input
							type="radio"
							name="bgMethod"
							checked={method === 'reference'}
							onchange={() => (method = 'reference')}
							class="accent-blue-600"
						/>
						<span class="text-sm text-gray-700">Референсный файл</span>
					</label>
				</div>

				{#if method === 'average' || method === 'median'}
					<div>
						<label class="mb-1 block text-xs text-gray-500">Высота начала, м</label>
						<input
							type="number"
							bind:value={height}
							min="0"
							placeholder="80000"
							class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
						/>
						{#if height !== '' && height != null && parseHeight() == null}
							<p class="mt-1 text-xs text-red-600">Введите неотрицательное число метров</p>
						{/if}
						<p class="mt-1 text-xs text-gray-400">
							Фон оценивается по отсчётам от этой высоты до конца канала и вычитается из сигнала.
						</p>
					</div>
				{/if}

				{#if method === 'reference'}
					<div>
						<label class="mb-1 block text-xs text-gray-500">Референсный файл</label>
						<input
							type="file"
							accept="*.*"
							onchange={handleFileChange}
							class="block w-full cursor-pointer text-xs text-gray-500 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
						/>
						{#if referenceName}
							<p class="mt-1 truncate text-xs text-gray-600">{referenceName}</p>
						{/if}
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
