// Scrape latest egg prices from chinyieggs.com and write data/{YEAR}.json + data/latest.json
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';

const INDEX_URL = 'https://tw.chinyieggs.com/egg/';
const DATA_DIR = path.resolve('data');
const UA = 'Mozilla/5.0 (taiwan-egg-prices scraper; +https://github.com/Dovewu-cell/taiwan-egg-prices)';

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}

async function getLatestDetailUrl() {
  const html = await fetchText(INDEX_URL);
  const ids = [...html.matchAll(/\/egg_detail\/(\d+)\//g)].map((m) => Number(m[1]));
  if (!ids.length) throw new Error('No /egg_detail/<id>/ links found on index page');
  const latest = Math.max(...ids);
  return `https://tw.chinyieggs.com/egg_detail/${latest}/`;
}

function parseEggCell(text) {
  const out = {};
  const wholesale = text.match(/批發\s*([\d.]+)/);
  const transport = text.match(/大運輸\s*([\d.]+)/);
  if (wholesale) out['批發'] = Number(wholesale[1]);
  if (transport) out['大運輸'] = Number(transport[1]);
  if (!wholesale && !transport) {
    const num = text.replace(/\s+/g, '').match(/^([\d.]+)$/);
    if (num) out['大運輸'] = Number(num[1]);
  }
  return out;
}

function tdHtmlToText($, td) {
  return ($(td).html() || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function findPriceTable($) {
  let found = null;
  $('table').each((_, t) => {
    const text = $(t).text();
    if (text.includes('地區') && text.includes('雞蛋')) {
      found = $(t);
      return false;
    }
  });
  if (!found) throw new Error('Price table (含「地區」「雞蛋」) not found');
  return found;
}

async function scrape() {
  const detailUrl = await getLatestDetailUrl();
  console.error(`[fetch] ${detailUrl}`);
  const html = await fetchText(detailUrl);
  const $ = load(html);

  const bodyText = $('body').text();
  const dm = bodyText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!dm) throw new Error('Date (YYYY年MM月DD日) not found on page');
  const date = `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`;

  const table = findPriceTable($);
  const trs = table.find('tr').toArray();

  // Header row: 地區 | 台北 | 台中 | 台南
  let regions = [];
  let headerIdx = -1;
  for (let i = 0; i < trs.length; i++) {
    const cells = $(trs[i]).find('td,th').toArray().map((c) => tdHtmlToText($, c));
    if (cells.includes('地區')) {
      regions = cells.filter((c) => c && c !== '地區');
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1 || regions.length === 0) throw new Error('Header row (地區/台北/台中/台南) not found');

  const prices = { '雞蛋': {} };
  for (let i = headerIdx + 1; i < trs.length; i++) {
    const cells = $(trs[i]).find('td').toArray();
    if (!cells.length) continue;
    const first = tdHtmlToText($, cells[0]);
    if (first === '雞蛋') {
      for (let j = 0; j < regions.length; j++) {
        const cellText = cells[j + 1] ? tdHtmlToText($, cells[j + 1]) : '';
        prices['雞蛋'][regions[j]] = parseEggCell(cellText);
      }
      break;
    }
  }

  if (!Object.keys(prices['雞蛋']).length) throw new Error('雞蛋 row not parsed');

  // Sanity check: 台中-雞蛋-大運輸 must exist (核心需求)
  const taichungTransport = prices['雞蛋']?.['台中']?.['大運輸'];
  if (typeof taichungTransport !== 'number' || Number.isNaN(taichungTransport)) {
    throw new Error('Required field 台中-雞蛋-大運輸 missing or invalid');
  }

  return {
    date,
    source: detailUrl,
    fetchedAt: new Date().toISOString(),
    unit: '元/600克/未稅',
    prices,
  };
}

async function upsertYearFile(record) {
  const year = record.date.slice(0, 4);
  const file = path.join(DATA_DIR, `${year}.json`);
  let list = [];
  if (existsSync(file)) {
    try {
      list = JSON.parse(await readFile(file, 'utf-8'));
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
  }
  const idx = list.findIndex((r) => r.date === record.date);
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  list.sort((a, b) => a.date.localeCompare(b.date));
  await writeFile(file, JSON.stringify(list, null, 2) + '\n');
  return file;
}

async function main() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  const record = await scrape();
  console.error('[fetch] parsed:', JSON.stringify(record.prices['雞蛋'], null, 2));
  console.error(`[fetch] 台中-雞蛋-大運輸 = ${record.prices['雞蛋']['台中']['大運輸']}`);

  const latestFile = path.join(DATA_DIR, 'latest.json');
  await writeFile(latestFile, JSON.stringify(record, null, 2) + '\n');
  const yearFile = await upsertYearFile(record);
  console.error(`[fetch] wrote ${latestFile} + ${yearFile}`);
}

main().catch((err) => {
  console.error('[fetch] FAILED:', err.message);
  process.exit(1);
});
