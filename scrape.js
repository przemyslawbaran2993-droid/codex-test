const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const url = 'https://krakowairport.pl/pl/pasazer/loty/przyloty';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();
  const xhrUrls = [];
  page.on('request', req => {
    const type = req.resourceType();
    if (type === 'xhr' || type === 'fetch') {
      xhrUrls.push(req.url());
    }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('table tbody tr', { timeout: 15000 });
    const rows = await page.$$eval('table tbody tr', trs =>
      trs.map(tr => {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        return {
          time: tds[0] || '',
          flight: tds[1] || '',
          from: tds[2] || '',
          status: tds[3] || '',
          airline: tds[4] || '',
        };
      })
    );
    saveCsv(rows);
  } catch (err) {
    console.error('HTML parsing failed:', err.message);
    if (xhrUrls.length) {
      console.log('Captured XHR/fetch URLs:');
      xhrUrls.forEach(u => console.log(u));
      for (const u of xhrUrls) {
        try {
          const resp = await fetch(u);
          if (!resp.ok) continue;
          const json = await resp.json();
          const items = Array.isArray(json) ? json : json.data || json.items || [];
          if (Array.isArray(items) && items.length) {
            const rows = items.map(item => ({
              time: item.time || item.planned || item.eta || item.sta || item.schedule || '',
              flight: item.flight || item.flightNo || item.number || '',
              from: item.from || item.origin || item.direction || '',
              status: item.status || '',
              airline: item.airline || item.carrier || '',
            }));
            saveCsv(rows);
            break;
          }
        } catch (_) {
          // ignore fetch errors
        }
      }
    }
    if (!fs.existsSync(path.join(__dirname, 'data', 'arrivals.csv'))) {
      saveCsv([]);
    }
  } finally {
    await browser.close();
  }

  function saveCsv(rows) {
    const headers = ['planned_time', 'flight_number', 'from', 'status', 'airline'];
    const csvLines = [headers.join(';'), ...rows.map(r => `${r.time};${r.flight};${r.from};${r.status};${r.airline}`)];
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'data', 'arrivals.csv'), csvLines.join('\n') + '\n', 'utf8');
    console.log(csvLines.slice(0, 6).join('\n'));
  }
})();
