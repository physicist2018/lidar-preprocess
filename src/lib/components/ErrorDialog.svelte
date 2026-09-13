	<script>
	import { errorMessage, clearError } from '$lib/state/store';

	let message = $state('');

	$effect(() => {
		const unsub = errorMessage.subscribe((val) => {
			message = val;
		});
		return unsub;
	});
</script>

{#if message}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div
			role="alertdialog"
			aria-modal="true"
			class="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-xl"
		>
			<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
				<span class="text-sm font-semibold text-red-600">Ошибка</span>
				<button
					onclick={clearError}
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
			<div
				class="max-h-64 overflow-auto px-4 py-4 text-sm break-words whitespace-pre-wrap text-gray-700"
			>
				{message}
			</div>
			<div class="flex justify-end border-t border-gray-200 px-4 py-3">
				<button
					onclick={clearError}
					class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
				>
					ОК
				</button>
			</div>
		</div>
	</div>
{/if}
