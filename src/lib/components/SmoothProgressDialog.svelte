<script>
	import { smoothingProgress, MODAL_Z_INDEX } from '$lib/state/store';

	let active = $state(false);
	let done = $state(0);
	let total = $state(0);
	let label = $state('');

	$effect(() => {
		const unsub = smoothingProgress.subscribe((val) => {
			active = val.active;
			done = val.done;
			total = val.total;
			label = val.label;
		});
		return unsub;
	});

	const percent = $derived(total > 0 ? Math.round((done / total) * 100) : 0);
</script>

{#if active}
	<div
		class="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
		style="z-index: {MODAL_Z_INDEX}"
	>
		<div
			role="progressbar"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={percent}
			aria-busy="true"
			class="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl"
		>
			<div class="mb-3 flex items-center justify-between">
				<span class="text-sm font-semibold text-gray-700">Сглаживание данных…</span>
				<span class="text-sm font-medium text-gray-500">{percent}%</span>
			</div>

			<div class="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
				<div
					class="h-full rounded-full bg-blue-600 transition-all duration-150 ease-out"
					style="width: {percent}%"
				></div>
			</div>

			<p class="mt-3 truncate text-xs text-gray-500">
				{label}
			</p>
			<p class="mt-1 text-xs text-gray-400">
				{total > 0
					? `Обработано ${Math.min(done, total)} из ${total} файлов`
					: 'Обработка…'}
			</p>
		</div>
	</div>
{/if}