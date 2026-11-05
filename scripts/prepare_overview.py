#!/usr/bin/env python3
"""Create China-only overview tiles from an extracted z0–6 Mapterhorn PMTiles archive.

Requires Pillow, numpy and the Python pmtiles package. Pixels inside the sample
China boundary (plus a two-pixel margin) retain their original Terrarium value.
"""
import io, json, math, sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from pmtiles.reader import Reader, MmapSource

root=Path(__file__).resolve().parent.parent
polygons=[]
data=json.loads((root/'data/china-provinces.json').read_text())
for f in data['features']:
    if not f.get('properties',{}).get('name'): continue
    geom=f['geometry'];groups=[geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates']
    for rings in groups:
        coords=[(lon/360+0.5, (1-math.asinh(math.tan(math.radians(max(-85.05112878,min(85.05112878,lat)))))/math.pi)/2) for lon,lat in rings[0]]
        bounds=(min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords),max(y for x,y in coords))
        allrings=[coords]+[[(lon/360+0.5,(1-math.asinh(math.tan(math.radians(max(-85.05112878,min(85.05112878,lat)))))/math.pi)/2) for lon,lat in ring] for ring in rings[1:]]
        polygons.append((bounds,allrings))

def process(item):
    z,x,y,raw=item;n=2**z;mask=Image.new('L',(512,512),0)
    for (w,north,e,south),rings in polygons:
        if e*n<x-0.01 or w*n>x+1.01 or south*n<y-0.01 or north*n>y+1.01:continue
        shape=Image.new('L',(512,512),0);draw=ImageDraw.Draw(shape)
        for index,ring in enumerate(rings):
            draw.polygon([((lon*n-x)*512,(lat*n-y)*512) for lon,lat in ring],fill=255 if index==0 else 0)
        mask=ImageChops.lighter(mask,shape)
    mask=mask.filter(ImageFilter.MaxFilter(5))
    image=np.asarray(Image.open(io.BytesIO(raw)).convert('RGB')).copy()
    image[np.asarray(mask)==0]=[128,0,0]
    output=io.BytesIO();Image.fromarray(image).save(output,format='WEBP',lossless=True,method=5,exact=True)
    path=root/'public/terrain-overview'/str(z)/str(x)/f'{y}.webp';path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(output.getvalue())
    return len(output.getvalue())

if __name__=='__main__':
    file=open(sys.argv[1],'rb');reader=Reader(MmapSource(file));items=[]
    for z in range(7):
        for x in range(2**z):
            for y in range(2**z):
                blob=reader.get(z,x,y)
                if blob:items.append((z,x,y,blob))
    with ProcessPoolExecutor(max_workers=4) as pool: sizes=list(pool.map(process,items))
    total=sum(sizes);print(f'{len(items)} tiles, {total} bytes')
    if total>22_000_000:raise SystemExit('Overview exceeds the 22 MB limit')
