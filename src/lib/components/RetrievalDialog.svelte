<script>
	import { files, licelFiles, MODAL_Z_INDEX } from '$lib/state/store';
	import { RETRIEVAL_ALGORITHMS, getAlgorithm } from '$lib/retrieval';
	import { loadRetrievalPrefill, saveRetrievalConfig } from '$lib/state/retrieval-persist';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';

	/** @type {{ onClose?: () => void, onApply?: (cfg: { algorithm: string, params: Record<string, number>, channelKeys: string[] }) => void }} */
	let { onClose, onApply } = $props();

	let totalFiles = $state(0);
	let selectedFileCount = $state(0);
	let selectedAlgorithm = $state('');
	let params = $state(/** @type {Record<string, string>} */ ({}));
	let allChannels = $state(
		/** @type {Array<{ key: string, label: string, wavelength: number, mode: string, hasMolecular: boolean }>} */ ([])
	);
	let channelStates = $state(/** @type {Record<string, boolean>} */ ({}));

	function rebuildChannels() {
		const current = get(files);
		totalFiles = current.length;
		const sel = current.filter((f) => f.selected);
		selectedFileCount = sel.length;
		const selectedFileIds = sel.map((f) => f.id);
		if (selectedFileIds.length === 0) {
			allChannels = [];
			channelStates = {};
			return;
		}
		const data = get(licelFiles);
		/** @type {Array<{ key: string, label: string, wavelength: number, mode: string, hasMolecular: boolean }>} */
		const entries = [];

		for (const id of selectedFileIds) {
			const lf = data.get(id);
			if (!lf || !Array.isArray(lf.profiles)) continue;
			for (const p of lf.profiles) {
				if (p.active === false) continue;
				const mode = p.photon === true ? 'D' : 'A';
				const pol = (p.polarization || '').toUpperCase();
				const key = `${p.wavelength}.${pol}.${mode}`;
				const hasMol = Boolean(p.molecular && p.molecular.data && p.molecular.data.length > 0);
				const label = `${p.wavelength} нм · ${pol || ''} · ${mode}`;
				// Only add the first occurrence per file (one analog + one digital max per wavelength.polarization)
				if (!entries.some((e) => e.key === key)) {
					entries.push({ key, label, wavelength: p.wavelength, mode, hasMolecular: hasMol });
				}
			}
		}

		// Filter by algorithm requirements
		const activeAlg = getAlgorithm(selectedAlgorithm);
		if (activeAlg?.requiresMolecular) {
			let filtered = entries.filter((ch) => ch.hasMolecular);
			entries.length = 0;
			entries.push(...filtered);
		}
		if (activeAlg?.allowedWavelengths) {
			const allowed = activeAlg.allowedWavelengths;
			let filtered = entries.filter((ch) => allowed.some((w) => Math.abs(ch.wavelength - w) < 1));
			entries.length = 0;
			entries.push(...filtered);
		}
		if (activeAlg?.allowedPolarizations) {
			const allowedUpper = activeAlg.allowedPolarizations.map((p) => p.toUpperCase());
			let filtered = entries.filter((ch) => {
				const pol = ch.key.split('.')[1] ?? '';
				return allowedUpper.includes(pol.toUpperCase());
			});
			entries.length = 0;
			entries.push(...filtered);
		}

		entries.sort((a, b) => a.wavelength - b.wavelength || a.key.localeCompare(b.key));

		/** @type {Record<string, boolean>} */
		const next = {};
		for (const ch of entries) {
			next[ch.key] = channelStates[ch.key] ?? true;
		}
		allChannels = entries;
		channelStates = next;
	}

	onMount(() => {
		rebuildChannels();
		const unsubFiles = files.subscribe(() => rebuildChannels());
		const unsubData = licelFiles.subscribe(() => rebuildChannels());
		let active = true;
		loadRetrievalPrefill().then((prefill) => {
			if (!active || !prefill) return;
			selectedAlgorithm = prefill.algorithm;
			rebuildChannels();
			params = { ...params, ...Object.fromEntries(
				Object.entries(prefill.params).map(([k, v]) => [k, String(v)])
			)};
			/** @type {Record<string, boolean>} */
			const next = {};
			for (const ch of allChannels) {
				next[ch.key] = prefill.channelKeys.includes(ch.key);
			}
			channelStates = next;
		});
		return () => {
			active = false;
			unsubFiles();
			unsubData();
		};
	});

	const algorithm = $derived(getAlgorithm(selectedAlgorithm));
	const currentParams = $derived(algorithm?.params ?? []);

	/** @param {{ key: string, min?: number, max?: number }} param */
	function isParamValid(param) {
		const value = params[param.key];
		if (value === '' || value == null) return false;
		const num = Number(value);
		if (!Number.isFinite(num)) return false;
		if (param.min !== undefined && num < param.min) return false;
		if (param.max !== undefined && num > param.max) return false;
		return true;
	}

	const allParamsValid = $derived(
		currentParams.length === 0 || currentParams.every((p) => isParamValid(p))
	);

	const selectedChannelKeys = $derived(
		Object.entries(channelStates)
			.filter(([, v]) => v)
			.map(([k]) => k)
	);

	const canApply = $derived(
		selectedFileCount > 0 &&
			selectedAlgorithm !== '' &&
			allParamsValid &&
			selectedChannelKeys.length > 0
	);

	function handleToggleAll() {
		const allEnabled = Object.values(channelStates).every((v) => v);
		/** @type {Record<string, boolean>} */
		const next = {};
		for (const ch of allChannels) {
			next[ch.key] = !allEnabled;
		}
		channelStates = next;
	}

	function handleApply() {
		if (!canApply) return;
		/** @type {Record<string, number>} */
		const resolvedParams = {};
		for (const p of currentParams) {
			resolvedParams[p.key] = Number(params[p.key]);
		}
		const cfg = {
			algorithm: selectedAlgorithm,
			params: resolvedParams,
			channelKeys: selectedChannelKeys
		};
		saveRetrievalConfig(cfg).catch(() => {});
		onApply?.(cfg);
	}
