// Hide the shadow overlay during its first load. Once visible, retain it as
// the view changes: hiding the entire layer for each new tile makes the same
// mountain flash between differently coloured appearances while panning.
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
  map.on('sourcedata',event=>{
    if(event.sourceId!=='satellite-shade'||!map.getSource('satellite-shade')||!map.isSourceLoaded('satellite-shade'))return;
    const tiles=map.style?.tileManagers?.['satellite-shade']?._inViewTiles?.getAllTiles?.()||[];
    if(tiles.some(tile=>tile.state==='errored')){retryLater();return}
    if(retryTimer!==null){clearTimer(retryTimer);retryTimer=null}
    setOpacity(1);
  });
  map.on('error',event=>{if(event.sourceId==='satellite-shade')retryLater()});
  map.on('remove',()=>{if(retryTimer!==null)clearTimer(retryTimer)});
}
