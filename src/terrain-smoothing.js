// Smooth only display heights. Original source elevations are never modified.
// Mask-aware averages keep sea or clipped-out areas from pulling down coastlines.
export function smoothTerrainHeights(source,width,height,amount,mask=null){
  const strength=Math.max(0,Math.min(1,Number(amount)/100));
  if(!strength)return source;
  // A wider low-pass window calms exaggerated local slopes while retaining the
  // broad relief. Keep a narrow unmodified rim so neighbouring tiles meet.
  const radius=Math.max(1,Math.round((2+26*strength)*width/512)),mix=1-(1-strength)**3;
  const horizontal=new Float32Array(source.length),result=new Float32Array(source.length);
  for(let y=0;y<height;y++){
    const row=y*width;let sum=0,count=0;
    for(let x=0;x<=Math.min(radius,width-1);x++){const i=row+x;if(!mask||mask[i]){sum+=source[i];count++}}
    for(let x=0;x<width;x++){
      const i=row+x;horizontal[i]=count?sum/count:source[i];
      const remove=x-radius,add=x+radius+1;
      if(remove>=0&&(!mask||mask[row+remove])){sum-=source[row+remove];count--}
      if(add<width&&(!mask||mask[row+add])){sum+=source[row+add];count++}
    }
  }
  for(let x=0;x<width;x++){
    let sum=0,count=0;
    for(let y=0;y<=Math.min(radius,height-1);y++){const i=y*width+x;if(!mask||mask[i]){sum+=horizontal[i];count++}}
    for(let y=0;y<height;y++){
      const i=y*width+x,edge=Math.min(x,y,width-1-x,height-1-y),blend=mix*Math.min(1,edge/Math.min(radius*2,8));
      result[i]=(!mask||mask[i])&&count?source[i]+(sum/count-source[i])*blend:source[i];
      const remove=y-radius,add=y+radius+1;
      if(remove>=0&&(!mask||mask[remove*width+x])){sum-=horizontal[remove*width+x];count--}
      if(add<height&&(!mask||mask[add*width+x])){sum+=horizontal[add*width+x];count++}
    }
  }
  return result;
}
