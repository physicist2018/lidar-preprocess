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
    <div class="w-full max-w-lg rounded-lg border border-gray-200 bg-white shadow-xl">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <h2 class="text-base font-semibold text-gray-800">Справка</h2>
            <button
                onclick={onClose}
                class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Закрыть"
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                        fill-rule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clip-rule="evenodd"
                    />
                </svg>
            </button>
        </div>

        <!-- Body -->
        <div class="px-5 py-4">
            <p class="mb-4 text-sm text-gray-600">
                Lidar Viewer — приложение для просмотра и обработки данных лидара.
            </p>

            <div class="mb-4">
                <h3 class="mb-2 text-sm font-semibold text-gray-700">Горячие клавиши</h3>
                <table class="w-full text-sm">
                    <tbody>
                        <tr class="border-b border-gray-100">
                            <td class="py-1.5 pr-4 align-top text-gray-600">
                                <kbd class="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs">⌘S</kbd>
                                <span class="text-gray-400"> / </span>
                                <kbd class="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs">Ctrl+S</kbd>
                            </td>
                            <td class="py-1.5 align-top text-gray-600">Сохранить текущую сессию</td>
                        </tr>
                        <tr class="border-b border-gray-100">
                            <td class="py-1.5 pr-4 align-top text-gray-600">
                                <kbd class="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs">F1</kbd>
                            </td>
                            <td class="py-1.5 align-top text-gray-600">Открыть справку</td>
                        </tr>
                        <tr>
                            <td class="py-1.5 pr-4 align-top text-gray-600">
                                <kbd class="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs">Esc</kbd>
                            </td>
                            <td class="py-1.5 align-top text-gray-600">Закрыть модальное окно</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div>
                <h3 class="mb-2 text-sm font-semibold text-gray-700">Основные функции</h3>
                <ul class="list-inside list-disc space-y-1 text-sm text-gray-600">
                    <li>Открытие файлов и сохранение в ZIP-архив</li>
                    <li>Просмотр графиков в отдельных окнах</li>
                    <li>Медианная фильтрация и удаление фона</li>
                    <li>Склейка каналов, обрезка по высоте</li>
                    <li>Задание зенитного угла лидара</li>
                    <li>Построение развертки и усреднение файлов</li>
                    <li>Молекулярная привязка и сглаживание данных</li>
                    <li>Управление сессиями (создание, переключение, сохранение)</li>
                </ul>
            </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end border-t border-gray-200 px-5 py-3">
            <button
                onclick={onClose}
                class="rounded bg-gray-100 px-4 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-200"
            >
                Закрыть
            </button>
        </div>
    </div>
</div>
