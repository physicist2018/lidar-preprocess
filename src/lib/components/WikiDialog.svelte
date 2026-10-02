<script>
	import { MODAL_Z_INDEX } from '$lib/state/store';
	import { renderMarkdown } from '$lib/markdown';
	import { NAV_PAGES, fetchPage, pageUrl, WIKI_URL } from '$lib/wiki';

	let { onClose } = $props();

	let page = $state('Home');
	let content = $state('');
	let status = $state('loading');
	let error = $state('');

	const cache = new Map();
	let requestSeq = 0;
	/** @type {HTMLDivElement | null} */
	let contentEl = $state(null);

	/** @param {MouseEvent} e */
	function handleContentClick(e) {
		const target = e.target;
		if (!(target instanceof Element)) return;
		const link = target.closest('a[data-wiki-page]');
		if (!link) return;
		e.preventDefault();
		const name = link.getAttribute('data-wiki-page');
		if (name && name !== page) {
			page = name;
		}
	}

	$effect(() => {
		const el = contentEl;
		if (!el) return;
		el.addEventListener('click', handleContentClick);
		return () => el.removeEventListener('click', handleContentClick);
	});

	$effect(() => {
		const name = page;
		status = 'loading';
		error = '';

		const cached = cache.get(name);
		if (cached !== undefined) {
			content = cached;
			status = 'ready';
			return;
		}

		const seq = ++requestSeq;
		fetchPage(name)
			.then((markdown) => {
				if (seq !== requestSeq) return;
				const html = renderMarkdown(markdown);
				cache.set(name, html);
				content = html;
				status = 'ready';
			})
			.catch((e) => {
				if (seq !== requestSeq) return;
				error = e instanceof Error ? e.message : String(e);
				content = '';
				status = 'error';
			});
	});

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}
</script>

<div
	class="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
	style="z-index: {MODAL_Z_INDEX}"
	role="dialog"
	aria-modal="true"
	aria-label="Документация"
	tabindex="0"
	onkeydown={handleKeydown}
	onclick={(/** @type {MouseEvent} */ e) => {
		if (e.target === e.currentTarget) onClose();
	}}
>
	<div
		class="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
	>
		<!-- Header -->
		<div class="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
			<h2 class="text-sm font-semibold text-gray-700">Документация</h2>
			<div class="flex items-center gap-2">
				<a
					href={pageUrl(page)}
					target="_blank"
					rel="noopener noreferrer"
					class="text-xs text-blue-600 transition-colors hover:text-blue-700 hover:underline"
				>
					Открыть страницу на GitHub
				</a>
				<button
					onclick={onClose}
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

		<!-- Body -->
		<div class="flex min-h-0 flex-1">
			<!-- Sidebar -->
			<nav
				class="w-60 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 py-2"
				aria-label="Страницы вики"
			>
				{#each NAV_PAGES as entry (entry.page)}
					<button
						onclick={() => (page = entry.page)}
						class="block w-full border-l-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-100"
						class:border-blue-600={page === entry.page}
						class:border-transparent={page !== entry.page}
						class:bg-blue-50={page === entry.page}
						class:text-blue-700={page === entry.page}
						class:font-medium={page === entry.page}
						class:text-gray-700={page !== entry.page}
					>
						{entry.title}
					</button>
				{/each}
			</nav>

			<!-- Content -->
			<div class="min-w-0 flex-1 overflow-y-auto" bind:this={contentEl}>
				{#key page}
					{#if status === 'loading'}
						<div class="flex h-full items-center justify-center px-6 py-16 text-sm text-gray-500">
							Загрузка…
						</div>
					{:else if status === 'error'}
						<div class="px-6 py-16">
							<p class="mb-3 text-sm text-red-600">{error}</p>
							<a
								href={pageUrl(page)}
								target="_blank"
								rel="noopener noreferrer"
								class="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline"
							>
								Открыть вики на GitHub
							</a>
						</div>
					{:else}
						<div class="prose prose-sm max-w-none px-6 py-5">{@html content}</div>
					{/if}
				{/key}
			</div>
		</div>

		<!-- Footer -->
		<div class="flex items-center justify-between border-t border-gray-200 px-4 py-3">
			<a
				href={WIKI_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="text-xs text-gray-500 transition-colors hover:text-gray-700 hover:underline"
			>
				Полная версия вики на GitHub
			</a>
			<button
				onclick={onClose}
				class="rounded bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
			>
				Закрыть
			</button>
		</div>
	</div>
</div>
