// Terrarium elevations are numeric values packed across RGB channels. Never
// interpolate the channels independently: a carry between bytes is a cliff.
export function decodeTerrarium(pixels,index){
  return pixels[index]*256+pixels[index+1]+pixels[index+2]/256-32768;
}

function writeTerrarium(pixels,index,height){
  const value=Math.max(0,Math.min(16777215,Math.round((height+32768)*256)));
  pixels[index]=value>>16;pixels[index+1]=(value>>8)&255;pixels[index+2]=value&255;
}

// Repair only broad isolated stripes bracketed by mutually consistent data.
// Local peaks, real cliffs, coastlines and transparent pixels are preserved.
// Mutates the pixels and returns the number of repaired samples.
export function repairTerrainStripes(pixels,width,height){
  let repaired=0;
  function scan(horizontal){
    const lines=horizontal?height:width,span=horizontal?width:height;
    const index=(line,position)=>(horizontal?line*width+position:position*width+line)*4;
    const threshold=Math.max(16,Math.ceil(span*0.14));
    for(let line=1;line<lines-1;line++){
      // Most rows are ordinary terrain. Sample sparsely before testing every
      // pixel and possible stripe width, keeping the common path inexpensive.
      let jumps=0;
      for(let p=0;p<span;p+=8){const i=index(line,p),j=index(line-1,p);if(pixels[i+3]>=128&&pixels[j+3]>=128&&Math.abs(decodeTerrarium(pixels,i)-decodeTerrarium(pixels,j))>=1500)jumps++}
      if(jumps<Math.ceil(threshold/8))continue;
      let found=0;
      for(let length=1;length<=Math.min(4,lines-line-1);length++){
        let candidates=0;
        for(let p=0;p<span;p++){
          const before=index(line-1,p),after=index(line+length,p),first=index(line,p);
          if(pixels[before+3]<128||pixels[after+3]<128||pixels[first+3]<128)continue;
          const a=decodeTerrarium(pixels,before),b=decodeTerrarium(pixels,after),v=decodeTerrarium(pixels,first),delta=v-(a+b)/2;
          if(Math.abs(delta)<1500||Math.abs(a-b)>Math.max(300,Math.abs(delta)*0.25))continue;
          let consistent=true;
          for(let k=1;k<length;k++){const i=index(line+k,p);if(pixels[i+3]<128||(decodeTerrarium(pixels,i)-(a+b)/2)*delta<1500*Math.abs(delta)){consistent=false;break}}
          if(consistent)candidates++;
        }
        if(candidates>=threshold){found=length;break}
      }
      if(!found)continue;
      for(let p=0;p<span;p++){
        const before=index(line-1,p),after=index(line+found,p),first=index(line,p);
        if(pixels[before+3]<128||pixels[after+3]<128||pixels[first+3]<128)continue;
        const a=decodeTerrarium(pixels,before),b=decodeTerrarium(pixels,after),delta=decodeTerrarium(pixels,first)-(a+b)/2;
        if(Math.abs(delta)<1500||Math.abs(a-b)>Math.max(300,Math.abs(delta)*0.25))continue;
        let consistent=true;
        for(let k=1;k<found;k++){const i=index(line+k,p);if(pixels[i+3]<128||(decodeTerrarium(pixels,i)-(a+b)/2)*delta<1500*Math.abs(delta)){consistent=false;break}}
        if(!consistent)continue;
        for(let k=0;k<found;k++){writeTerrarium(pixels,index(line+k,p),a+(b-a)*(k+1)/(found+1));repaired++}
      }
      line+=found-1;
    }
  }
  scan(true);scan(false);
  // Only isolated spikes surrounded on all four sides by consistent heights.
  // Leave borders alone when neighbouring tile data is unavailable.
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=(y*width+x)*4,l=i-4,r=i+4,t=i-width*4,b=i+width*4;
    if(pixels[i+3]<128||pixels[l+3]<128||pixels[r+3]<128||pixels[t+3]<128||pixels[b+3]<128)continue;
    const left=decodeTerrarium(pixels,l),right=decodeTerrarium(pixels,r),top=decodeTerrarium(pixels,t),bottom=decodeTerrarium(pixels,b);
    const low=Math.min(left,right,top,bottom),high=Math.max(left,right,top,bottom),value=decodeTerrarium(pixels,i);
    if(high-low<=300&&(value<low-2500||value>high+2500)){writeTerrarium(pixels,i,(left+right+top+bottom)/4);repaired++}
  }
  return repaired;
}

