# taiwan-egg-prices

每日抓取 [勤億蛋品科技](https://tw.chinyieggs.com/egg/) 公告的台灣每日蛋價（依台北市蛋商公會公告），以 JSON 形式存放在 GitHub，供各專案以 jsDelivr CDN 拉取使用。

仿照 [TaiwanCalendar](https://github.com/ruyut/TaiwanCalendar) 的同步模式 — 各專案需要時 fetch，無需自己排程。

## 資料 URL

| 用途 | URL |
|------|-----|
| 最新一日（單筆） | `https://cdn.jsdelivr.net/gh/Dovewu-cell/taiwan-egg-prices/data/latest.json` |
| 整年（陣列） | `https://cdn.jsdelivr.net/gh/Dovewu-cell/taiwan-egg-prices/data/{YEAR}.json` |

> jsDelivr 預設快取 12 小時。本資料每日更新一次，CDN 自然過期即可。

## JSON Schema

`latest.json`（單筆物件）：

```json
{
  "date": "2026-05-12",
  "source": "https://tw.chinyieggs.com/egg_detail/1844/",
  "fetchedAt": "2026-05-12T01:30:00.000Z",
  "unit": "元/600克/未稅",
  "prices": {
    "雞蛋": {
      "台北": { "批發": 38, "大運輸": 31.5 },
      "台中": { "批發": 38, "大運輸": 31.5 },
      "台南": { "大運輸": 33 }
    }
  }
}
```

`{YEAR}.json` 為上面物件的陣列，按 `date` 升冪排列。

休市日（例如農曆春節）會多一個 `closed: true` 旗標，且價格為 `null`：

```json
{ "date": "2026-02-17", "closed": true, "prices": { "雞蛋": { "台北": { "批發": null, "大運輸": null }, ... } } }
```

## 使用範例

### Node.js / Express（poultry-farm-zeabur 等）
```js
const r = await fetch('https://cdn.jsdelivr.net/gh/Dovewu-cell/taiwan-egg-prices/data/latest.json');
const { date, prices } = await r.json();
const 台中大運輸 = prices['雞蛋']['台中']['大運輸'];
```

### Google Apps Script（payroll-system 等）
```js
const url = 'https://cdn.jsdelivr.net/gh/Dovewu-cell/taiwan-egg-prices/data/latest.json';
const data = JSON.parse(UrlFetchApp.fetch(url).getContentText());
const 台中大運輸 = data.prices['雞蛋']['台中']['大運輸'];
```

### 前端純 HTML（feed-sim 等）
```js
fetch('https://cdn.jsdelivr.net/gh/Dovewu-cell/taiwan-egg-prices/data/2026.json')
  .then(r => r.json())
  .then(arr => /* 畫趨勢圖 */);
```

## 排程

GitHub Actions 每日台灣時間 09:30（UTC 01:30）自動執行 `scripts/fetch.mjs`，commit 回 repo。

手動觸發：Actions 頁面 → `Daily Egg Price Fetch` → Run workflow，或：

```bash
gh workflow run daily-fetch.yml
```

## 本機開發

```bash
npm install
npm run fetch                                # 抓今天
npm run backfill -- 1700 1843 2026-01-01     # 回填指定 ID 範圍 + 日期下限
```

`backfill` 用法：`node scripts/backfill.mjs [startId] [endId] [minDate] [maxDate]`

- 偵測 302 redirect 自動跳過已刪除的 ID
- 每筆延遲 500ms，避免打太快
- 同日期紀錄會被覆寫，可中斷重跑

## 資料來源

- 勤億蛋品科技 — 台灣每日蛋價（依台北市蛋商公會及養雞場代表會商決定，每日公告於聯合報）
- 單位：元 / 600 克 / 未稅
