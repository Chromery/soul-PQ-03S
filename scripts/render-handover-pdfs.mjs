import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || path.join(root, 'deliverables/handover-2026-10-02'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  for (const [source, name] of [['review', 'PQ-Safety-Feature-Review-2026-10-02'], ['migration', 'PQ-Guida-Migrazione-VPS-2026-10-02']]) {
    const page = await browser.newPage({ viewport: { width: 672, height: 1000 } });
    await page.emulateMedia({ media: 'print' });
    await page.goto(pathToFileURL(path.join(root, 'docs/handover', source + '.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const sizes = await page.locator('.page').evaluateAll(elements => elements.map((element, index) => ({ page: index + 1, height: Math.ceil(element.getBoundingClientRect().height), width: element.scrollWidth })));
    const overflow = sizes.filter(size => size.height > 989 || size.width > 673);
    if (overflow.length) throw new Error(`${source}: content overflow ${JSON.stringify(overflow)}`);
    await page.pdf({ path: path.join(output, name + '.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font:8px Arial;color:#617888;width:100%;margin:0 16mm;display:flex;justify-content:space-between"><span>SOUL PQ · Riservato · 02.10.2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
    console.log(JSON.stringify({ file: name + '.pdf', pages: sizes.length, maxContentHeight: Math.max(...sizes.map(size => size.height)) }));
    await page.close();
  }
} finally { await browser.close(); }
