<script>
    import { MODAL_Z_INDEX } from '$lib/state/store';

    let { onClose } = $props();

    /** @param {KeyboardEvent} e */
    function handleKeydown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    }
</script>

<div
    class="fixed inset-0 z-[100000] flex items-center justify-center bg-black/40 p-4"
    style="z-index: {MODAL_Z_INDEX}"
    role="dialog"
    aria-modal="true"
    aria-label="Справка"
    tabindex="0"
    onkeydown={handleKeydown}
    onclick={(/** @type {MouseEvent} */ e) => {
        if (e.target === e.currentTarget) onClose();
    }}
>
    <div class="w-full max-w-lg overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 class="text-sm font-semibold text-gray-700">Справка</h2>
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

        <!-- Body -->
        <div class="max-h-[70vh] overflow-auto px-4 py-4">
            <!-- Горячие клавиши -->
            <div class="mb-5">
                <h3 class="mb-2 text-sm font-semibold text-gray-700">Горячие клавиши</h3>
                <table class="w-full text-sm">
                    <tbody>
                        <tr class="border-b border-gray-100">
                            <td class="py-1.5 pr-4 align-top text-gray-600">
                                <kbd class="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium">⌘S</kbd>
                                <span class="text-gray-400"> / </span>
                                <kbd class="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium">Ctrl+S</kbd>
                            </td>
                            <td class="py-1.5 align-top text-gray-600">Сохранить текущую сессию</td>
                        </tr>
                        <tr class="border-b border-gray-100">
                            <td class="py-1.5 pr-4 align-top text-gray-600">
                                <kbd class="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium">F1</kbd>
                            </td>
                            <td class="py-1.5 align-top text-gray-600">Открыть справку</td>
                        </tr>
                        <tr>
                            <td class="py-1.5 pr-4 align-top text-gray-600">
                                <kbd class="rounded border border-gray-300 bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium">Esc</kbd>
                            </td>
                            <td class="py-1.5 align-top text-gray-600">Закрыть модальное окно</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Файлы и сессии -->
            <div class="mb-5">
                <h3 class="mb-2 text-sm font-semibold text-gray-700">Файлы и сессии</h3>
                <ul class="list-inside list-disc space-y-1 text-sm text-gray-500">
                    <li>Открытие файлов (.zip) и сохранение в ZIP-архив</li>
                    <li>Управление сессиями (создание, переключение, сохранение)</li>
                    <li>Выделение / удаление файлов в списке</li>
                </ul>
            </div>

            <!-- Обработка данных -->
            <div class="mb-5">
                <h3 class="mb-2 text-sm font-semibold text-gray-700">Обработка данных</h3>
                <ul class="list-inside list-disc space-y-1 text-sm text-gray-500">
                    <li>Удаление фона (средний, медианный, опорный файл)</li>
                    <li>Сглаживание данных (выбор алгоритма и параметров)</li>
                    <li>Склейка аналогового и фотонного каналов</li>
                    <li>Обрезка по высоте</li>
                    <li>Усреднение выбранных файлов</li>
                </ul>
            </div>

            <!-- Настройки данных -->
            <div class="mb-5">
                <h3 class="mb-2 text-sm font-semibold text-gray-700">Настройки данных</h3>
                <ul class="list-inside list-disc space-y-1 text-sm text-gray-500">
                    <li>Задание зенитного угла лидара (влияет на ось высоты во всех окнах)</li>
                    <li>Молекулярная привязка (наложение данных метеозонда)</li>
                </ul>
            </div>

            <!-- Графики -->
            <div class="mb-5">
                <h3 class="mb-2 text-sm font-semibold text-gray-700">Графики</h3>
                <ul class="list-inside list-disc space-y-1 text-sm text-gray-500">
                    <li>Просмотр графиков в перемещаемых / ресайзимых окнах</li>
                    <li>Включение / выключение каналов, «Вкл / Выкл все»</li>
                    <li>Запоминание набора каналов</li>
                    <li>Переключение шкалы Y: линейная / логарифмическая</li>
                    <li>Переключение трансформации: P (сырой сигнал) / P·r² (поправка на дальность)</li>
                </ul>
            </div>

            <!-- Развёртка -->
            <div>
                <h3 class="mb-2 text-sm font-semibold text-gray-700">Развёртка</h3>
                <ul class="list-inside list-disc space-y-1 text-sm text-gray-500">
                    <li>Построение развёртки по выбранным каналам</li>
                </ul>
            </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end border-t border-gray-200 px-4 py-3">
            <button
                onclick={onClose}
                class="rounded bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
                Закрыть
            </button>
        </div>
    </div>
</div>
