# 数据来源与限制

- 高程地形：可选择 [Mapterhorn](https://mapterhorn.com/attribution) 或 [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)，均为 Terrarium 格式瓦片；高程数据来源及署名请查看其归属说明。中国示例范围的 0–6 级全国概览已内置，`public/terrain-overview` 的 118 个瓦片合计 12,309,112 字节，小于 22 MB；范围外像素已清除，范围内高程保留原值。更高层级按需联网；在线请求失败时保留可用的父级数据，明确离线时放大概览瓦片。默认“中国范围”以外的数据需要联网。高程精度、数据许可和边界完整性需在正式部署前核实。
- `data/places.js` 为精选示例；`data/geonames-mountains.json` 包含从 GeoNames 提取的中文山脉、山体和山峰点，来源与文件校验见 `data/geonames-mountains.meta.json`。数据来自 [GeoNames](https://www.geonames.org/)，依据 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用；经过按名称、类型与示例陆地范围筛选并调整显示级别。它们是近似点，并非山脉范围，名称与海拔仍需核验。仅在 GeoNames 的 elevation 字段有值时显示海拔，不把 DEM 估算值当作测量高程。
- 省级边界及中国裁切范围来自 [China-GeoData](https://github.com/Supeset/China-GeoData)，该仓库声明 MIT 许可，附许可文本见 `data/CHINA-GEODATA-LICENSE`。其上游数据授权、地理完整性及标准地图适用性尚需独立核实；该数据不得视为经过审图的正式地图。
- 地市和区县名称索引来自 [Administrative-divisions-of-China](https://github.com/modood/Administrative-divisions-of-China)，许可文本见 `data/ADMIN-INDEX-LICENSE`。索引覆盖大陆 31 个省级地区，不保证行政区划实时更新，也不包含港澳台的下级行政区。`data/admin-city-centers.json` 是从 DataV 边界数据提取的地市中心坐标，用于边界加载前显示标签；数据来源和使用许可需另行核实。
- 地市级边界与区县边界来自 [阿里云 DataV](https://datav.aliyun.com/portal/school/atlas/area_selector)，其中 2,824 个可匹配区县的边界按省分包，随网页代码按需加载。行政区名称索引中另有 154 个条目未能获取到匹配边界，多为开发区等，搜索仍可用，但无法保证高亮；数据也可能存在更新滞后。数据的授权、准确性和完整性需在正式使用前核实。
- 默认仅请求示例中国陆地区域及其相邻的高程瓦片，并用画面遮罩隐藏范围外地表；由于服务按瓦片提供数据，这些瓦片可能包含范围外的数据。小岛及海域覆盖取决于示例边界数据。
- 道路、铁路和水系使用 [OpenFreeMap](https://openfreemap.org/) 提供的 OpenStreetMap 矢量瓦片；卫星影像使用 [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)，均按需联网，目前不提供离线包。地图使用及来源数据的许可、可用性和覆盖质量需在正式发布前核实。
- 暂未接入全量 OSM 地名、完整的地形数据处理流水线或区域离线下载。公开发布涉及地图内容审核及数据许可，需要另行核验。
- 地图需要支持 WebGL 的浏览器；详细地形、参考图层和卫星影像需要网络。国内网络访问第三方瓦片的效果请在实际网络中测试。
