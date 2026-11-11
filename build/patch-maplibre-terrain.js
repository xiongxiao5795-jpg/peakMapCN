// MapLibre 6.16 computes its terrain render-to-texture tile LOD independently
// from the DEM source LOD, causing the mesh to jump during camera rotation.
// Its public LOD setting only changes the source. Keep both selectors aligned.
const original='minzoom:this.minzoom,maxzoom:this.maxzoom,reparseOverscaled:!1,terrain:t}))n[i.key]';
const replacement='minzoom:this.minzoom,maxzoom:this.maxzoom,reparseOverscaled:!1,terrain:t,calculateTileZoom:this.tileManager._source.calculateTileZoom?(...e)=>this.tileManager._source.calculateTileZoom(...e)+this.deltaZoom:void 0}))n[i.key]';

// Blend the previous and current DEM in the vertex shader when a whole-view
// level changes. A global blend factor keeps already-covered shared edges in
// step, and no extra texture fetch is used when there is no transition.
const shaderUniforms='uniform sampler2D u_terrain;';
const shaderUniformsWithPrevious=shaderUniforms+'uniform highp sampler2D u_peak_previous;uniform highp mat4 u_peak_matrix;uniform highp vec4 u_peak_unpack;uniform highp float u_peak_dim;uniform highp float u_peak_mix;';
const shaderReturn='return elevation*u_terrain_exaggeration;';
const shaderBlendedReturn=`if(u_peak_mix<0.9999){vec2 pc=(u_peak_matrix*vec4(pos,0.0,1.0)).xy*u_peak_dim+1.5;vec2 pf=fract(pc);ivec2 pi=ivec2(floor(pc));ivec2 ph=textureSize(u_peak_previous,0)-1;vec4 pa=texelFetch(u_peak_previous,clamp(pi,ivec2(0),ph),0)*255.0*u_peak_unpack;vec4 pb=texelFetch(u_peak_previous,clamp(pi+ivec2(1,0),ivec2(0),ph),0)*255.0*u_peak_unpack;vec4 pd=texelFetch(u_peak_previous,clamp(pi+ivec2(0,1),ivec2(0),ph),0)*255.0*u_peak_unpack;vec4 pe=texelFetch(u_peak_previous,clamp(pi+ivec2(1,1),ivec2(0),ph),0)*255.0*u_peak_unpack;float a=pa.r+pa.g+pa.b-u_peak_unpack.a;float b=pb.r+pb.g+pb.b-u_peak_unpack.a;float d=pd.r+pd.g+pd.b-u_peak_unpack.a;float e=pe.r+pe.g+pe.b-u_peak_unpack.a;elevation=mix(mix(mix(a,b,pf.x),mix(d,e,pf.x),pf.y),elevation,u_peak_mix);}return elevation*u_terrain_exaggeration;`;
const bindTerrain='y.bindTexture(y.TEXTURE_2D,s.texture);for(let e in this.terrainUniforms)';
const bindPrevious=`y.bindTexture(y.TEXTURE_2D,s.texture);{let p=this.__peakUniforms||(this.__peakUniforms={texture:y.getUniformLocation(this.program,"u_peak_previous"),matrix:y.getUniformLocation(this.program,"u_peak_matrix"),unpack:y.getUniformLocation(this.program,"u_peak_unpack"),dim:y.getUniformLocation(this.program,"u_peak_dim"),mix:y.getUniformLocation(this.program,"u_peak_mix")}),o=s.__peakPrevious;e.activeTexture.set(y.TEXTURE7);y.bindTexture(y.TEXTURE_2D,o?o.texture:s.texture);y.uniform1i(p.texture,7);if(o){y.uniformMatrix4fv(p.matrix,false,new Float32Array(o.u_terrain_matrix));y.uniform4fv(p.unpack,o.u_terrain_unpack);y.uniform1f(p.dim,o.u_terrain_dim)}y.uniform1f(p.mix,s.__peakMix??1);e.activeTexture.set(y.TEXTURE3)}for(let e in this.terrainUniforms)`;

function replaceOnce(code,needle,value,label){
  const first=code.indexOf(needle);
  if(first<0||code.indexOf(needle,first+needle.length)>=0)throw new Error(`MapLibre ${label} patch no longer matches the pinned version`);
  return code.slice(0,first)+value+code.slice(first+needle.length);
}
export function patchMapLibreTerrain(code){
  code=replaceOnce(code,original,replacement,'terrain LOD');
  code=replaceOnce(code,shaderUniforms,shaderUniformsWithPrevious,'terrain blend uniforms');
  code=replaceOnce(code,shaderReturn,shaderBlendedReturn,'terrain blend shader');
  return replaceOnce(code,bindTerrain,bindPrevious,'terrain blend binding');
}
