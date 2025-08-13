const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { chromium } = require('playwright');

dayjs.extend(utc);
dayjs.extend(timezone);

const URL = 'https://krakowairport.pl/pl/pasazer/loty/przyloty';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const RETRY_DELAYS = [2000, 4000, 8000];

(async () => {
  let rows = null;
  const jsonUrls = await discoverJsonUrls();
  if (jsonUrls.length) {
    rows = await tryFetchJson(jsonUrls);
  }
  if (!rows) {
    rows = await scrapeWithPlaywright();
  }
  rows = normalize(rows);
  rows.sort((a, b) => a.planned_time.localeCompare(b.planned_time));
  saveCsv(rows);
})().catch(err => {
  console.error(err);
  process.exit(1);
});

async function discoverJsonUrls() {
  const browser = await chromium.launch({ headless: 'new' });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();
  const jsonUrls = new Set();
  page.on('response', async resp => {
    try {
      const ct = resp.headers()['content-type'] || '';
      const url = resp.url();
      if (ct.includes('application/json') && /(arrival|arrivals|flight|flights|przylot)/i.test(url)) {
        jsonUrls.add(url);
      }
    } catch (_) {}
  });
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
  } catch (_) {}
  await browser.close();
  return Array.from(jsonUrls);
}

async function tryFetchJson(urls) {
  for (const u of urls) {
    try {
      const data = await retry(() => axios.get(u).then(res => res.data));
      const items = Array.isArray(data) ? data : (data.data || data.items || data.results || data.arrivals || []);
      if (Array.isArray(items) && items.length) {
        return items;
      }
    } catch (_) {}
  }
  return null;
}

async function scrapeWithPlaywright() {
  return retry(async () => {
    const browser = await chromium.launch({ headless: 'new' });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('table tbody tr', { timeout: 60000 });
    const rows = await page.$$eval('table tbody tr', trs => {
      return trs.map(tr => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        return {
          planned_time: tds[0] || '',
          flight_number: tds[1] || '',
          from: tds[2] || '',
          status: tds[3] || '',
          airline: tds[4] || '',
          belt: tds[5] || ''
        };
      });
    });
    await browser.close();
    return rows;
  });
}

async function retry(fn) {
  for (let i = 0; i < RETRY_DELAYS.length; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === RETRY_DELAYS.length - 1) throw err;
      await new Promise(res => setTimeout(res, RETRY_DELAYS[i]));
    }
  }
}

function normalize(items) {
  return items.map(item => {
    const planned = normalizeTime(item.planned_time || item.time || item.planned || item.sta || item.eta || '');
    const flight = normalizeFlight(item.flight_number || item.flight || item.flightNo || item.number || '');
    const originCity = (item.from || item.origin || item.city || '').replace(/Szczegóły lotu/gi, '').trim();
    const originIata = (item.iata || item.code || item.airportCode || '').replace(/Szczegóły lotu/gi, '').trim();
    const from = originCity && originIata ? `${originCity} (${originIata})` : originCity || originIata;
    const status = normalizeStatus(item.status || '');
    const airline = (item.airline || item.carrier || '').replace(/Szczegóły lotu/gi, '').trim();
    const belt = (item.belt || item.carousel || '').replace(/Szczegóły lotu/gi, '').trim();
    return { planned_time: planned, flight_number: flight, from, status, airline, belt };
  }).filter(r => r.planned_time && r.flight_number);
}

function normalizeTime(str) {
  if (!str) return '';
  const d = dayjs.tz(str, 'Europe/Warsaw');
  if (!d.isValid()) return '';
  return d.format('YYYY-MM-DD HH:mm');
}

function normalizeFlight(str) {
  return (str || '').replace(/\s+/g, '').toUpperCase();
}

function normalizeStatus(str) {
  const clean = (str || '').replace(/Szczegóły lotu/gi, '').trim().toUpperCase();
  const map = {
    'SCHEDULED': 'Zaplanowany',
    'LANDED': 'Lądował',
    'DELAYED': 'Opóźniony',
    'CANCELLED': 'Odwołany'
  };
  return map[clean] || 'Inny';
}

function saveCsv(rows) {
  const headers = 'planned_time;flight_number;from;status;airline;belt';
  const lines = [headers, ...rows.map(r => `${r.planned_time};${r.flight_number};${r.from};${r.status};${r.airline};${r.belt}`)];
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'data', 'arrivals.csv'), lines.join('\n') + '\n', 'utf8');
  console.log(lines.slice(0, 6).join('\n'));
}
