import { defineConfig } from 'vite';

// Relative assets allow the same build to run under WebViewAssetLoader and a web server.
export default defineConfig({ base: './' });
