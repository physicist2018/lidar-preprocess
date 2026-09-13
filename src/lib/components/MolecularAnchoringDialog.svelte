<script>
	import { files } from '$lib/state/store';
	import { parseMeteoFile } from '$lib/molecular';
	import { get } from 'svelte/store';

	/** @type {{ onClose?: () => void, onApply?: (cfg: { meteo: any, zMin: number, zMax: number, sourceName: string }) => void }} */
	let { onClose, onApply } = $props();

	let totalFiles = $state(/** @type {number} */ (get(files).length));
	let selectedName = $state('');
	let meteo = $state(/** @type {any} */ (null));
	let parseError = $state('');
	let parsePending = $state(false);
	let meteoRange = $state('');
	let zMinInput = $state('');
	let zMaxInput = $state('');
	let lastToken = 0;

	$effect(() => {
		const unsub = files.subscribe((val) => {
			totalFiles = val.length;
		});
		return unsub;
	});

	/**
	 * @param {Event & { currentTarget: HTMLInputElement, target: EventTarget | null }} e
	 */
	function handleFileChange(e) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		const token = ++lastToken;
		parseError = '';
		meteo = null;
		meteoRange = '';
		parsePending = true;
		selectedName = file.name;
		file
			.text()
			.then((text) => {
				if (token !== lastToken) return;
				const res = parseMeteoFile(text);
				if ('error' in res) {
					parseError = res.error;
					return;
				}
				meteo = res;
				meteoRange = `${res.heights[0].toFixed(0)} — ${res.heights[res.heights.length - 1].toFixed(0)} м`;
			})
			.catch((err) => {
				if (token !== lastToken) return;
				const detail = err instanceof Error ? err.message : String(err);
				parseError = `Не удалось прочитать файл: ${detail}`;
			})
			.finally(() => {
				if (token === lastToken) parsePending = false;
			});
	}

	/** @param {string} value */
	function parseHeight(value) {
		if (value === '' || value == null) return NaN;
		const number = Number(value);
		return Number.isFinite(number) ? number : NaN;
	}

	const zMinValue = $derived(parseHeight(zMinInput));
	const zMaxValue = $derived(parseHeight(zMaxInput));
	const rangeValid = $derived(
		Number.isFinite(zMinValue) &&
			Number.isFinite(zMaxValue) &&
			zMinValue >= 0 &&
			zMinValue < zMaxValue
	);
	const canApply = $derived(meteo != null && rangeValid);

	function handleApply() {
		if (!canApply) return;
		onApply?.({ meteo, zMin: zMinValue, zMax: zMaxValue, sourceName: selectedName });
	}
</script>

<div class="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style="z-index: 10000">
	<div
		role="dialog"
		aria-modal="true"
		class="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
	>
		<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
			<span class="text-sm font-semibold text-gray-700">Молекулярная привязка</span>
			<button
				onclick={() => onClose?.()}
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

		<div class="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
			{#if totalFiles === 0}
				<p class="text-sm text-gray-500">Нет открытых файлов. Сначала откройте данные.</p>
			{:else}
				<div>
					<label for="mol-meteo" class="mb-1 block text-xs text-gray-500">Файл метеоданных</label>
					<input
						id="mol-meteo"
						type="file"
						accept=".txt,.dat,.csv,.asc,text/plain"
						onchange={handleFileChange}
						class="block w-full cursor-pointer text-xs text-gray-500 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
					/>
					{#if selectedName}
						<p class="mt-1 truncate text-xs text-gray-600">{selectedName}</p>
					{/if}
					{#if parsePending}
						<p class="mt-1 text-xs text-gray-400">Чтение файла…</p>
					{:else if parseError}
						<p class="mt-1 text-xs break-words text-red-600">{parseError}</p>
					{:else if meteo}
						<p class="mt-1 text-xs text-gray-600">
							Профили: P, H, T · {meteo.nRows} строк · высоты {meteoRange}
						</p>
					{/if}
					<p class="mt-1 text-xs text-gray-400">
						Первые три столбца: давление (гПа), высота (м), температура (°C). Разделитель —
						пробельные символы.
					</p>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="mol-zmin" class="mb-1 block text-xs text-gray-500">z_min, м</label>
						<input
							id="mol-zmin"
							type="number"
							bind:value={zMinInput}
							min="0"
							placeholder="500"
							class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
						/>
					</div>
					<div>
						<label for="mol-zmax" class="mb-1 block text-xs text-gray-500">z_max, м</label>
						<input
							id="mol-zmax"
							type="number"
							bind:value={zMaxInput}
							min="0"
							placeholder="2000"
							class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
						/>
					</div>
				</div>
				{#if (zMinInput !== '' && Number.isFinite(zMinValue) && zMinValue < 0) || (zMinInput !== '' && zMaxInput !== '' && Number.isFinite(zMinValue) && Number.isFinite(zMaxValue) && zMinValue >= zMaxValue)}
					<p class="text-xs text-red-600">
						Начало должно быть не меньше 0 и меньше конца диапазона.
					</p>
				{/if}
				<p class="text-xs text-gray-400">
					В окне (z_min; z_max) подбирается коэффициент K как среднее отношение измеренного сигнала
					к чисто молекулярному. Рассчитанный профиль отображается пунктиром на графиках сигнала.
				</p>
			{/if}
		</div>

		<div class="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
			<button
				onclick={() => onClose?.()}
				class="rounded bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
			>
				Отмена
			</button>
			<button
				onclick={handleApply}
				disabled={!canApply}
				class="rounded px-4 py-1.5 text-sm font-medium transition-colors {canApply
					? 'bg-blue-600 text-white hover:bg-blue-700'
					: 'cursor-not-allowed bg-gray-200 text-gray-400'}"
			>
				Применить
			</button>
		</div>
	</div>
</div>
