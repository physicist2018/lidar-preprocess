export const WIKI_BASE = 'https://raw.githubusercontent.com/wiki/physicist2018/lidar-preprocess';

export const WIKI_URL = 'https://github.com/physicist2018/lidar-preprocess/wiki';

/**
 * @typedef {{ page: string, title: string }} WikiNavPage
 */

/** @type {WikiNavPage[]} */
export const NAV_PAGES = [
	{ page: 'Home', title: 'Домой' },
	{ page: 'Installation', title: 'Установка и запуск' },
	{ page: 'Configuration', title: 'Конфигурация' },
	{ page: 'Usage', title: 'Использование' },
	{ page: 'Data-Formats', title: 'Форматы данных' },
	{ page: 'Processing-Operations', title: 'Операции обработки' },
	{ page: 'Molecular-Anchoring', title: 'Молекулярная привязка' },
	{ page: 'Sessions-Persistence', title: 'Сессии и хранение' },
	{ page: 'Session-Export-Import', title: 'Экспорт/импорт сессий' },
	{ page: 'Architecture', title: 'Архитектура' },
	{ page: 'Development', title: 'Разработка' },
	{ page: 'Deployment', title: 'Деплой' },
	{ page: 'Troubleshooting', title: 'Устранение проблем' }
];

/**
 * Ссылка на страницу вики в GitHub.
 * @param {string} page
 * @returns {string}
 */
export function pageUrl(page) {
	return `${WIKI_URL}/${page}`;
}

/**
 * Загружает страницу вики в виде исходного markdown.
 * @param {string} page
 * @returns {Promise<string>}
 */
export async function fetchPage(page) {
	const res = await fetch(`${WIKI_BASE}/${page}.md`);
	if (!res.ok) {
		throw new Error(`Не удалось загрузить страницу «${page}» (HTTP ${res.status})`);
	}
	return await res.text();
}
