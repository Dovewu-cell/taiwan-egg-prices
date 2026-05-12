// Shared scraping helpers for chinyieggs.com daily egg prices.
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';

export const DATA_DIR = path.resolve('data');
export const INDEX_URL = 'https://tw.chinyieggs.com/egg/';
export const DETAIL_URL = (id) => `https://tw.chinyieggs.com/egg_detail/${id}/`;
export const UNIT = '元/600克/未稅';

const UA = 'Mozilla/5.0 (taiwan-egg-prices scraper; +https://github.com/Dovewu-cell/taiwan-egg-prices)';

async function fetchText(url, opts = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, ...opts });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}

// Returns null if the detail page redirects (deleted record); otherwise returns body.
export async function fetchDetailBody(id) {
  const url = DETAIL_URL(id);
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'manual' });
  if (r.status === 302 || r.status === 301) return { redirected: true, url };
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return { redirected: false, url, body: await r.text() };
}

export async function getLatestDetailUrl() {
  const html = await fetchText(INDEX_URL);
  const ids = [...html.matchAll(/\/egg_detail\/(\d+)\//g)].map((m) => Number(m[1]));
  if (!ids.length) throw new Error('No /egg_detail/<id>/ links found on index');
  return DETAIL_URL(Math.max(...ids));
}

export async function getLatestDetailId() {
  const html = await fetchText(INDEX_URL);
  const ids = [...html.matchAll(/\/egg_detail\/(\d+)\//g)].map((m) => Number(m[1]));
  if (!ids.length) throw new Error('No /egg_detail/<id>/ links found on index');
  return Math.max(...ids);
}

function parseEggCell(text) {
  const out = {};
  const closed = text.includes('休市');
  const wholesale = text.match(/批發\s*([\d.]+)/);
  const transport = text.match(/大運輸\s*([\d.]+)/);
  if (wholesale) out['批發'] = Number(wholesale[1]);
  else if (closed && /批發/.test(text)) out['批發'] = null;
  if (transport) out['大運輸'] = Number(transport[1]);
  else if (closed && /大運輸/.test(text)) out['大運輸'] = null;
  if (!wholesale && !transport && !closed) {
    const num = text.replace(/\s+/g, '').match(/^([\d.]+)$/);
    if (num) out['大運輸'] = Number(num[1]);
  } else if (closed && !wholesale && !transport) {
    // 純「休市」cell（如台南整格只寫休市）
    out['大運輸'] = null;
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
  return found;
}

// Parses a detail page's HTML into a record. Returns null on unparseable structure.
export function parseDetail(html, sourceUrl) {
  const $ = load(html);
  const dm = $('body').text().match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!dm) return null;
  const date = `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`;

  const table = findPriceTable($);
  if (!table) return null;

  const trs = table.find('tr').toArray();
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
  if (headerIdx === -1 || !regions.length) return null;

  const prices = { '雞蛋': {} };
  let closedFlag = false;
  for (let i = headerIdx + 1; i < trs.length; i++) {
    const cells = $(trs[i]).find('td').toArray();
    if (!cells.length) continue;
    if (tdHtmlToText($, cells[0]) === '雞蛋') {
      for (let j = 0; j < regions.length; j++) {
        const cellText = cells[j + 1] ? tdHtmlToText($, cells[j + 1]) : '';
        if (cellText.includes('休市')) closedFlag = true;
        prices['雞蛋'][regions[j]] = parseEggCell(cellText);
      }
      break;
    }
  }
  if (!Object.keys(prices['雞蛋']).length) return null;

  const record = {
    date,
    source: sourceUrl,
    fetchedAt: new Date().toISOString(),
    unit: UNIT,
    prices,
  };
  if (closedFlag) record.closed = true;
  return record;
}

export async function readYearFile(year) {
  const file = path.join(DATA_DIR, `${year}.json`);
  if (!existsSync(file)) return [];
  try {
    const list = JSON.parse(await readFile(file, 'utf-8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function writeYearFile(year, list) {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${year}.json`);
  list.sort((a, b) => a.date.localeCompare(b.date));
  await writeFile(file, JSON.stringify(list, null, 2) + '\n');
  return file;
}

export async function upsertYearFile(record) {
  const year = record.date.slice(0, 4);
  const list = await readYearFile(year);
  const idx = list.findIndex((r) => r.date === record.date);
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  return writeYearFile(year, list);
}

export async function writeLatestFile(record) {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, 'latest.json');
  await writeFile(file, JSON.stringify(record, null, 2) + '\n');
  return file;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
