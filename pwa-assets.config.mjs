import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
	images: ['static/favicon.svg'],
	preset: minimal2023Preset,
	overrideAssets: true
});
