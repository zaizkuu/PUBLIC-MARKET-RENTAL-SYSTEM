import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    // Relative asset paths so the built app also loads from a file:// URL,
    // which is how Electron serves it in the packaged desktop build.
    base: './',
});
