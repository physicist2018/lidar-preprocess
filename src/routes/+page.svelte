<script>
	import FileList from '$lib/components/FileList.svelte';
	import FileActions from '$lib/components/FileActions.svelte';
	import NonModalWindow from '$lib/components/NonModalWindow.svelte';
	import ErrorDialog from '$lib/components/ErrorDialog.svelte';
	import { openWindows, addWindow, restoreSession } from '$lib/state/store';
	import { onMount } from 'svelte';

	let leftPercent = $state(20);

	let windows = $state([]);

	onMount(() => {
		restoreSession();
	});

	$effect(() => {
		const unsub = openWindows.subscribe((val) => {
			windows = val;
		});
		return unsub;
	});

	function handleResize(newLeft) {
		leftPercent = newLeft;
	}

	function handleAddDemoWindow() {
		addWindow('Демонстрационное окно');
	}

	function handleFileDoubleClick(file) {
		addWindow(`График: ${file.name}`, undefined, { fileId: file.id });
	}
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-gray-50">
	<!-- Top bar -->
	<header class="flex h-12 shrink-0 items-center border-b border-gray-200 bg-white px-4">
		<h1 class="text-lg font-semibold text-gray-800">Lidar Viewer</h1>
		<div class="ml-auto flex gap-2">
			<button
				onclick={handleAddDemoWindow}
				class="rounded bg-blue-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-blue-700"
			>
				+ Добавить окно
			</button>
		</div>
	</header>

	<!-- Main content -->
	<div class="flex h-full min-h-0 flex-1 overflow-hidden">
		<!-- Left panel -->
		<div
			class="flex h-full flex-col border-r border-gray-200 bg-white transition-[width] duration-75"
			style="width: {leftPercent}%"
		>
			<div class="border-b border-gray-200 px-3 py-2">
				<h2 class="text-xs font-semibold tracking-wider text-gray-500 uppercase">Файлы</h2>
			</div>
			<div class="flex-1 overflow-auto">
				<FileList onDoubleClick={handleFileDoubleClick} />
			</div>
			<div class="min-h-0 shrink overflow-y-auto border-t border-gray-200">
				<FileActions />
			</div>
		</div>

		<!-- Resizer -->
		<div
			role="presentation"
			class="w-1.5 shrink-0 cursor-col-resize bg-gray-300 transition-colors hover:bg-blue-500 active:bg-blue-600"
			onmousedown={(e) => {
				e.preventDefault();
				let isDragging = false;
				isDragging = true;

				function handleMouseMove(e2) {
					if (!isDragging) return;
					const rect = e.target.parentElement.getBoundingClientRect();
					const offset = ((e2.clientX - rect.left) / rect.width) * 100;
					const clamped = Math.min(Math.max(offset, 15), 85);
					leftPercent = clamped;
				}

				function handleMouseUp() {
					isDragging = false;
					document.removeEventListener('mousemove', handleMouseMove);
					document.removeEventListener('mouseup', handleMouseUp);
				}

				document.addEventListener('mousemove', handleMouseMove);
				document.addEventListener('mouseup', handleMouseUp);
			}}
		></div>

		<!-- Right panel -->
		<div
			class="relative h-full overflow-auto bg-gray-50 transition-[width] duration-75"
			style="width: {100 - leftPercent}%"
		>
			{#each windows as win (win.id)}
				<NonModalWindow id={win.id} x={win.x} y={win.y} title={win.title} payload={win.payload} />
			{/each}
		</div>
	</div>

	<ErrorDialog />
</div>
