<script>
	import FileList from '$lib/components/FileList.svelte';
	import FileActions from '$lib/components/FileActions.svelte';
	import NonModalWindow from '$lib/components/NonModalWindow.svelte';
	import ErrorDialog from '$lib/components/ErrorDialog.svelte';
	import SessionPicker from '$lib/components/SessionPicker.svelte';
	import { openWindows, addWindow, leftPanelPercent, sessionEpoch } from '$lib/state/store';
	import { get } from 'svelte/store';
	import {
		boot as bootSessions,
		openSession,
		saveActiveSession,
		saveSessionAs,
		initWorkspaceDirtyWatch
	} from '$lib/state/sessions';
	import { onMount, onDestroy } from 'svelte';

	let leftPercent = $state(20);
	let windows = $state(/** @type {Array<any>} */ ([]));
	let pickerOpen = $state(true);

	onMount(async () => {
		const boot = await bootSessions();
		initWorkspaceDirtyWatch();
		document.addEventListener('keydown', handleKeydown);
		if (boot.autoOpenLast && boot.activeSessionId) {
			await openSession(boot.activeSessionId);
			pickerOpen = false;
		}
	});

	onDestroy(() => {
		document.removeEventListener('keydown', handleKeydown);
	});

	$effect(() => {
		const unsub = openWindows.subscribe((val) => {
			windows = val;
		});
		return unsub;
	});

	$effect(() => {
		const unsub = leftPanelPercent.subscribe((val) => {
			leftPercent = val;
		});
		return unsub;
	});

	/** @param {number} newLeft */
	function handleResize(newLeft) {
		leftPanelPercent.set(newLeft);
		leftPercent = newLeft;
	}

	function handleAddDemoWindow() {
		addWindow('Демонстрационное окно');
	}

	/** @param {any} file */
	function handleFileDoubleClick(file) {
		addWindow(`График: ${file.name}`, undefined, { fileId: file.id });
	}

	async function handleSave() {
		const res = await saveActiveSession();
		if (res?.needName) {
			const name = window.prompt('Имя новой сессии:', 'Сессия');
			if (name == null) return;
			await saveSessionAs(name);
			return;
		}
		if (res?.conflict) {
			const proceed = window.confirm(
				`Сессия «${res.name}» была изменена в другой вкладке. Перезаписать её содержимое текущим состоянием?`
			);
			if (proceed) await saveActiveSession({ force: true });
		}
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
			e.preventDefault();
			if (pickerOpen) return;
			handleSave();
		}
	}
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-gray-50">
	<!-- Top bar -->
	<header class="flex h-12 shrink-0 items-center border-b border-gray-200 bg-white px-4">
		<h1 class="text-lg font-semibold text-gray-800">Lidar Viewer</h1>
		<div class="ml-auto flex gap-2">
			<button
				onclick={() => (pickerOpen = true)}
				class="rounded bg-gray-100 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-200"
			>
				Сессии
			</button>
			<button
				onclick={handleSave}
				class="rounded bg-blue-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-blue-700"
			>
				Сохранить (⌘S)
			</button>
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
			onmousedown={(/** @type {MouseEvent} */ e) => {
				e.preventDefault();
				let isDragging = false;
				isDragging = true;

				/** @param {MouseEvent} e2 */
				function handleMouseMove(e2) {
					if (!isDragging) return;
					const el = /** @type {HTMLElement} */ (e.target);
					const parent = el.parentElement;
					if (!parent) return;
					const rect = parent.getBoundingClientRect();
					const offset = ((e2.clientX - rect.left) / rect.width) * 100;
					const clamped = Math.min(Math.max(offset, 15), 85);
					handleResize(clamped);
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
		<div class="relative h-full min-w-0 flex-1 overflow-auto bg-gray-50">
			{#key get(sessionEpoch)}
				{#each windows as win (win.id)}
					<NonModalWindow
						id={win.id}
						x={win.x}
						y={win.y}
						width={win.width}
						height={win.height}
						title={win.title}
						payload={win.payload}
						z={win.z}
						collapsed={win.collapsed}
						maximized={win.maximized}
						view={win.view}
					/>
				{/each}
			{/key}
		</div>
	</div>

	{#if pickerOpen}
		<SessionPicker onClose={() => (pickerOpen = false)} />
	{/if}

	<ErrorDialog />
</div>
