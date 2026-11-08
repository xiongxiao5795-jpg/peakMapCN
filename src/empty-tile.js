// Cache encoded blank tiles; workers transfer buffers, so callers receive copies.
export function createEmptyTileFactory(makeCanvas,blobData){
  const cache=new Map();
  return async(size,dem=false)=>{
    const key=`${size}:${dem}`;
    if(!cache.has(key)){
      const canvas=makeCanvas(size),ctx=canvas.getContext('2d');
      if(dem){ctx.fillStyle='rgb(128,0,0)';ctx.fillRect(0,0,size,size)}
      const encoded=blobData(canvas);cache.set(key,encoded);encoded.catch(()=>cache.delete(key));
    }
    return {data:(await cache.get(key)).slice(0),outside:true};
  };
}
