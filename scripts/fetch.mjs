// Daily fetch: pull the latest egg_detail page and update data/latest.json + data/{YEAR}.json.
import {
  getLatestDetailUrl,
  fetchDetailBody,
  parseDetail,
  upsertYearFile,
  writeLatestFile,
} from './lib.mjs';

async function main() {
  const url = await getLatestDetailUrl();
  console.error(`[fetch] ${url}`);
  const idMatch = url.match(/\/egg_detail\/(\d+)\//);
  const id = idMatch ? Number(idMatch[1]) : null;
  if (!id) throw new Error(`Cannot extract ID from ${url}`);

  const res = await fetchDetailBody(id);
  if (res.redirected) throw new Error(`Latest ID ${id} unexpectedly redirected`);

  const record = parseDetail(res.body, res.url);
  if (!record) throw new Error('Failed to parse detail page');

  const taichungTransport = record.prices?.['雞蛋']?.['台中']?.['大運輸'];
  if (typeof taichungTransport !== 'number') {
    throw new Error('Required field 台中-雞蛋-大運輸 missing or invalid');
  }

  console.error(`[fetch] date=${record.date} 台中-雞蛋-大運輸=${taichungTransport}`);

  const latestFile = await writeLatestFile(record);
  const yearFile = await upsertYearFile(record);
  console.error(`[fetch] wrote ${latestFile} + ${yearFile}`);
}

main().catch((err) => {
  console.error('[fetch] FAILED:', err.message);
  process.exit(1);
});
