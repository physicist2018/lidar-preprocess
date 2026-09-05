<script>
	import {
		files,
		toggleSelectAll,
		deleteSelected,
		removeBackground,
		mergeChannels,
		openFiles,
		cropByHeight,
		addWindow,
		showError
	} from '$lib/state/store';

	let fileItems = $state([]);
	let fileInput = $state(null);

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
		removeBackground();
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
		cropByHeight();
		addWindow('Обрезка по высоте');
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
	<div class="my-1 border-t border-gray-200"></div>
	<button
		onclick={handleOpenFiles}
		class="w-full rounded bg-blue-50 px-2.5 py-1.5 text-left text-xs text-blue-700 transition-colors hover:bg-blue-100"
	>
		Открыть файлы
	</button>
</div>
