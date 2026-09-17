import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

// Deploy path for the site. Empty by default (domain root, e.g. user.github.io);
// set BASE_PATH=/repo-name when deploying to a GitHub Pages project page.
/** @type {any} */
const nodeGlobal = globalThis;
const basePath = (nodeGlobal.process?.env?.BASE_PATH ?? '').trim();

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static single-page app: everything is rendered on the client,
			// the build output is plain static files served by any web server.
			adapter: adapter({
				fallback: 'index.html'
			}),

			...(basePath && {
				paths: {
					base: basePath
				}
			})
		}),

		// PWA: generates the service worker (workbox precache) and web manifest,
		// the icons are produced from static/favicon.svg (see pwa-assets.config.mjs).
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Lidar Viewer',
				short_name: 'Lidar',
				description: 'Просмотр и обработка лидарных данных (Licel)',
				lang: 'ru',
				display: 'standalone',
				start_url: `${basePath || ''}/`,
				scope: `${basePath || ''}/`,
				theme_color: '#123a7d',
				background_color: '#0c1e42'
			},
			workbox: {
				cleanupOutdatedCaches: true,
				// Plotly.js-bundle exceeds the default 2 MiB workbox limit.
				maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
				// SPA: only the client build output needs precaching.
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,webmanifest}']
			},
			pwaAssets: {
				config: 'pwa-assets.config.mjs'
			},
			kit: {
				// SPA mode: the static-adapter fallback page is precached so any
				// navigation route works offline.
				adapterFallback: 'index.html',
				spa: true
			},
			devOptions: {
				enabled: true,
				// In dev the SPA client assets are served from memory and no pages
				// are prerendered, so the production globPatterns (client/**, /prerendered)
				// match nothing in dev-dist. Suppress that benign workbox warning;
				// production precaching config is unchanged.
				suppressWarnings: true
			}
		})
	]
});
