import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/void-squadron/' : '/',
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
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
}));
