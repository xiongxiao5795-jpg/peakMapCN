import { defineConfig } from 'vite';
import { patchMapLibreTerrain } from './build/patch-maplibre-terrain.js';
import { readFileSync } from 'node:fs';

// Relative assets allow the same build to run under WebViewAssetLoader and a web server.
export default defineConfig({
  base: './',
  server: process.env.PEAKMAP_HTTPS_CERT ? {https:{cert:readFileSync(process.env.PEAKMAP_HTTPS_CERT),key:readFileSync(process.env.PEAKMAP_HTTPS_KEY)}} : undefined,
  // Vite's dependency pre-bundler would bypass the checked MapLibre patch.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  plugins: [{
    name: 'peakmap-maplibre-terrain-lod',
    enforce: 'pre',
    transform(code,id){
      if(id.split('?')[0].endsWith('/maplibre-gl/dist/maplibre-gl.mjs'))return {code:patchMapLibreTerrain(code),map:null};
    }
  }]
});
