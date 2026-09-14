<script>
	import { files, toggleFile } from '$lib/state/store';

	let fileItems = $state(/** @type {Array<any>} */ ([]));
	let { onDoubleClick } = $props();

	$effect(() => {
		const unsub = files.subscribe((val) => {
			fileItems = val;
		});
		return unsub;
	});
</script>

<div class="flex flex-col gap-1 p-2">
	{#if fileItems.length === 0}
		<div class="px-2 py-6 text-center text-xs text-gray-400">
			Файлы не загружены.<br />Откройте ZIP-архив через «Открыть файлы».
		</div>
	{:else}
		{#each fileItems as file (file.id)}
			<div
				class="group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 select-none hover:bg-gray-100"
			>
				<input
					type="checkbox"
					checked={file.selected}
					onchange={() => toggleFile(file.id)}
					class="accent-blue-600"
				/>
				<span
					class="flex-1 cursor-pointer truncate text-sm group-hover:text-blue-600"
					ondblclick={(e) => {
						e.stopPropagation();
						onDoubleClick?.(file);
					}}>{file.name}</span
				>
				<span class="shrink-0 text-xs text-gray-400">{file.size}</span>
			</div>
		{/each}
	{/if}
</div>
