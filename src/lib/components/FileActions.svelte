<script>
	import {
		files,
		toggleSelectAll,
		deleteSelected,
		mergeChannels,
		openFiles,
		savePackToZip,
		addWindow,
		addUnfoldWindow,
		showError
	} from '$lib/state/store';
	import UnfoldDialog from './UnfoldDialog.svelte';

	let fileItems = $state([]);
	let fileInput = $state(null);
	let unfoldDialogOpen = $state(false);

	$effect(() => {
		const unsub = files.subscribe((val) => {
			fileItems = val;
		});
		return unsub;
	});

	function handleSelectAll() {
		const allSelected = fileItems.every((f) => f.selected);
		toggleSelectAll(!allSelected);
	}

	function handleDeselectAll() {
		toggleSelectAll(false);
	}

	function handleDeleteSelected() {
		deleteSelected();
	}

	function handleRemoveBackground() {
		addWindow('Удаление фона');
	}

	function handleMedianFiltering() {
		addWindow('Медианная фильтрация');
	}

	function handleMergeChannels() {
		mergeChannels();
		addWindow('Склейка каналов');
	}

	function handleOpenFiles() {
		fileInput?.click();
	}

	async function handleFileSelect(e) {
		const file = e.target.files?.[0];
		if (!file) return;

		try {
			const buffer = await file.arrayBuffer();
			openFiles(buffer, file.name);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			showError(`Не удалось прочитать файл "${file.name}": ${detail}`);
		} finally {
			// Reset input so same file can be selected again
			e.target.value = '';
		}
	}

	function handleCropByHeight() {
		addWindow('Обрезка по высоте');
	}

	function handleDrawUnfold() {
		unfoldDialogOpen = true;
	}

	/**
	 * @param {{ fileIds: number[], channelKey: string, transform: string }} cfg
	 */
	function handleUnfoldBuild(cfg) {
		unfoldDialogOpen = false;
		addUnfoldWindow(cfg);
	}

	function handleSaveZip() {
		const bytes = savePackToZip();
		if (!bytes) return;

		const now = new Date();
		const pad2 = (/** @type {number} */ n) => String(n).padStart(2, '0');
		const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(
			now.getHours()
		)}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;

		const url = URL.createObjectURL(
			new Blob([/** @type {any} */ (bytes)], { type: 'application/zip' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = `lidar_${stamp}.zip`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}
</script>

<div class="flex flex-col gap-1.5 p-2">
	<!-- Hidden file input -->
	<input
		bind:this={fileInput}
		type="file"
		accept=".zip"
		class="hidden"
		onchange={handleFileSelect}
	/>
	<button
		onclick={handleSelectAll}
		class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
	>
		Выделить все
	</button>
	<button
		onclick={handleDeselectAll}
		class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
	>
		Снять выделение
	</button>
	<button
		onclick={handleDeleteSelected}
		class="w-full rounded bg-red-50 px-2.5 py-1.5 text-left text-xs text-red-700 transition-colors hover:bg-red-100"
	>
		Удалить выделенные
	</button>
	<div class="my-1 border-t border-gray-200"></div>
	<button
		onclick={handleMedianFiltering}
		class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
	>
		Медианная фильтрация
	</button>
	<button
		onclick={handleRemoveBackground}
		class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
	>
		Удалить фон
	</button>
	<button
		onclick={handleMergeChannels}
		class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
	>
		Склеить каналы
	</button>
	<button
		onclick={handleCropByHeight}
		class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
	>
		Обрезать по высоте
	</button>
	<button
		onclick={handleDrawUnfold}
		class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
	>
		Нарисовать развертку
	</button>
	<div class="my-1 border-t border-gray-200"></div>
	<button
		onclick={handleOpenFiles}
		class="w-full rounded bg-blue-50 px-2.5 py-1.5 text-left text-xs text-blue-700 transition-colors hover:bg-blue-100"
	>
		Открыть файлы
	</button>
	<button
		onclick={handleSaveZip}
		class="w-full rounded bg-blue-50 px-2.5 py-1.5 text-left text-xs text-blue-700 transition-colors hover:bg-blue-100"
	>
		Сохранить в ZIP
	</button>
</div>

{#if unfoldDialogOpen}
	<UnfoldDialog
		onClose={() => (unfoldDialogOpen = false)}
		onBuild={(cfg) => handleUnfoldBuild(cfg)}
	/>
{/if}
