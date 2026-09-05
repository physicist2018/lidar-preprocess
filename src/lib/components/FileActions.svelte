<script>
	import { files, toggleSelectAll, deleteSelected, removeBackground, mergeChannels, openFiles, cropByHeight, addWindow } from '$lib/state/store';

	let fileItems = $state([]);

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

	function handleMergeChannels() {
		mergeChannels();
		addWindow('Склейка каналов');
	}

	function handleOpenFiles() {
		openFiles();
	}

	function handleCropByHeight() {
		cropByHeight();
		addWindow('Обрезка по высоте');
	}
</script>

<div class="p-2 flex flex-col gap-1.5">
	<button
		onclick={handleSelectAll}
		class="w-full text-left text-xs px-2.5 py-1.5 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
	>
		Выделить все
	</button>
	<button
		onclick={handleDeselectAll}
		class="w-full text-left text-xs px-2.5 py-1.5 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
	>
		Снять выделение
	</button>
	<button
		onclick={handleDeleteSelected}
		class="w-full text-left text-xs px-2.5 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
	>
		Удалить выделенные
	</button>
	<div class="border-t border-gray-200 my-1"></div>
	<button
		onclick={handleRemoveBackground}
		class="w-full text-left text-xs px-2.5 py-1.5 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
	>
		Удалить фон
	</button>
	<button
		onclick={handleMergeChannels}
		class="w-full text-left text-xs px-2.5 py-1.5 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
	>
		Склеить каналы
	</button>
	<button
		onclick={handleCropByHeight}
		class="w-full text-left text-xs px-2.5 py-1.5 rounded bg-gray-100 hover:bg-gray-200 transition-colors"
	>
		Обрезать по высоте
	</button>
	<div class="border-t border-gray-200 my-1"></div>
	<button
		onclick={handleOpenFiles}
		class="w-full text-left text-xs px-2.5 py-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
	>
		Открыть файлы
	</button>
</div>
