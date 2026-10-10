import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import packageJson from './package.json' with { type: 'json' };
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

let shortCommit = 'unknown';
try {
  shortCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // Git metadata is unavailable in source archives and exported build environments.
}

const threePackagePath = fileURLToPath(new URL('./node_modules/three/package.json', import.meta.url));
const threeVersion = JSON.parse(await readFile(threePackagePath, 'utf8')).version as string;

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/void-squadron/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_COMMIT__: JSON.stringify(shortCommit),
  },
  plugins: [
    tailwindcss(),
    {
      name: 'void-squadron-service-worker',
      apply: 'build',
      async generateBundle(_options, bundle) {
        const { readFile } = await import('node:fs/promises');
        const { fileURLToPath } = await import('node:url');
        let source = await readFile(fileURLToPath(new URL('./src/sw.js', import.meta.url)), 'utf8');
        const precacheAssets = Object.keys(bundle)
          .filter((fileName) => fileName.startsWith('assets/'))
          .map((fileName) => `./${fileName}`);
        source = source.replace(
          'const APP_ROOT = new URL(\'./\', self.location.href);',
          `const APP_ROOT = new URL('./', self.location.href);\nconst BUILD_ASSETS = ${JSON.stringify(precacheAssets)};`,
        ).replace('...Array.from(self.__PRECACHE_ASSETS__ ?? []),', '...BUILD_ASSETS,');
        this.emitFile({ type: 'asset', fileName: 'sw.js', source });
      },
    },
  ],
  server: { port: 5301, strictPort: true },
  preview: { port: 5301, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/build/three.core.js')) return `three-core-${threeVersion}`;
          if (id.includes('/node_modules/three/')) return `three-vendor-${threeVersion}`;
        },
      },
    },
  },
}));
