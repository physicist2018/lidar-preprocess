<script>
	import { files, licelFiles, listUnfoldChannels, UNFOLD_TRANSFORMS } from '$lib/state/store';
	import { get } from 'svelte/store';

	/** @type {{ onClose?: () => void, onBuild?: (cfg: { fileIds: number[], channelKey: string, transform: string }) => void }} */
	let { onClose, onBuild } = $props();

	let channelOptions = $state(/** @type {Array<any>} */ ([]));
	let selectedChannelKey = $state('');
	let selectedTransform = $state('P');
	let totalSelected = $state(0);

	function recompute() {
		const selected = get(files).filter((f) => f.selected);
		totalSelected = selected.length;
		const opts = listUnfoldChannels(selected.map((f) => f.id));
		channelOptions = opts;
		if (!opts.some((o) => o.key === selectedChannelKey)) {
			selectedChannelKey = opts[0]?.key ?? '';
		}
	}

	$effect(() => {
		const unsubFiles = files.subscribe(() => recompute());
		const unsubData = licelFiles.subscribe(() => recompute());
		return () => {
			unsubFiles();
			unsubData();
		};
	});

	const canBuild = $derived(Boolean(selectedChannelKey) && totalSelected > 0);

	function handleBuild() {
		if (!canBuild) return;
		const fileIds = get(files)
			.filter((f) => f.selected)
			.map((f) => f.id);
		onBuild?.({ fileIds, channelKey: selectedChannelKey, transform: selectedTransform });
	}
</script>

<div class="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style="z-index: 10000">
	<div
		role="dialog"
		aria-modal="true"
		class="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
	>
		<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
			<span class="text-sm font-semibold text-gray-700">Нарисовать развертку</span>
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
			<!-- Channel selection -->
			<div>
				<h3 class="mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">Канал</h3>
				{#if totalSelected === 0}
					<p class="text-sm text-gray-500">
						Выделите файлы в списке слева, чтобы выбрать канал для развертки.
					</p>
				{:else if channelOptions.length === 0}
					<p class="text-sm text-gray-500">В выбранных файлах нет каналов с данными.</p>
				{:else}
					<div class="grid grid-cols-2 gap-1.5">
						{#each channelOptions as ch (ch.key)}
							<label
								class="flex cursor-pointer items-center gap-2 rounded border border-gray-200 px-2 py-1.5 transition-colors hover:bg-gray-50 {selectedChannelKey ===
								ch.key
									? 'border-blue-400 bg-blue-50'
									: ''}"
							>
								<input
									type="radio"
									name="unfoldChannel"
									value={ch.key}
									checked={selectedChannelKey === ch.key}
									onchange={() => (selectedChannelKey = ch.key)}
									class="accent-blue-600"
								/>
								<div class="min-w-0">
									<div class="text-sm text-gray-800">{ch.label}</div>
									<div class="text-xs text-gray-400">
										в {ch.fileCount} из {totalSelected} файлов
									</div>
								</div>
							</label>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Value transform -->
			<div>
				<h3 class="mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">
					Тип графика
				</h3>
				<div class="space-y-1.5">
					{#each UNFOLD_TRANSFORMS as t (t.id)}
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="radio"
								name="unfoldTransform"
								value={t.id}
								checked={selectedTransform === t.id}
								onchange={() => (selectedTransform = t.id)}
								class="accent-blue-600"
							/>
							<span class="text-sm text-gray-700">{t.label}</span>
						</label>
					{/each}
				</div>
			</div>
		</div>

		<div class="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
			<button
				onclick={() => onClose?.()}
				class="rounded bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
			>
				Отмена
			</button>
			<button
				onclick={handleBuild}
				disabled={!canBuild}
				class="rounded px-4 py-1.5 text-sm font-medium transition-colors {canBuild
					? 'bg-blue-600 text-white hover:bg-blue-700'
					: 'cursor-not-allowed bg-gray-200 text-gray-400'}"
			>
				Построить
			</button>
		</div>
	</div>
</div>
