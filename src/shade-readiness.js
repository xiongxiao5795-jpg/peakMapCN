// Terrain-draped rasters do not fade individual tiles in MapLibre. Keep the
// mask hidden while visible tiles are being replaced, then show it together
// rather than showing a patchwork of shaded and unshaded regions.
export function bindShadeReadiness(map,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let opacity=0,retryTimer=null;
  function setOpacity(value){
    if(value===opacity||!map.getLayer('satellite-shade'))return;
    opacity=value;map.setPaintProperty('satellite-shade','raster-opacity',value);
    // MapLibre caches terrain-draped textures separately per tile. Rebuild
    // them together when opacity changes or stale tiles retain the old mask.
    map.terrain?.tileManager.releaseAllRTT();
    map.triggerRepaint();
  }
  function retryLater(){
    if(retryTimer!==null)return;
    retryTimer=setTimer(()=>{
      retryTimer=null;
      const source=map.getSource('satellite-shade');
      if(source&&map.getLayer('satellite-shade')&&map.getLayoutProperty('satellite-shade','visibility')!=='none')source.setTiles([...source.tiles]);
    },20000);
  }
  map.on('sourcedataloading',event=>{if(event.sourceId==='satellite-shade')setOpacity(0)});
  map.on('sourcedata',event=>{
    if(event.sourceId!=='satellite-shade'||!map.getSource('satellite-shade')||!map.isSourceLoaded('satellite-shade'))return;
    const tiles=map.style?.tileManagers?.['satellite-shade']?._inViewTiles?.getAllTiles?.()||[];
    if(tiles.some(tile=>tile.state==='errored')){setOpacity(0);retryLater();return}
    if(retryTimer!==null){clearTimer(retryTimer);retryTimer=null}
    setOpacity(1);
  });
  map.on('error',event=>{if(event.sourceId==='satellite-shade'){setOpacity(0);retryLater()}});
  map.on('remove',()=>{if(retryTimer!==null)clearTimer(retryTimer)});
}
