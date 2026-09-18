# taiwan-egg-prices

每日抓取台灣蛋價（勤億蛋品／台北市蛋商公會公告），存成 JSON 放 GitHub 供各專案用 jsDelivr CDN 拉取；另有一個 Netlify 網頁看走勢圖。純資料 repo + 純前端檢視頁，無後端、無 build。

## 速查
| 項目 | 值 |
|---|---|
| Repo | https://github.com/Dovewu-cell/taiwan-egg-prices（public） |
| 本地路徑 | /Users/dovewu02/taiwan-egg-prices |
| 技術棧 | Node 抓取腳本（cheerio）＋ GitHub Actions 排程 ＋ 靜態 index.html（Chart.js）＋ Netlify |
| 線上網頁 | https://eggprice-tw.netlify.app（Netlify 站名 `eggprice-tw`，publish dir = `/`） |
| 資料 CDN | https://cdn.jsdelivr.net/gh/Dovewu-cell/taiwan-egg-prices@main/data/latest.json（**必須加 `@main`**） |
| 排程 | GitHub Actions `daily-fetch.yml`，每日台灣時間 12:00（UTC 04:00），github-actions[bot] 直接 push main |
| 部署 | 前端 Netlify 連 GitHub 自動部署；資料由 Actions push 後 CDN 自然過期更新 |

## 分支與部署
- 單一分支 **main**，資料由排程機器人直接 commit/push main（不走 develop→PR 那套；此 repo 是資料 repo 例外）。
- **單一真相來源在 GitHub/雲端**：機器人每天寫 GitHub，本地 clone 不會自動更新 —— 本機要看最新資料前先 `git pull`。
- 手動觸發抓取：`gh workflow run daily-fetch.yml`。

## 專案架構
```
data/
  latest.json      # 最新一筆（單筆物件）
  {YEAR}.json      # 該年陣列，按 date 升冪
scripts/
  fetch.mjs        # 每日抓取（從來源 latest id 往回掃最多 10 筆，遇已存在日期就停）
  backfill.mjs     # 回填指定 ID/日期範圍
  lib.mjs          # 解析共用
index.html         # 走勢圖檢視頁（Chart.js，fetch 相對路徑 /data/{year}.json）
.github/workflows/daily-fetch.yml
```

## 核心邏輯 / 重要實作
- 價格單位：**元 / 600 克 / 未稅**。
- 價格欄位：`批發`、`大運輸`（電訂運輸價）皆來源原始值；`產地價` **僅台中**衍生 = 台中大運輸 − 3 元。
- 休市日（如農曆春節）該筆帶 `closed: true`，價格為 `null`。
- `fetch.mjs` 往回掃可自動補齊週末／連假累積的缺漏，不必手動 backfill。
- `index.html` 用相對路徑 `/data/`，靠 Netlify（或任何從 repo 根目錄 serve 的 host）同時提供 data 才能運作。

## 跨服務整合
各專案（poultry-farm-zeabur / payroll-system / feed-sim 等）**只讀不寫**，透過 jsDelivr CDN 拉 `latest.json` / `{YEAR}.json`。jsDelivr 快取約 12 小時，資料每日一更，自然過期即可。

## 排錯備忘
- 「本地看起來停在某天沒更新」→ 幾乎都是本機沒 `git pull`；先 `git fetch && git log origin/main` 對照，排程與 Netlify 通常一路正常。
- 確認排程有沒有真的在跑：`gh run list --workflow=daily-fetch.yml`（每天 success 且 log 出現 `[fetch] wrote ... latest.json` 即正常；「No data changes — skipping commit」代表當天來源沒新公告，屬正常）。
- 確認網站有沒有拿到最新：`curl -s https://eggprice-tw.netlify.app/data/2026.json` 看尾筆日期。

---
開發歷史見 git log（此 repo 無獨立 CHANGELOG）。
