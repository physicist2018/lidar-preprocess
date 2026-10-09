// ---------------------------------------------------------------------------
// Ansmann rotational-Raman retrieval of the aerosol extinction coefficient.
//
// Reference: Ansmann et al. (1990, 1992) — the rotational Raman channel is used
// as a molecular reference: its backscatter coefficient β_RR ∝ N(r) carries no
// aerosol contribution. The system constant and Raman cross-section cancel in
// the logarithmic derivative, so no absolute calibration is required.
//
//   D(r) = ln( N(r) / S_R(r) ) ,   S_R = P_R · r²
//   α_a(r, λ_L) = (dD/dr − α_m(λ_L) − α_m(λ_R)) / (1 + (λ_L/λ_R)^k)
//
// where k is the Angstroem exponent.  The result is clamped ≥ 0; bins below
// the dead zone (startIndex) or with non-positive signal/density are NaN.
// ---------------------------------------------------------------------------

import { savitzkyGolayDerivative } from './smoothing.js';

/** Map of rotational Raman reference wavelengths (nm) to their elastic pump wavelengths (nm). */
/** @type {Record<number, number>} */
export const RR_PUMP_PAIRS = { 353: 355, 530: 532 };

/**
 * @typedef {{
 *   signal: Float64Array,
 *   r: Float64Array,
 *   density: Float64Array,
 *   alphaMolecularPump: Float64Array,
 *   alphaMolecularRaman: Float64Array,
 *   pumpWavelength: number,
 *   ramanWavelength: number,
 *   angstromExponent?: number,
 *   derivativeWindow?: number,
 *   startIndex?: number
 * }} AnsmannInput
 */

/**
 * @typedef {{
 *   alphaAerosol: Float64Array,
 *   derivativeLogRatio: Float64Array,
 *   startIndex: number
 * }} AnsmannResultBase
 */

/**
 * @typedef {(AnsmannResultBase & { ok: true }) | (AnsmannResultBase & { ok: false, error: string })} AnsmannResult
 */

/**
 * Run the rotational-Raman Ansmann retrieval on a single profile.
 *
 * @param {AnsmannInput} input
 * @returns {AnsmannResult}
 */
export function ansmannRamanElastic(input) {
	const err = validateAnsmannInput(input);
	if (err) return { ...emptyAnsmannResult(), ok: false, error: err };

	const {
		signal,
		r,
		density,
		alphaMolecularPump,
		alphaMolecularRaman,
		pumpWavelength,
		ramanWavelength,
		angstromExponent = 1,
		derivativeWindow = 11,
		startIndex = 0
	} = input;
	const n = r.length;
	const start = Math.max(0, Math.min(n - 1, Math.floor(startIndex)));
	const dx = r.length > 1 ? r[1] - r[0] : 1;

	const logRatio = new Float64Array(n);
	for (let j = 0; j < n; j++) {
		const s = signal[j];
		const d = density[j];
		logRatio[j] = s > 0 && d > 0 ? Math.log(d / s) : NaN;
	}

	const dLog = savitzkyGolayDerivative(logRatio, derivativeWindow, dx);
	const denom = 1 + Math.pow(pumpWavelength / ramanWavelength, angstromExponent);

	const alphaAerosol = new Float64Array(n);
	for (let j = 0; j < n; j++) alphaAerosol[j] = NaN;
	for (let j = start; j < n; j++) {
		const d = dLog[j];
		const aP = alphaMolecularPump[j];
		const aR = alphaMolecularRaman[j];
		if (!Number.isFinite(d) || !Number.isFinite(aP) || !Number.isFinite(aR)) continue;
		const value = (d - aP - aR) / denom;
		alphaAerosol[j] = value > 0 ? value : 0;
	}

	return {
		alphaAerosol,
		derivativeLogRatio: dLog,
		startIndex: start,
		ok: true
	};
}

/**
 * @param {any} input
 * @returns {string | null}
 */
function validateAnsmannInput(input) {
	if (!input) return 'Не переданы параметры метода Ансмана.';
	const { signal, r, density, alphaMolecularPump, alphaMolecularRaman } = input;
	const arrays = [
		['Сигнал', signal],
		['Дальности r', r],
		['Плотность N', density],
		['α_m(λ_L)', alphaMolecularPump],
		['α_m(λ_R)', alphaMolecularRaman]
	];
	for (const [label, arr] of arrays) {
		if (!(arr instanceof Float64Array) || arr.length === 0) {
			return `${label} отсутствует или не является непустым Float64Array.`;
		}
	}
	const n = signal.length;
	for (const [label, arr] of arrays) {
		if (arr.length !== n) {
			return `${label} не совпадает по длине с сигналом.`;
		}
	}
	const { pumpWavelength, ramanWavelength } = input;
	if (!Number.isFinite(pumpWavelength) || pumpWavelength <= 0) {
		return 'Длина волны насоса λ_L должна быть положительным числом.';
	}
	if (!Number.isFinite(ramanWavelength) || ramanWavelength <= 0) {
		return 'Длина волны рамановского канала λ_R должна быть положительным числом.';
	}
	if (Math.abs(pumpWavelength - ramanWavelength) > 50) {
		return 'Рамановский сдвиг превышает 50 нм — канал не похож на вращательный раман.';
	}
	if (Math.abs(pumpWavelength - ramanWavelength) < 1e-6) {
		return 'λ_L и λ_R совпадают — рамановский канал должен отличаться от насоса.';
	}
	const k = input.angstromExponent ?? 1;
	if (!Number.isFinite(k) || k < 0 || k > 3) {
		return 'Показатель Ангстрёма должен быть числом от 0 до 3.';
	}
	const w = input.derivativeWindow ?? 11;
	if (!Number.isFinite(w) || w < 3) {
		return 'Окно производной должно быть целым числом от 3 бинов.';
	}
	const startIx = Math.floor(input.startIndex ?? 0);
	if (!Number.isFinite(startIx) || startIx < 0 || startIx >= n) {
		return `Начальный индекс мёртвой зоны вне диапазона профиля (0–${n - 1}).`;
	}
	for (let j = 0; j < n; j++) {
		if (!Number.isFinite(r[j]) || r[j] < 0) {
			return `Нечисловая или отрицательная дальность на индексе ${j}.`;
		}
		if (!Number.isFinite(density[j]) || density[j] < 0) {
			return `Нечисловая или отрицательная плотность N на индексе ${j}.`;
		}
		if (!Number.isFinite(alphaMolecularPump[j]) || alphaMolecularPump[j] < 0) {
			return `Нечисловое α_m(λ_L) на индексе ${j}.`;
		}
		if (!Number.isFinite(alphaMolecularRaman[j]) || alphaMolecularRaman[j] < 0) {
			return `Нечисловое α_m(λ_R) на индексе ${j}.`;
		}
		if (!Number.isFinite(signal[j])) {
			return `Нечисловой сигнал на индексе ${j}.`;
		}
	}
	for (let j = 1; j < n; j++) {
		if (!(r[j] > r[j - 1])) return `Дальности не монотонно возрастают (индекс ${j}).`;
	}
	return null;
}

/** @returns {AnsmannResultBase} */
function emptyAnsmannResult() {
	return {
		alphaAerosol: new Float64Array(0),
		derivativeLogRatio: new Float64Array(0),
		startIndex: -1
	};
}
