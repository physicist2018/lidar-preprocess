<script>
	import { files, showError } from '$lib/state/store';
	import {
		toggleSelectAll,
		deleteSelected,
		mergeChannels,
		averageSelectedFiles,
		setZenithAngle,
		applyMolecularAnchoring,
		applySmoothing
	} from '$lib/state/processing';
	import { openFiles, savePackToZip } from '$lib/state/zip-io';
	import { downloadBytes } from '$lib/download';
	import { fileNameStamp } from '$lib/format';
	import { addUnfoldWindow } from '$lib/state/windows';
	import UnfoldDialog from './UnfoldDialog.svelte';
	import MergeChannelsDialog from './MergeChannelsDialog.svelte';
	import ZenithAngleDialog from './ZenithAngleDialog.svelte';
	import MolecularAnchoringDialog from './MolecularAnchoringDialog.svelte';
	import RemoveBackgroundDialog from './RemoveBackgroundDialog.svelte';
	import MedianFilterDialog from './MedianFilterDialog.svelte';
	import CropByHeightDialog from './CropByHeightDialog.svelte';
	import SmoothDialog from './SmoothDialog.svelte';

	let fileItems = $state(/** @type {Array<any>} */ ([]));
	let fileInput = $state(/** @type {HTMLInputElement | null} */ (null));
	let unfoldDialogOpen = $state(false);
	let mergeDialogOpen = $state(false);
	let zenithDialogOpen = $state(false);
	let molecularDialogOpen = $state(false);
	let removeBgOpen = $state(false);
	let medianOpen = $state(false);
	let cropOpen = $state(false);
	let smoothOpen = $state(false);

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

	function handleDeleteSelected() {
		deleteSelected();
	}

	function handleRemoveBackground() {
		removeBgOpen = true;
	}

	function handleMedianFiltering() {
		medianOpen = true;
	}

	function handleMergeChannels() {
		mergeDialogOpen = true;
	}

	/**
	 * @param {{ analogKey: string, photonKey: string, h1: number, h2: number }} cfg
	 */
	function handleMergeApply(cfg) {
		mergeDialogOpen = false;
		mergeChannels(cfg);
	}

	function handleOpenFiles() {
		fileInput?.click();
	}

	/** @param {Event} e */
	async function handleFileSelect(e) {
		const input = /** @type {HTMLInputElement | null} */ (e.target);
		const file = input?.files?.[0];
		if (!file) return;

		try {
			const buffer = await file.arrayBuffer();
			openFiles(buffer, file.name);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			showError(`Не удалось прочитать файл "${file.name}": ${detail}`);
		} finally {
			// Reset input so same file can be selected again
			if (input) input.value = '';
		}
	}

	function handleCropByHeight() {
		cropOpen = true;
	}

	function handleDrawUnfold() {
		unfoldDialogOpen = true;
	}

	function handleZenithAngle() {
		zenithDialogOpen = true;
	}

	/**
	 * @param {number} alpha
	 */
	function handleZenithApply(alpha) {
		zenithDialogOpen = false;
		setZenithAngle(alpha);
	}

	function handleAverageFiles() {
		averageSelectedFiles();
	}

	function handleMolecularAnchoring() {
		molecularDialogOpen = true;
	}

	/**
	 * @param {{ meteo: any, zMin: number, zMax: number, sourceName: string }} cfg
	 */
	function handleMolecularApply(cfg) {
		molecularDialogOpen = false;
		applyMolecularAnchoring(cfg);
	}

	function handleSmooth() {
		smoothOpen = true;
	}

	/**
	 * @param {{ algorithm: string, params: Record<string, number | string> }} cfg
	 */
	function handleSmoothApply(cfg) {
		smoothOpen = false;
		applySmoothing(cfg);
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
		downloadBytes(bytes, `lidar_${fileNameStamp()}.zip`);
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
		Выделить/снять выделение
	</button>
	<button
		onclick={handleDeleteSelected}
		class="w-full rounded bg-red-50 px-2.5 py-1.5 text-left text-xs text-red-700 transition-colors hover:bg-red-100"
	>
		Удалить выделенные
	</button>
	<div class="my-1 border-t border-gray-200"></div>
	<div class="grid grid-cols-2 gap-1.5">
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
			onclick={handleZenithAngle}
			class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
		>
			Задать зенитный угол лидара
		</button>
		<button
			onclick={handleDrawUnfold}
			class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
		>
			Нарисовать развертку
		</button>
		<button
			onclick={handleAverageFiles}
			class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
		>
			Усреднение файлов
		</button>
		<button
			onclick={handleMolecularAnchoring}
			class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
		>
			Молекулярная привязка
		</button>
		<button
			onclick={handleSmooth}
			class="w-full rounded bg-gray-100 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-200"
		>
			Сгладить данные
		</button>
	</div>
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

{#if mergeDialogOpen}
	<MergeChannelsDialog
		onClose={() => (mergeDialogOpen = false)}
		onApply={(cfg) => handleMergeApply(cfg)}
	/>
{/if}

{#if zenithDialogOpen}
	<ZenithAngleDialog
		onClose={() => (zenithDialogOpen = false)}
		onApply={(alpha) => handleZenithApply(alpha)}
	/>
{/if}

{#if molecularDialogOpen}
	<MolecularAnchoringDialog
		onClose={() => (molecularDialogOpen = false)}
		onApply={(cfg) => handleMolecularApply(cfg)}
	/>
{/if}

{#if removeBgOpen}
	<RemoveBackgroundDialog onClose={() => (removeBgOpen = false)} />
{/if}

{#if medianOpen}
	<MedianFilterDialog onClose={() => (medianOpen = false)} />
{/if}

{#if cropOpen}
	<CropByHeightDialog onClose={() => (cropOpen = false)} />
{/if}

{#if smoothOpen}
	<SmoothDialog onClose={() => (smoothOpen = false)} onApply={(cfg) => handleSmoothApply(cfg)} />
{/if}
