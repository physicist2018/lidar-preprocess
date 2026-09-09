import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// GitHub Pages SPA fallback: unknown routes are served from 404.html, so copy
// the built index.html so deep links render the application shell.
const root = process.cwd();
await copyFile(resolve(root, 'build/index.html'), resolve(root, 'build/404.html'));
