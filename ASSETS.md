# 素材與協定來源

## 即時遊戲

探險者、石豹、道路、障礙、石雕、遺物與火炬由 Three.js 繪製。人物的跑步、起跳、滑行與踉蹌由遊戲狀態驅動。介面圖示、菱形標誌與 Web Audio 音效為本作製作。Three.js 隨成品附上 [MIT 授權](public/licenses/three.txt)。

## 主視覺與章節圖

使用內建 ImageGen 生成原創場景，將結果壓縮成 WebP 隨遊戲提供。下列英文是製作時使用的構圖提示。

**[首頁石門](public/art/gate.webp)**

> Use case: stylized-concept. Make a single full-bleed ultra-wide landscape cinematic key art for an original high-end jungle temple running game, 2.5:1 horizontal composition. No text, letters, typography, labels, logos, graphic borders or overlays anywhere. Vast brooding lost tropical jungle city at golden dawn, painterly realism / AAA adventure game key art with fine, sumptuous engraved stone detailing, deep painterly foliage, strong silhouettes, atmospheric tonal layering. Right of center: an enormous stepped ancient temple with its formidable sculpted monolithic entrance arch, two upright weathered chamfered stone pylons with elaborate square curling ancient friezes, stone faces and moss, high temple crown on top, hanging vines and cascading roots. Near its entrance two burning copper bowls, amber beams pouring through mist and illuminating steps and wet broken flagstones in deep perspective. A very small single backpacked explorer with ochre scarf seen from behind on the path on the right half for scale. Temple complex is monumental, visually reads as a grand pyramid with a distinct arch cut into center. Golden daylight filtered between trees versus deep jungle teal shadows. Foreground crescent silhouettes of oversized leaves and gnarled roots. Left 35% is predominantly dark near-black teal foliage in shade, still detailed but calm, for text added later. Main temple and amber sunlit mist, strong highlights, foreground path in right 65%. Far background temple towers rising through teal haze, small flecks sunlit insects. Refined atmospheric cinematic landscape, crisp high-end environment art, original ancient temple iconography, rich yet restrained colors, no modern objects.

**[苔石古道](public/art/trail.webp) · [峽谷吊橋](public/art/bridge.webp) · [火炬神殿](public/art/sanctum.webp)**

> Use case: stylized-concept. Create a cinematic environment-art contact sheet with exactly THREE distinct wide landscape panels stacked vertically edge to edge, each ONE THIRD of the image height. Overall image square. Each row is an independent 3:1 landscape vignette, no gutters, no borders, no text, no letters anywhere. High-detail atmospheric painterly realism, AAA adventure key art, original jungle temple world, strong depth of field and textural detail. TOP one third: vibrant viridian overgrown jungle path, close mossy dark emerald stone slabs on the ground, tangled roots, two weathered carved ancient gate pillars, leaves framing, bright cyan-tinged streams of sunlight through forest mist. MIDDLE one third: a precarious antique hanging rope and wood suspension bridge swoops from near left to the far right across a huge chasm, rainforest cliffs, a tall misty white waterfall on right, cool forest greens, dramatic golden amber late afternoon sunshine breaking through the canyon, huge sense of height and scale. BOTTOM one third: interior of an immense firelit ancient jungle stone temple, large sculpted stone idol face in the back, faded geometric gold carvings, many glowing orange torches flaming between monumental antique columns, sparks against theatrical charcoal shadows. Each panel visually entire self-contained landscape travel image. No humans, no grids, no UI, no lettering, no blended transitions. Produce refined, richly detailed and bright scenic game concept art.

**即時場景的環境圖集**

- [遠景環繞圖](public/art/env-horizon.webp) 以黃金時刻的薄霧雨林、石灰岩山峰與遠方遺跡為生成提示，作為鏡頭後方的遠景。
- [樹冠圖集](public/art/env-trees.webp) 以透明背景的熱帶木棉、棕櫚樹為生成提示，用於中遠景林木。
- [林下植被圖集](public/art/env-undergrowth.webp) 以透明背景的蕨葉叢、覆苔雕石為生成提示，用於路沿景物。道路、落差、石牆與角色保有獨立的三維幾何。

## 機台通訊

`src/vendor/protocol.js` 和 TypeScript 宣告沿用工作區的 `rehab_neon_rider`。原始 WebBLE v1 編解碼器來自韌體專案 [web/protocol.js](https://github.com/root50643/rehab_esp32_webble/blob/93e8fb5baabb0682fb5a3280de51fc02a2ac4a82/web/protocol.js)。本作品使用相同的 UUID、分片、命令序列與裝置租約。來源庫未附再授權條款。
