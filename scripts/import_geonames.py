#!/usr/bin/env python3
"""Extract Chinese mountain labels from GeoNames country ZIPs.

Requires shapely >= 2.0. Input files are GeoNames CN.zip and TW.zip, downloaded
separately; generated labels retain the GeoNames identifier and feature type.
"""
import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
from shapely import make_valid
from shapely.geometry import Point, shape
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[1]
CHINESE_NAME = re.compile(r'[\u3400-\u9fff·・]{2,18}\Z')
FEATURES = {'MTS', 'MT', 'PK', 'RDGE'}

def boundary():
    collection = json.loads((ROOT / 'data/china-provinces.json').read_text(encoding='utf-8'))
    areas = []
    for feature in collection['features']:
        if not feature['properties'].get('name'):
            continue
        geom = make_valid(shape(feature['geometry']))
        if geom.geom_type in ('Polygon', 'MultiPolygon'):
            areas.append(geom)
        elif geom.geom_type == 'GeometryCollection':
            areas.extend(item for item in geom.geoms if item.geom_type in ('Polygon', 'MultiPolygon'))
    return prep(unary_union(areas))

def labels(paths):
    region = boundary()
    records = []
    seen_ids = set()
    for path in paths:
        with zipfile.ZipFile(path) as archive:
            text_files = [name for name in archive.namelist() if name in ('CN.txt', 'TW.txt')]
            if len(text_files) != 1:
                raise ValueError(f'{path}: expected a CN.txt or TW.txt file')
            for line in archive.open(text_files[0]):
                row = line.decode('utf-8').rstrip('\n').split('\t')
                if len(row) < 19 or row[6] != 'T' or row[7] not in FEATURES or row[0] in seen_ids:
                    continue
                names = [name for name in [row[1], *row[3].split(',')] if CHINESE_NAME.fullmatch(name)]
                if not names:
                    continue
                lat, lon = float(row[4]), float(row[5])
                if not region.covers(Point(lon, lat)):
                    continue
                code = row[7]
                name = names[0]
                category = 'mountain' if code in ('MTS', 'RDGE') or name.endswith(('山脉', '山系', '山群', '山脈')) else 'peak'
                elevation = int(row[15]) if row[15].isdigit() and 0 < int(row[15]) <= 9000 else None
                if category == 'mountain':
                    zoom = 5.8 if code == 'MTS' else 8.5
                    importance = 54 if code == 'MTS' else 39
                else:
                    zoom = 6.5 if elevation and elevation >= 7000 else 7.5 if elevation and elevation >= 5000 else 8.5 if elevation and elevation >= 3000 else 9.5
                    importance = min(53, 38 + (elevation or 0) // 500)
                entry = {'id': f'geonames-{row[0]}', 'name': name, 'category': category,
                         'coordinates': [lon, lat], 'zoom': zoom, 'importance': importance,
                         'geonames_type': code}
                if elevation is not None:
                    entry['elevation'] = elevation
                records.append(entry)
                seen_ids.add(row[0])
    return records

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archives', nargs='+', type=Path)
    args = parser.parse_args()
    records = labels(args.archives)
    if not records:
        raise ValueError('No matching records; refusing to overwrite output')
    out = ROOT / 'data/geonames-mountains.json'
    out.write_text(json.dumps(records, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    counts = Counter(record['category'] for record in records)
    meta = {'source': 'GeoNames country dumps', 'source_urls': ['https://download.geonames.org/export/dump/CN.zip', 'https://download.geonames.org/export/dump/TW.zip'],
            'license': 'CC BY 4.0', 'license_url': 'https://creativecommons.org/licenses/by/4.0/',
            'generated_from': [{'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in args.archives],
            'note': 'Chinese-name records within the project sample land boundary. Points and heights are unverified. GeoNames MT/PK represent individual mountains or peaks; MTS/RDGE are grouped as mountain labels.',
            'counts': dict(counts)}
    (ROOT / 'data/geonames-mountains.meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Saved',len(records),'labels:',dict(counts),'JSON bytes:',out.stat().st_size)

if __name__ == '__main__':
    main()
