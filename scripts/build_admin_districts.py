#!/usr/bin/env python3
"""Group cached DataV city and district boundary responses by province.

Usage: python3 scripts/build_admin_districts.py <city-full-dir> <individual-dir>
Input files must be named <adcode>.json and contain DataV FeatureCollections.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parent.parent
index = json.loads((root / 'data/admin-index.json').read_text())
areas = {area['code']: area for area in index['areas']}
cities = {city['code']: city for city in index['cities']}
generic = {'市辖区', '县', '省直辖县级行政区划', '自治区直辖县级行政区划'}
# The 2023 county-to-city decisions retained the former counties' areas.
# https://www.bomi.gov.cn/bmx/c100228/202304/736d2f9b15d94ba7a455359366c6c5a6.shtml
renamed_codes = {'540422': '540481', '540530': '540581'}
features = {}
paths = [root / 'data/admin-city-boundaries.json']
for dirname in sys.argv[1:]:
    paths.extend(sorted(Path(dirname).glob('*.json')))
for path in paths:
    collection = json.loads(path.read_text())
    for feature in collection.get('features', []):
        props = feature.get('properties') or {}
        original_code = str(props.get('adcode', ''))
        code = renamed_codes.get(original_code, original_code)
        area = areas.get(code)
        geometry = feature.get('geometry') or {}
        if not area or geometry.get('type') not in ('Polygon', 'MultiPolygon') or not geometry.get('coordinates'):
            continue
        if original_code != code and code in features:
            continue
        city = cities[area['cityCode']]
        parent = area['provinceCode'] + '0000' if city['name'] in generic else area['cityCode'] + '00'
        keep = {k: props[k] for k in ('adcode', 'name', 'center', 'centroid') if k in props}
        if original_code != code:
            keep.update(adcode=int(code), name=area['name'], originalAdcode=int(original_code))
        keep['parent'] = {'adcode': int(parent)}
        features[code] = {'type': 'Feature', 'properties': keep, 'geometry': geometry}

groups = defaultdict(list)
for code, feature in features.items():
    groups[areas[code]['provinceCode']].append(feature)
out = root / 'data/admin-districts'
out.mkdir(exist_ok=True)
for old in out.glob('*.json'):
    old.unlink()
for province, group in sorted(groups.items()):
    group.sort(key=lambda feature: feature['properties']['adcode'])
    (out / f'{province}.json').write_text(json.dumps({'type': 'FeatureCollection', 'features': group}, ensure_ascii=False, separators=(',', ':')) + '\n')
missing = [area for code, area in areas.items() if code not in features]
coverage = {
    'source': 'https://geo.datav.aliyun.com/areas_v3/bound/',
    'note': 'DataV administrative boundaries matched to the project index; source accuracy and redistribution terms remain unverified. Milin and Cuona use their former county boundaries following the 2023 county-to-city decisions.',
    'renamed_areas_source': 'https://www.bomi.gov.cn/bmx/c100228/202304/736d2f9b15d94ba7a455359366c6c5a6.shtml',
    'matched': len(features), 'indexed': len(areas),
    'missing': [{'code': area['code'], 'name': area['name'], 'provinceCode': area['provinceCode']} for area in missing],
}
(root / 'data/admin-districts-coverage.json').write_text(json.dumps(coverage, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Wrote {len(features)} of {len(areas)} indexed district boundaries in {len(groups)} province files; {len(missing)} unavailable.')
