<script>
	import FileList from '$lib/components/FileList.svelte';
	import FileActions from '$lib/components/FileActions.svelte';
	import NonModalWindow from '$lib/components/NonModalWindow.svelte';
	import { openWindows, addWindow } from '$lib/state/store';

	let leftPercent = $state(20);

	let windows = $state([]);

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
		addWindow(`График: ${file.name}`);
	}
</script>

<div class="h-screen w-screen flex flex-col overflow-hidden bg-gray-50">
	<!-- Top bar -->
	<header class="h-12 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
		<h1 class="text-lg font-semibold text-gray-800">Lidar Viewer</h1>
		<div class="ml-auto flex gap-2">
			<button
				onclick={handleAddDemoWindow}
				class="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
			>
				+ Добавить окно
			</button>
		</div>
	</header>

	<!-- Main content -->
	<div class="flex flex-1 h-full">
		<!-- Left panel -->
		<div
			class="flex flex-col h-full bg-white border-r border-gray-200 transition-[width] duration-75"
			style="width: {leftPercent}%"
		>
			<div class="px-3 py-2 border-b border-gray-200">
				<h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Файлы</h2>
			</div>
			<div class="flex-1 overflow-auto">
				<FileList onDoubleClick={handleFileDoubleClick} />
			</div>
			<div class="border-t border-gray-200">
				<FileActions />
			</div>
		</div>

		<!-- Resizer -->
		<div
			role="presentation"
			class="w-1.5 cursor-col-resize bg-gray-300 hover:bg-blue-500 active:bg-blue-600 transition-colors shrink-0"
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
			class="relative h-full bg-gray-50 transition-[width] duration-75 overflow-auto"
			style="width: {100 - leftPercent}%"
		>
			{#each windows as win (win.id)}
				<NonModalWindow id={win.id} x={win.x} y={win.y} title={win.title} />
			{/each}
		</div>
	</div>
</div>
