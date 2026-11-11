// Screen-space strokes keep road widths stable when terrain is exaggerated.
// Vertices are still projected onto the displayed terrain; a road cannot have a
// gentler 3D slope without detaching it from that terrain.
const major=new Set(['motorway','trunk','primary']);
const minor=new Set(['secondary','tertiary','minor','street','street_limited','service','track']);
const opacity={'road-major-casing':0.85,'road-major':0.95,'road-minor':0.8};
export function setupRoadOverlay(map,{enabled=()=>false,allowed=()=>true,exaggeration=()=>1}={}){
  const canvas=document.createElement('canvas');canvas.className='road-screen-overlay';canvas.setAttribute('aria-hidden','true');map.getContainer().appendChild(canvas);
  let timer=null,active=false;
  function syncStyle(){
    const next=enabled()&&map.getPitch()>5&&exaggeration()>1;
    if(next!==active){active=next;for(const [id,value] of Object.entries(opacity))if(map.getLayer(id))map.setPaintProperty(id,'line-opacity',active?0:value)}
    canvas.hidden=!active;
  }
  function draw(){
    timer=null;syncStyle();if(!active||!map.getSource('reference'))return;
    const container=map.getContainer(),width=container.clientWidth,height=container.clientHeight,ratio=Math.min(devicePixelRatio||1,2),ctx=canvas.getContext('2d');
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
    let features;try{features=map.querySourceFeatures('reference',{sourceLayer:'transportation'})}catch{return}
    const bounds=map.getBounds(),zoom=map.getZoom(),step=360/(512*2**zoom)*18,paths={major:[],minor:[]};let budget=6000;
    for(const feature of features){
      const type=feature.properties?.class,group=major.has(type)?'major':minor.has(type)?'minor':null,geometry=feature.geometry;
      if(!group||!geometry||budget<=0)continue;
      const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
      for(const line of lines){let path=[];
        for(let i=0;i<line.length-1&&budget>0;i++){
          const a=line[i],b=line[i+1],count=Math.max(1,Math.min(20,Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))/step)));
          for(let j=0;j<count&&budget>0;j++){
            const t=j/count,lon=a[0]+(b[0]-a[0])*t,lat=a[1]+(b[1]-a[1])*t;budget--;
            if(!bounds.contains([lon,lat])||!allowed(lon,lat)){if(path.length>1)paths[group].push(path);path=[];continue}
            const p=map.project([lon,lat]);if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x< -40||p.y< -40||p.x>width+40||p.y>height+40){if(path.length>1)paths[group].push(path);path=[];continue}
            path.push([p.x,p.y]);
          }
        }
        if(path.length>1)paths[group].push(path);
      }
    }
    const stroke=(group,color,lineWidth)=>{ctx.beginPath();for(const path of paths[group]){ctx.moveTo(path[0][0],path[0][1]);for(let i=1;i<path.length;i++)ctx.lineTo(path[i][0],path[i][1])}ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke()};
    stroke('major','#30342c',3);stroke('major','#f5ca76',1.45);stroke('minor','#f3e0b4',0.9);
  }
  function schedule(){syncStyle();if(timer===null)timer=setTimeout(draw,120)}
  for(const event of ['move','moveend','resize','terrain','idle'])map.on(event,schedule);
  map.on('sourcedata',e=>{if(e.sourceId==='reference')schedule()});
  map.on('remove',()=>{clearTimeout(timer);canvas.remove()});
  map.__roadOverlay={schedule};schedule();return {schedule};
}
