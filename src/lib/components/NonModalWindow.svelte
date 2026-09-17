<script>
	import WindowFrame from './WindowFrame.svelte';
	import GraphWindow from './GraphWindow.svelte';
	import UnfoldWindow from './UnfoldWindow.svelte';

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
		view = null,
		payload = {}
	} = $props();

	const isGraph = title.startsWith('График: ');
	const isUnfold = title.startsWith('Развертка: ');
	const fileName = isGraph ? title.slice(8) : '';
	const fileId = isGraph ? (payload?.fileId ?? null) : null;
	const unfoldConfig = isUnfold ? (payload?.unfold ?? null) : null;
	const defaultWidth = isGraph ? 640 : isUnfold ? 820 : 360;
</script>

<WindowFrame
	{id}
	{title}
	{x}
	{y}
	{width}
	{height}
	{z}
	{collapsed}
	{maximized}
	{defaultWidth}
	showResizeHandle={isGraph || isUnfold}
>
	{#snippet content()}
		{#if isGraph}
			<GraphWindow {id} {fileName} {fileId} initialView={view} />
		{:else if isUnfold}
			<UnfoldWindow config={unfoldConfig} />
		{:else}
			<div class="flex-1 overflow-auto p-4">
				<div class="text-sm text-gray-600">
					<p>Окно: {title}</p>
					<p class="mt-2 text-xs text-gray-400">Перетащите за заголовок для перемещения.</p>
				</div>
			</div>
		{/if}
	{/snippet}
</WindowFrame>
