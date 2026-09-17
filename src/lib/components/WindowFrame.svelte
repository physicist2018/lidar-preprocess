<script>
	import {
		nextWindowZ,
		seedWindowZ,
		MAX_WINDOW_Z,
		updateWindowState,
		removeWindow
	} from '$lib/state/windows';

	/** @type {{ id: number, title: string, x: number, y: number, width?: number | null, height?: number | null, z?: number | null, collapsed?: boolean, maximized?: boolean, defaultWidth?: number, showResizeHandle?: boolean, content?: any }} */
	let {
		id,
		title,
		x,
		y,
		width = null,
		height = null,
		z = null,
		collapsed = false,
		maximized = false,
		defaultWidth = 360,
		showResizeHandle = false,
		content
	} = $props();

	let posX = $state(x);
	let posY = $state(y);
	let windowRef = $state(/** @type {HTMLDivElement | null} */ (null));
	let isDragging = $state(false);
	let dragOffset = { x: 0, y: 0 };
	seedWindowZ(z ?? 0);
	let zIndex = $state(
		Number.isFinite(z) ? Math.min(/** @type {number} */ (z), MAX_WINDOW_Z) : nextWindowZ()
	);
	let isResizing = $state(false);
	let resizeStart = { x: 0, y: 0, w: 0, h: 0 };
	let windowWidth = $state(width ?? defaultWidth);
	let windowHeight = $state(/** @type {number | null} */ (height)); // null = auto, explicit px after manual resize
	let collapsedState = $state(collapsed === true);
	let maximizedState = $state(maximized === true);
	let lastBounds = { x: posX, y: posY, width: windowWidth, height: windowHeight };

	/** Bring the window to the front and record the new z-order. */
	function bringToFront() {
		if (maximizedState) return;
		zIndex = nextWindowZ();
		updateWindowState(id, { z: zIndex });
	}

	function handleToggleCollapse() {
		collapsedState = !collapsedState;
		if (collapsedState) {
			lastBounds = { x: posX, y: posY, width: windowWidth, height: windowHeight };
		} else {
			posX = lastBounds.x;
			posY = lastBounds.y;
			windowWidth = lastBounds.width;
			windowHeight = lastBounds.height;
			updateWindowState(id, { x: posX, y: posY, width: windowWidth, height: windowHeight });
		}
		updateWindowState(id, { collapsed: collapsedState });
	}

	function handleToggleMaximize() {
		maximizedState = !maximizedState;
		if (maximizedState) {
			lastBounds = { x: posX, y: posY, width: windowWidth, height: windowHeight };
		} else {
			posX = lastBounds.x;
			posY = lastBounds.y;
			windowWidth = lastBounds.width;
			windowHeight = lastBounds.height;
			updateWindowState(id, { x: posX, y: posY, width: windowWidth, height: windowHeight });
		}
		updateWindowState(id, { maximized: maximizedState });
	}

	/** @param {MouseEvent} e */
	function handleResizeStart(e) {
		if (e.button !== 0 || !windowRef || maximizedState) return;
		const rect = windowRef.getBoundingClientRect();
		resizeStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
		isResizing = true;
		bringToFront();
		e.preventDefault();
		e.stopPropagation();

		/** @param {MouseEvent} e2 */
		function handleMove(e2) {
			if (!isResizing) return;
			windowWidth = Math.max(400, resizeStart.w + (e2.clientX - resizeStart.x));
			windowHeight = Math.max(445, resizeStart.h + (e2.clientY - resizeStart.y));
		}

		function handleUp() {
			isResizing = false;
			document.removeEventListener('mousemove', handleMove);
			document.removeEventListener('mouseup', handleUp);
			updateWindowState(id, {
				x: posX,
				y: posY,
				width: windowWidth,
				height: windowHeight
			});
		}

		document.addEventListener('mousemove', handleMove);
		document.addEventListener('mouseup', handleUp);
	}

	/** @param {MouseEvent} e */
	function handleMouseDown(e) {
		if (e.button !== 0) return;
		const target = /** @type {HTMLElement | null} */ (e.target);
		if (!target || target.closest('.no-drag')) return;
		if (!windowRef || maximizedState) return;

		const rect = windowRef.getBoundingClientRect();
		const startClientX = e.clientX;
		const startClientY = e.clientY;
		const startX = posX;
		const startY = posY;
		dragOffset.x = startClientX - rect.left;
		dragOffset.y = startClientY - rect.top;
		isDragging = true;
		bringToFront();
		e.preventDefault();

		/** @param {MouseEvent} e2 */
		function handleMove(e2) {
			if (!isDragging) return;
			let newX = startX + (e2.clientX - startClientX);
			let newY = startY + (e2.clientY - startClientY);
			newX = Math.max(newX, -dragOffset.x);
			newY = Math.max(newY, -dragOffset.y);
			posX = newX;
			posY = newY;
		}

		function handleUp() {
			isDragging = false;
			document.removeEventListener('mousemove', handleMove);
			document.removeEventListener('mouseup', handleUp);
			updateWindowState(id, { x: posX, y: posY });
		}

		document.addEventListener('mousemove', handleMove);
		document.addEventListener('mouseup', handleUp);
	}

	function handleClose() {
		removeWindow(id);
	}
</script>

<div
	bind:this={windowRef}
	tabindex="-1"
	class="absolute flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
	style="left: {maximizedState ? 0 : posX}px; top: {maximizedState
		? 0
		: posY}px; width: {maximizedState
		? '100%'
		: windowWidth + 'px'}; min-width: 320px; height: {maximizedState
		? '100%'
		: collapsedState
			? 32 + 'px'
			: windowHeight
				? windowHeight + 'px'
				: 'auto'}; min-height: {maximizedState || collapsedState ? 0 : 200}px; z-index: {zIndex}"
	onmousedown={bringToFront}
>
	<div
		role="presentation"
		class="flex cursor-move items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 select-none"
		onmousedown={handleMouseDown}
	>
		<span class="truncate text-sm font-medium text-gray-700">{title}</span>
		<div class="no-drag flex items-center gap-1">
			<button
				onclick={handleToggleCollapse}
				aria-label={collapsedState ? 'Развернуть' : 'Свернуть'}
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
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d={collapsedState ? 'M5 6l14 0M5 10l14 0M12 4l0 14' : 'M7 13l10 4M7 9l10 4'}
					/>
				</svg>
			</button>
			<button
				onclick={handleToggleMaximize}
				aria-label={maximizedState ? 'Восстановить размер' : 'Развернуть на весь экран'}
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
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d={maximizedState ? 'M6 7l12 4v8h12M10 16v-3M14 13v3' : 'M6 6l12 0v12h12'}
					/>
				</svg>
			</button>
			<button
				onclick={handleClose}
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
	</div>

	{#if !collapsedState}
		{@render content?.()}
		{#if showResizeHandle}
			<button
				onmousedown={handleResizeStart}
				aria-label="Изменить размер окна"
				class="no-drag absolute right-1 bottom-1 flex h-4 w-4 cursor-nwse-resize items-end justify-end text-gray-400 transition-colors select-none hover:text-blue-600"
				style="touch-action: none;"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="10"
					height="10"
					viewBox="0 0 10 10"
					fill="none"
				>
					<path
						d="M0 10 L10 0 M0 6 L6 0 M4 10 L10 4"
						stroke="currentColor"
						stroke-width="1.2"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		{/if}
	{/if}
</div>
