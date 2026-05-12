// Backfill historical egg prices by iterating egg_detail IDs.
//
// Usage:
//   node scripts/backfill.mjs [startId] [endId] [minDate] [maxDate]
//
// Defaults: startId=1, endId=<latest from index>-1, no date filter.
// Examples:
//   node scripts/backfill.mjs 1700 1843 2026-01-01           # 抓 ID 1700-1843，僅保留 >= 2026-01-01
//   node scripts/backfill.mjs 1 1843                          # 全回填（不含今天）
//
// Behaviour:
//   - 偵測 302 redirect → 跳過已刪除的 ID
//   - 解析失敗的 ID 印警告，但不中斷
//   - 依日期 group，批次寫入 data/{YEAR}.json（覆寫同日期紀錄）
//   - 已存在的日期會被新抓到的覆寫；如果想保留舊值請先 git stash data/

import {
  fetchDetailBody,
  parseDetail,
  readYearFile,
  writeYearFile,
  getLatestDetailId,
  sleep,
} from './lib.mjs';

const DELAY_MS = 500;

async function main() {
  const argv = process.argv.slice(2);
  const startId = argv[0] ? Number(argv[0]) : 1;
  const latestId = await getLatestDetailId();
  const endId = argv[1] ? Number(argv[1]) : latestId - 1;
  const minDate = argv[2] || null;
  const maxDate = argv[3] || null;

  console.error(`[backfill] ID 範圍: ${startId} → ${endId}`);
  if (minDate) console.error(`[backfill] minDate=${minDate}`);
  if (maxDate) console.error(`[backfill] maxDate=${maxDate}`);
  console.error(`[backfill] 預估 ${endId - startId + 1} 個 ID，延遲 ${DELAY_MS}ms，需時約 ${Math.round((endId - startId + 1) * DELAY_MS / 1000)}s`);

  const byYear = new Map(); // year -> Map<date, record>
  let okCount = 0;
  let redirectCount = 0;
  let failCount = 0;
  let filteredCount = 0;

  for (let id = startId; id <= endId; id++) {
    try {
      const res = await fetchDetailBody(id);
      if (res.redirected) {
        redirectCount++;
        process.stderr.write('R');
        await sleep(DELAY_MS);
        continue;
      }
      const record = parseDetail(res.body, res.url);
      if (!record) {
        failCount++;
        console.error(`\n[backfill] ID=${id} parse failed`);
        await sleep(DELAY_MS);
        continue;
      }
      if (minDate && record.date < minDate) {
        filteredCount++;
        process.stderr.write('.');
        await sleep(DELAY_MS);
        continue;
      }
      if (maxDate && record.date > maxDate) {
        filteredCount++;
        process.stderr.write('.');
        await sleep(DELAY_MS);
        continue;
      }
      const year = record.date.slice(0, 4);
      if (!byYear.has(year)) byYear.set(year, new Map());
      byYear.get(year).set(record.date, record);
      okCount++;
      if (okCount % 10 === 0) process.stderr.write(`[${okCount}]`);
      else process.stderr.write('o');
    } catch (err) {
      failCount++;
      console.error(`\n[backfill] ID=${id} ERROR: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }
  process.stderr.write('\n');

  console.error(`\n[backfill] 完成: ok=${okCount} redirect=${redirectCount} fail=${failCount} filtered=${filteredCount}`);

  // Merge into existing year files
  for (const [year, byDate] of byYear) {
    const existing = await readYearFile(year);
    const existingByDate = new Map(existing.map((r) => [r.date, r]));
    for (const [date, record] of byDate) {
      existingByDate.set(date, record);
    }
    const merged = [...existingByDate.values()];
    const file = await writeYearFile(year, merged);
    console.error(`[backfill] ${file}: ${merged.length} records (added/updated ${byDate.size})`);
  }
}

main().catch((err) => {
  console.error('[backfill] FATAL:', err);
  process.exit(1);
});
