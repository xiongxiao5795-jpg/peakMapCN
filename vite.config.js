import { defineConfig } from 'vite';
import { patchMapLibreTerrain } from './build/patch-maplibre-terrain.js';

// Relative assets allow the same build to run under WebViewAssetLoader and a web server.
export default defineConfig({
  base: './',
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
