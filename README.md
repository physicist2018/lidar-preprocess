# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
bun x sv@0.17.0 create --template minimal --types jsdoc --add prettier tailwindcss="plugins:typography,forms" --install bun lidar-sveltekit
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Экспорт/импорт сессий (ZIP)

Сессии можно выгрузить в архив и перенести на другую машину/в другой браузер.
Кнопка **⇓ «Экспорт в ZIP»** на карточке сессии сохраняет её сохранённый
снимок; кнопка **«Импорт сессии из ZIP»** в окне сессий загружает архив как
новую сессию (при совпадении имени добавляется `(N)`).

### Формат архива (v1)

```
имя-сессии.zip
├── manifest.json   — конверт: формат, версии, имя, SHA-256 снимка
└── session.json    — снимок сессии (схема SCHEMA_VERSION=1)
```

- `manifest.json`: `format: "lidar-session"`, `formatVersion` (текущий `1`),
  `appVersion`/`schemaVersion` источника, `exportedAt`, `name`, `bytes`,
  `checksums.sessionJson` (SHA-256).
- `session.json`: тот же объект, что хранится в IndexedDB; типизированные
  массивы (`Float64Array` в профилях и метеорологии) сериализуются компактными
  массивами чисел, `Date` — строками ISO. При импорте они восстанавливаются.

### Гарантии

- Точность: float64 проходит round-trip без потерь (в отличие от переупаковки
  в бинарный Licel-формат, где данные округляются до int32).
- Версионирование: архив с `formatVersion` новее поддерживаемого отклоняется;
  содержимое снимка мигрирует через существующий `migrateSnapshot`.
- Безопасность: архив проверяется контрольной суммой, лимитами (1 ГБ / 10 000
  записей) и полной санитизацией снимка перед записью; импорт не затирает
  существующие сессии и откатывается при ошибке квоты IndexedDB.
