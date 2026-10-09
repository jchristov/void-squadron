import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/void-squadron/' : '/',
  plugins: [tailwindcss()],
  server: { port: 5301, strictPort: true },
  preview: { port: 5301, strictPort: true },
}));
