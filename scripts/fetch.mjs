// Daily fetch: pull the latest egg_detail page and update data/latest.json + data/{YEAR}.json.
// 從 latest id 往回掃，遇到 year file 已有的 date 就停 —
// 自動補抓週末/連假累積的缺漏（週末勤億不發、週一補發 sat+sun+mon 三筆會一次補齊）。
import {
  getLatestDetailId,
  fetchDetailBody,
  parseDetail,
  readYearFile,
  upsertYearFile,
  writeLatestFile,
  sleep,
} from './lib.mjs';

const SCAN_LIMIT = 10;   // 連假最多 10 天（含過年）
const DELAY_MS = 500;

async function main() {
  const latestId = await getLatestDetailId();
  console.error(`[fetch] latest id=${latestId}, scanning back up to ${SCAN_LIMIT}`);

  let latestRecord = null;
  let writtenCount = 0;

  for (let i = 0; i < SCAN_LIMIT; i++) {
    const id = latestId - i;
    if (id < 1) break;

    const res = await fetchDetailBody(id);
    if (res.redirected) {
      console.error(`[fetch] id=${id} redirected — skip`);
      await sleep(DELAY_MS);
      continue;
    }

    const record = parseDetail(res.body, res.url);
    if (!record) {
      console.error(`[fetch] id=${id} parse failed — skip`);
      await sleep(DELAY_MS);
      continue;
    }

    // 第一筆解析成功的（從 max id 起）= latest.json 內容
    if (latestRecord == null) latestRecord = record;

    // 已存在 → 假設 id 與日期單調，舊的也都已抓過，停掃
    const yearList = await readYearFile(record.date.slice(0, 4));
    if (yearList.find((r) => r.date === record.date)) {
      console.error(`[fetch] id=${id} date=${record.date} already saved → stop scan`);
      break;
    }

    const yearFile = await upsertYearFile(record);
    writtenCount++;
    console.error(`[fetch] id=${id} date=${record.date} → ${yearFile}`);
    await sleep(DELAY_MS);
  }

  if (!latestRecord) throw new Error(`No parsable record in latest ${SCAN_LIMIT} ids`);

  // 必要欄位驗證（僅 latest；休市日豁免）
  const taichungTransport = latestRecord.prices?.['雞蛋']?.['台中']?.['大運輸'];
  if (!latestRecord.closed && typeof taichungTransport !== 'number') {
    throw new Error('Required field 台中-雞蛋-大運輸 missing or invalid (latest)');
  }

  const latestFile = await writeLatestFile(latestRecord);
  console.error(`[fetch] wrote ${latestFile} date=${latestRecord.date} 台中大運輸=${taichungTransport ?? '休市'}`);
  console.error(`[fetch] done — backfilled ${writtenCount} new record(s)`);
}

main().catch((err) => {
  console.error('[fetch] FAILED:', err.message);
  process.exit(1);
});