</script>

<div
	class="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
	style="z-index: {MODAL_Z_INDEX}"
>
	<div
		role="dialog"
		aria-modal="true"
		class="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
	>
		<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
			<span class="text-sm font-semibold text-gray-700">Расчёт параметров аэрозоля</span>
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
				<p class="text-sm text-gray-500">Нет загруженных файлов. Сначала откройте данные.</p>
			{:else if selectedFileCount === 0}
				<p class="text-sm text-amber-600">Нет выделенных файлов. Выделите файлы в списке.</p>
			{:else}
				<!-- Algorithm selection -->
				<div>
					<label for="retrieval-algorithm" class="mb-1 block text-xs text-gray-500"
						>Алгоритм расчёта</label
					>
					<select
						id="retrieval-algorithm"
						value={selectedAlgorithm}
						onchange={(e) => {
							const target = /** @type {HTMLSelectElement} */ (e.currentTarget);
							selectedAlgorithm = target.value;
							rebuildChannels();
						}}
						class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
					>
						<option value="" disabled>Выберите алгоритм…</option>
						{#each RETRIEVAL_ALGORITHMS as alg}
							<option value={alg.id}>{alg.label}</option>
						{/each}
					</select>
				</div>

				{#if selectedAlgorithm}
					<!-- Channel selection -->
					<fieldset>
						<div class="mb-1 flex items-center justify-between">
							<legend class="block text-xs font-semibold tracking-wider text-gray-500 uppercase">
								Каналы
							</legend>
							{#if allChannels.length > 0}
								<button onclick={handleToggleAll} class="text-xs text-blue-600 hover:text-blue-800">
									{Object.values(channelStates).every((v) => v) ? 'Снять все' : 'Выбрать все'}
								</button>
							{/if}
						</div>
						{#if allChannels.length === 0}
							<p class="text-xs text-amber-600">
								{#if algorithm?.requiresMolecular}
									Нет каналов с выполненной молекулярной привязкой для выбранного алгоритма.
								{:else}
									Нет подходящих каналов в открытых файлах.
								{/if}
							</p>
						{:else}
							<div class="max-h-40 space-y-1 overflow-auto rounded border border-gray-200 p-2">
								{#each allChannels as ch (ch.key)}
									<label class="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											checked={channelStates[ch.key] ?? true}
											onchange={() => {
												channelStates = { ...channelStates, [ch.key]: !channelStates[ch.key] };
											}}
											class="accent-blue-600"
										/>
										<span class="truncate text-xs">{ch.label}</span>
									</label>
								{/each}
							</div>
						{/if}
					</fieldset>

					<!-- Algorithm-specific parameters -->
					{#if currentParams.length > 0}
						<div class="space-y-3">
							{#each currentParams as param}
								<div>
									<label for="retrieval-{param.key}" class="mb-1 block text-xs text-gray-500">
										{param.label}
									</label>
									<input
										id="retrieval-{param.key}"
										type="number"
										bind:value={params[param.key]}
										min={param.min}
										max={param.max}
										step={param.step}
										placeholder={String(param.default)}
										class="w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none {isParamValid(
											param
										)
											? 'border-gray-300'
											: 'border-red-400 bg-red-50'}"
									/>
									{#if params[param.key] !== '' && params[param.key] != null && !isParamValid(param)}
										<p class="mt-1 text-xs text-red-600">
											Введите число от {param.min ?? '—'} до {param.max ?? '—'}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				{/if}
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
