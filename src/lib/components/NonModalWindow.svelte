<script>
	import { removeWindow } from '$lib/state/store';

	let { id, x, y, title } = $props();
	let windowRef = $state(null);
	let isDragging = $state(false);
	let dragOffset = { x: 0, y: 0 };
	let zIndex = $state(10);

	function handleMouseDown(e) {
		if (e.target.closest('.no-drag')) return;
		isDragging = true;
		const rect = windowRef.getBoundingClientRect();
		dragOffset.x = e.clientX - rect.left;
		dragOffset.y = e.clientY - rect.top;
		zIndex = getNextZIndex();
		e.preventDefault();

		function handleMove(e2) {
			if (!isDragging || !windowRef) return;
			const newX = e2.clientX - dragOffset.x;
			const newY = e2.clientY - dragOffset.y;
			windowRef.style.left = newX + 'px';
			windowRef.style.top = newY + 'px';
		}

		function handleUp() {
			isDragging = false;
			document.removeEventListener('mousemove', handleMove);
			document.removeEventListener('mouseup', handleUp);
		}

		document.addEventListener('mousemove', handleMove);
		document.addEventListener('mouseup', handleUp);
	}

	function handleClose() {
		removeWindow(id);
	}

	let highestZ = 10;
	function getNextZIndex() {
		return ++highestZ;
	}
</script>

<div
	bind:this={windowRef}
	tabindex="-1"
	class="absolute bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col overflow-hidden"
	style="left: {x}px; top: {y}px; width: 360px; min-height: 200px; z-index: {zIndex}"
	onmousedown={() => { zIndex = getNextZIndex(); }}
>
	<div
		role="presentation"
		class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-move select-none"
		onmousedown={handleMouseDown}
	>
		<span class="text-sm font-medium text-gray-700">{title}</span>
		<button
			onclick={handleClose}
			aria-label="Закрыть"
			class="no-drag w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>

	<div class="p-4 flex-1 overflow-auto">
		{#if title === 'Удаление фона'}
			<div class="text-gray-600 text-sm">
				<p>Удаление фона...</p>
				<div class="mt-3 h-2 bg-gray-100 rounded overflow-hidden">
					<div class="h-full bg-blue-500 rounded" style="width: 60%"></div>
				</div>
				<p class="mt-2 text-xs text-gray-400">Обработка выбранных файлов</p>
			</div>
		{:else if title === 'Склейка каналов'}
			<div class="text-gray-600 text-sm">
				<p>Склейка каналов...</p>
				<div class="mt-3 h-2 bg-gray-100 rounded overflow-hidden">
					<div class="h-full bg-green-500 rounded" style="width: 40%"></div>
				</div>
				<p class="mt-2 text-xs text-gray-400">Объединение выбранных файлов</p>
			</div>
		{:else if title === 'Обрезка по высоте'}
			<div class="text-gray-600 text-sm">
				<p>Обрезка по высоте...</p>
				<div class="mt-3 space-y-2">
					<label class="block">
						<span class="text-xs text-gray-500">Минимальная высота</span>
						<input type="number" class="mt-1 w-full text-sm border rounded px-2 py-1" placeholder="0" />
					</label>
					<label class="block">
						<span class="text-xs text-gray-500">Максимальная высота</span>
						<input type="number" class="mt-1 w-full text-sm border rounded px-2 py-1" placeholder="1000" />
					</label>
				</div>
			</div>
		{:else}
			<div class="text-gray-600 text-sm">
				<p>Окно: {title}</p>
				<p class="mt-2 text-xs text-gray-400">Перетащите за заголовок для перемещения.</p>
			</div>
		{/if}
	</div>
</div>
