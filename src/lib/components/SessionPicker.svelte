<script>
	import {
		listSessions,
		createSession,
		openSession,
		deleteSession,
		renameSession,
		copySession,
		setDefaultSession,
		getAutoOpenLast,
		setAutoOpenLast,
		beginEmptySession,
		isDirty
	} from '$lib/state/sessions';
	import { exportSessionToArchive, importSessionFromArchive } from '$lib/state/archive-transfer';
	import { downloadBytes } from '$lib/download';
	import { MODAL_Z_INDEX } from '$lib/state/store';
	import { formatBytes, formatDate } from '$lib/format';
	import { onMount } from 'svelte';

	let { onClose } = $props();

	let items = $state(/** @type {Array<any>} */ ([]));
	let pendingName = $state('');
	let renamingId = $state(/** @type {string | null} */ (null));
	let autoOpen = $state(false);
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let importInput = $state(/** @type {HTMLInputElement | null} */ (null));

	async function refresh() {
		items = await listSessions();
		autoOpen = await getAutoOpenLast();
	}

	onMount(refresh);

	function confirmDiscard() {
		if (!isDirty()) return true;
		return window.confirm('Есть несохранённые изменения. Продолжить без сохранения?');
	}

	/** @param {string} id */
	async function handleOpen(id) {
		if (!confirmDiscard()) return;
		busy = true;
		error = '';
		try {
			const res = await openSession(id);
			if (res?.ok) {
				onClose?.();
			} else if (res?.corrupt) {
				error = `Сессия «${res.name}» повреждена. Файлы открыть не удалось.`;
				refresh();
			} else if (res?.unsupported) {
				error = `Сессия «${res.name}» создана более новой версией приложения.`;
			} else {
				error = 'Сессия не найдена. Возможно, она была удалена в другой вкладке.';
				refresh();
			}
		} finally {
			busy = false;
		}
	}

	async function handleCreate() {
		if (!confirmDiscard()) return;
		busy = true;
		error = '';
		try {
			await createSession(pendingName.trim());
			pendingName = '';
			onClose?.();
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			error = `Не удалось создать сессию: ${detail}`;
		} finally {
			busy = false;
		}
	}

	async function handleBeginEmpty() {
		if (!confirmDiscard()) return;
		busy = true;
		try {
			await beginEmptySession();
			onClose?.();
		} finally {
			busy = false;
		}
	}

	/** @param {string} id */
	async function handleRename(id) {
		const item = items.find((s) => s.id === id);
		if (!item) return;
		error = '';
		await renameSession(id, pendingName.trim() || item.name);
		renamingId = null;
		pendingName = '';
		refresh();
	}

	/** @param {string} id */
	async function handleCopy(id) {
		await copySession(id);
		refresh();
	}

	/** @param {string} id */
	async function handleDelete(id) {
		const item = items.find((s) => s.id === id);
		if (!item) return;
		if (!window.confirm(`Удалить сессию «${item.name}»?`)) return;
		const wasActive = await deleteSession(id);
		error = '';
		refresh();
		if (wasActive && items.length <= 1) {
			await beginEmptySession();
			onClose?.();
		}
	}

	/** @param {string} id */
	async function handleSetDefault(id) {
		const item = items.find((s) => s.id === id);
		await setDefaultSession(item?.isDefault ? null : id);
		refresh();
	}

	async function handleAutoOpenChange() {
		autoOpen = !autoOpen;
		await setAutoOpenLast(autoOpen);
	}

	/** @param {string} id */
	async function handleExport(id) {
		const item = items.find((s) => s.id === id);
		if (!item) return;
		busy = true;
		error = '';
		notice = '';
		try {
			const res = await exportSessionToArchive(id);
			if (res.ok) {
				downloadBytes(res.bytes, res.fileName);
				notice = `Экспортирована сессия «${item.name}»`;
			} else {
				error = res.message ?? 'Не удалось экспортировать сессию';
			}
		} catch (err) {
			error = `Не удалось экспортировать сессию: ${
				err instanceof Error ? err.message : String(err)
			}`;
		} finally {
			busy = false;
		}
	}

	/** @param {Event} e */
	async function handleImport(e) {
		const input = /** @type {HTMLInputElement | null} */ (e.target);
		const file = input?.files?.[0];
		if (!file) return;
		busy = true;
		error = '';
		notice = '';
		try {
			const buffer = await file.arrayBuffer();
			const res = await importSessionFromArchive(new Uint8Array(buffer));
			if (res.ok) {
				refresh();
				if (res.warnings && res.warnings.length > 0) {
					notice = `Импортирована сессия «${res.name}». ${res.warnings.join(' ')}`;
				} else {
					onClose?.();
				}
			} else {
				error = res.message ?? 'Не удалось импортировать сессию';
			}
		} catch (err) {
			error = `Не удалось прочитать файл: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			if (input) input.value = '';
			busy = false;
		}
	}
</script>

<div
	class="fixed inset-0 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm"
	style="z-index: {MODAL_Z_INDEX}"
	onmousedown={(e) => {
		if (e.target === e.currentTarget) onClose?.();
	}}
>
	<div
		class="flex max-h-[85vh] w-[520px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
	>
		<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
			<h2 class="text-base font-semibold text-gray-800">Рабочие сессии</h2>
			<button
				onclick={() => onClose?.()}
				aria-label="Закрыть"
				class="flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
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

		<div class="min-h-0 flex-1 overflow-auto px-4 py-3">
			{#if error}
				<div class="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
					{error}
				</div>
			{/if}
			{#if notice}
				<div
					class="mb-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700"
				>
					{notice}
				</div>
			{/if}
			{#if items.length === 0}
				<div class="px-2 py-8 text-center text-xs text-gray-400">
					Сохранённых сессий нет.<br />Создайте новую сессию и нажмите «Сохранить» в окне
					приложения.
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					{#each items as item (item.id)}
						<div
							class="group flex cursor-pointer items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 transition-colors hover:bg-gray-50"
							ondblclick={() => handleOpen(item.id)}
						>
							<div class="min-w-0 flex-1">
								{#if renamingId === item.id}
									<div class="flex items-center gap-2">
										<input
											type="text"
											bind:value={pendingName}
											placeholder="Имя сессии"
											class="w-full rounded border px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
										/>
										<button
											onclick={() => handleRename(item.id)}
											class="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
										>
											ОК
										</button>
									</div>
								{:else}
									<div class="flex items-center gap-1.5">
										<span class="truncate text-sm font-medium text-gray-800">{item.name}</span>
										{#if item.isDefault}
											<span class="text-xs text-amber-500" title="Сессия по умолчанию">★</span>
										{/if}
									</div>
									<div class="truncate text-xs text-gray-400">
										{formatDate(item.updatedAt)}
										{#if item.filesCount || item.windowsCount}
											· {item.filesCount} ф. · {item.windowsCount} ок.
										{/if}
										{#if item.dataBytes > 0}
											· {formatBytes(item.dataBytes)}
										{/if}
									</div>
								{/if}
							</div>
							<div class="flex items-center gap-1 opacity-70 group-hover:opacity-100">
								<button
									onclick={() => handleOpen(item.id)}
									title="Открыть"
									class="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-xs text-white hover:bg-blue-700"
								>
									▶
								</button>
								<button
									onclick={() => handleSetDefault(item.id)}
									title={item.isDefault
										? 'Убрать флаг по умолчанию'
										: 'Сделать сессией по умолчанию'}
									class="flex h-7 w-7 items-center justify-center rounded text-xs transition-colors {item.isDefault
										? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
										: 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
								>
									★
								</button>
								<button
									onclick={() => handleCopy(item.id)}
									title="Копировать"
									class="flex h-7 w-7 items-center justify-center rounded bg-gray-100 text-xs text-gray-600 hover:bg-gray-200"
								>
									⧉
								</button>
								<button
									onclick={() => handleExport(item.id)}
									disabled={busy}
									title="Экспорт в ZIP"
									class="flex h-7 w-7 items-center justify-center rounded bg-gray-100 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-40"
								>
									⇓
								</button>
								<button
									onclick={() => {
										renamingId = renamingId === item.id ? null : item.id;
										pendingName = item.name;
									}}
									title="Переименовать"
									class="flex h-7 w-7 items-center justify-center rounded bg-gray-100 text-xs text-gray-600 hover:bg-gray-200"
								>
									✎
								</button>
								<button
									onclick={() => handleDelete(item.id)}
									title="Удалить"
									class="flex h-7 w-7 items-center justify-center rounded bg-red-50 text-xs text-red-600 hover:bg-red-100"
								>
									✕
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="flex flex-col gap-2 border-t border-gray-200 px-4 py-3">
			<div class="flex items-center gap-2">
				<input
					type="text"
					bind:value={pendingName}
					placeholder="Имя новой сессии"
					class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
					onkeydown={(/** @type {KeyboardEvent} */ e) => {
						if (e.key === 'Enter') handleCreate();
					}}
				/>
				<button
					onclick={handleCreate}
					disabled={busy}
					class="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
				>
					Создать
				</button>
			</div>
			<div class="flex items-center justify-between gap-3">
				<label class="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
					<input
						type="checkbox"
						checked={autoOpen}
						onchange={handleAutoOpenChange}
						class="accent-blue-600"
					/>
					Открывать последнюю сессию автоматически
				</label>
				<button
					onclick={handleBeginEmpty}
					disabled={busy}
					class="rounded bg-gray-100 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-200"
				>
					Начать без сессии
				</button>
			</div>
			<input
				bind:this={importInput}
				type="file"
				accept=".zip"
				class="hidden"
				onchange={handleImport}
			/>
			<button
				onclick={() => importInput?.click()}
				disabled={busy}
				class="w-full rounded bg-blue-50 px-3 py-1.5 text-xs text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40"
			>
				Импорт сессии из ZIP
			</button>
		</div>
	</div>
</div>
