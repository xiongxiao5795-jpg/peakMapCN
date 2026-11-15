# 开发与构建

## 本地运行

需要 Node.js 20.19+ 或 22.12+：

```sh
npm ci
npm run dev
```

在本机访问 `http://localhost:4173/`。局域网访问可运行 `npm run dev:lan`，使用输出的地址和 53257 端口。浏览器定位需要 HTTPS 或本机 localhost；在局域网测试定位可运行 `npm run dev:https`，并在设备上信任开发用自签名证书。

```sh
npm test       # 自动测试
npm run build  # 生成 dist
npm run preview
```

`npm run test:isolation` 和 `npm run test:terrain-start` 是需要浏览器的额外检查，可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定 Chromium 可执行文件。

## 网页部署

推送到 `main` 后，GitHub Actions 运行测试和构建，并通过 GitHub Pages 将 `dist` 部署到当前仓库的网站。仓库及构建产物均可公开访问。

## Android

Android 使用 WebView 加载打包的网页。修改网页后须重新构建 APK 才能更新应用。需要 JDK 17 和 Android SDK 35：

```sh
npm ci
npm test
npm run build
cd android
./gradlew assembleDebug
```

发布版通过 GitHub Actions 使用固定密钥签名。手动构建 `assembleRelease` 需要 `ANDROID_KEYSTORE_PATH`、`ANDROID_STORE_PASSWORD`、`ANDROID_KEY_ALIAS` 和 `ANDROID_KEY_PASSWORD`；安全备份密钥和密码，不要提交到仓库。应用要求 Android 8.0（API 26）及以上。

## 数据维护

全国离线概览的体积和估算方法见 [offline-estimate.md](offline-estimate.md)。要重新整理 GeoNames 山地名称，下载其 `CN.zip` 和 `TW.zip`，安装 Python 3 与 `shapely>=2`，然后运行 `python3 scripts/import_geonames.py CN.zip TW.zip`。替换地形源时需确认 Terrarium 编码、跨域、数据许可和署名，并同步检查瓦片级别与裁切逻辑。
