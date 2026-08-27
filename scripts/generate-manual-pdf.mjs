/**
 * generate-manual-pdf.mjs
 * Renders docs/manual.html into the printed operator's manual.
 *
 * The manual is laid out as one continuous document rather than a page per
 * chapter, so that no page ends half empty. Puppeteer supplies the running
 * header and footer; everything else comes from the stylesheet in the HTML.
 *
 * Usage:  node scripts/generate-manual-pdf.mjs
 * Output: docs/PMRMS_User_Manual.pdf
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/* Fonts are vendored under public/fonts, so the manual builds with no network.
   Inter is the text face; the running head is set in it too. */
const HEADER = `
  <div style="width:100%;font-size:7pt;font-family:Inter,system-ui,sans-serif;color:#8b93a5;
              padding:0 14mm;margin-top:6mm;display:flex;justify-content:space-between;
              align-items:center;border-bottom:0.5pt solid #dfe3ec;padding-bottom:2mm;">
    <span style="font-weight:700;color:#243B8F;">Public Market Rental Monitoring System</span>
    <span>Operator&rsquo;s User Manual &middot; Municipality of Tanauan, Leyte</span>
  </div>
`;

const FOOTER = `
  <div style="width:100%;font-size:7pt;font-family:Inter,system-ui,sans-serif;color:#8b93a5;
              padding:0 14mm;margin-bottom:5mm;display:flex;justify-content:space-between;
              align-items:center;border-top:0.5pt solid #dfe3ec;padding-top:2mm;">
    <span>PMRMS-UM-001 &middot; v1.0 &middot; Controlled &mdash; for Market Office use</span>
    <span style="font-weight:700;color:#243B8F;">
      <span class="pageNumber"></span> / <span class="totalPages"></span>
    </span>
  </div>
`;

async function generatePDF() {
  console.log('Starting PDF generation...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });

  const page = await browser.newPage();

  const htmlPath = path.join(projectRoot, 'docs', 'manual.html');
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;

  console.log(`Loading ${fileUrl}`);
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });

  await page.evaluate(() => document.fonts.ready);
  // The icon font resolves through ligatures; give it a beat to settle before
  // the layout is frozen for printing.
  await new Promise((r) => setTimeout(r, 2000));
  console.log('Fonts loaded');

  const outputPath = path.join(projectRoot, 'docs', 'PMRMS_User_Manual.pdf');

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', right: '14mm', bottom: '15mm', left: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: HEADER,
    footerTemplate: FOOTER,
    preferCSSPageSize: false,
  });

  const pages = await page.evaluate(() => document.querySelectorAll('.figure').length);
  console.log(`PDF written to ${outputPath} (${pages} figures)`);

  await browser.close();
  console.log('Done.');
}

generatePDF().catch((err) => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
