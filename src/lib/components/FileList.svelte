<script>
	import { files, toggleFile } from '$lib/state/store';

	let fileItems = $state([]);
	let { onDoubleClick } = $props();

	$effect(() => {
		const unsub = files.subscribe((val) => {
			fileItems = val;
		});
		return unsub;
	});
</script>

<div class="flex flex-col gap-1 p-2">
	{#each fileItems as file (file.id)}
		<div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 cursor-pointer select-none group">
			<input
				type="checkbox"
				checked={file.selected}
				onchange={() => toggleFile(file.id)}
				class="accent-blue-600"
			/>
			<span
				class="text-sm truncate flex-1 cursor-pointer group-hover:text-blue-600"
				ondblclick={(e) => { e.stopPropagation(); onDoubleClick?.(file); }}
			>{file.name}</span>
			<span class="text-xs text-gray-400 shrink-0">{file.size}</span>
		</div>
	{/each}
</div>
