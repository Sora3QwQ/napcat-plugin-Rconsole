import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    outDir: 'dist',
    rollupOptions: {
      external: [
        'axios','qrcode',
        'node:fs','node:path','node:child_process','node:util','node:crypto','node:url',
        /^napcat-types/,
        'https-proxy-agent',
      ],
    },
    minify: false,
    sourcemap: true,
  },
});