const edgeIndex=(edge,width,height,p,depth)=>{
  if(edge==='top')return (depth*width+p)*4;
  if(edge==='bottom')return ((height-1-depth)*width+p)*4;
  if(edge==='left')return (p*width+depth)*4;
  return (p*width+width-1-depth)*4;
};
const opposite={top:'bottom',bottom:'top',left:'right',right:'left'};

// Only ask for a neighbour when a broad, implausibly abrupt stripe touches
// the tile border. Do not infer a replacement without the other tile.
export function terrainEdgeCandidates(pixels,width,height){
  const result=[];
  for(const edge of ['top','bottom','left','right']){
    const span=edge==='top'||edge==='bottom'?width:height;let jumps=0;
    for(let p=0;p<span;p+=8){const a=edgeIndex(edge,width,height,p,0),b=edgeIndex(edge,width,height,p,1),c=edgeIndex(edge,width,height,p,2);if(pixels[a+3]>=128&&pixels[b+3]>=128&&pixels[c+3]>=128&&Math.abs(decodeTerrarium(pixels,a)-decodeTerrarium(pixels,b))>=1500&&Math.abs(decodeTerrarium(pixels,b)-decodeTerrarium(pixels,c))<=300)jumps++}
    if(jumps>=Math.max(2,Math.ceil(span*0.14/8)))result.push(edge);
  }
  return result;
}

export function terrainEdgeHasCoverage(pixels,neighbor,width,height,edge){
  const span=edge==='top'||edge==='bottom'?width:height,other=opposite[edge];let covered=0;
  for(let p=0;p<span;p++){
    const i=edgeIndex(edge,width,height,p,0),inside=edgeIndex(edge,width,height,p,1),n0=edgeIndex(other,width,height,p,0),n1=edgeIndex(other,width,height,p,1);
    if(pixels[i+3]>=128&&pixels[inside+3]>=128&&neighbor[n0+3]>=128&&neighbor[n1+3]>=128&&Math.abs(decodeTerrarium(pixels,i)-decodeTerrarium(pixels,inside))>=1500)covered++;
  }
  return covered>=Math.max(16,Math.ceil(span*0.14));
}

// Both tiles independently use their shared, good samples. This also repairs
// a stripe spanning the last row of one tile and the first row of the next.
export function repairTerrainEdge(pixels,neighbor,width,height,edge){
  const span=edge==='top'||edge==='bottom'?width:height,other=opposite[edge],fixes=[];
  for(let p=0;p<span;p++){
    const i=edgeIndex(edge,width,height,p,0),inside=edgeIndex(edge,width,height,p,1),n0=edgeIndex(other,width,height,p,0),n1=edgeIndex(other,width,height,p,1);
    if(pixels[i+3]<128||pixels[inside+3]<128||neighbor[n0+3]<128||neighbor[n1+3]<128)continue;
    const v=decodeTerrarium(pixels,i),a=decodeTerrarium(pixels,inside),edgeValue=decodeTerrarium(neighbor,n0),far=decodeTerrarium(neighbor,n1);
    const neighborIsBad=Math.abs(edgeValue-a)>=1500&&Math.abs(edgeValue-v)<500;
    const b=neighborIsBad?far:edgeValue,delta=v-(a+b)/2;
    if(Math.abs(delta)<1500||Math.abs(a-b)>Math.max(300,Math.abs(delta)*0.25))continue;
    fixes.push([i,neighborIsBad?(2*a+b)/3:(a+b)/2]);
  }
  if(fixes.length<Math.max(16,Math.ceil(span*0.14)))return 0;
  for(const [i,value] of fixes)writeTerrarium(pixels,i,value);
  return fixes.length;
}
