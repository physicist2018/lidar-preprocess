import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Deploy path for the site. Empty by default (domain root, e.g. user.github.io);
// set BASE_PATH=/repo-name when deploying to a GitHub Pages project page.
const basePath = (
	(/** @type {any} */ (globalThis)).process?.env?.BASE_PATH ?? ''
).trim();

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
		})
	]
});
