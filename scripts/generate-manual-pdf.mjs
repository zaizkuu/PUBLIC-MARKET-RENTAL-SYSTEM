/**
 * generate-manual-pdf.mjs
 * Converts the manual HTML into a styled PDF using Puppeteer.
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

async function generatePDF() {
  console.log('🚀 Starting PDF generation...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  const htmlPath = path.join(projectRoot, 'docs', 'manual.html');
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;

  console.log(`📄 Loading HTML from: ${fileUrl}`);
  await page.goto(fileUrl, {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });

  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);
  console.log('✅ Fonts loaded');

  // Give extra time for Google Fonts to render
  await new Promise(r => setTimeout(r, 3000));

  const outputPath = path.join(projectRoot, 'docs', 'PMRMS_User_Manual.pdf');

  console.log('📝 Generating PDF...');
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '18mm',
      right: '16mm',
      bottom: '20mm',
      left: '16mm',
    },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width:100%; font-size:7pt; font-family:Inter,system-ui,sans-serif; color:#9ca3af; padding:0 16mm; display:flex; justify-content:space-between; align-items:center;">
        <span>Public Market Rental Monitoring System — User Manual</span>
        <span>Municipality of Tanauan, Leyte</span>
      </div>
    `,
    footerTemplate: `
      <div style="width:100%; font-size:7pt; font-family:Inter,system-ui,sans-serif; color:#9ca3af; padding:0 16mm; display:flex; justify-content:space-between; align-items:center;">
        <span>Confidential — For Market Office Use Only</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `,
    preferCSSPageSize: false,
  });

  console.log(`✅ PDF generated successfully: ${outputPath}`);

  await browser.close();
  console.log('🎉 Done!');
}

generatePDF().catch(err => {
  console.error('❌ Error generating PDF:', err);
  process.exit(1);
});
