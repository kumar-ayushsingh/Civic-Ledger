const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axeCore = require('axe-core');

const CHROME_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES_TO_AUDIT = [
  { name: 'Landing Page', url: 'http://127.0.0.1:5173/' },
  { name: 'Citizen Report Wizard', url: 'http://127.0.0.1:5173/app/report' },
  { name: 'Public Tracking Timeline', url: 'http://127.0.0.1:5173/track/CAS-8901' },
  { name: 'Public Dashboard & Ledger', url: 'http://127.0.0.1:5173/app/ledger' },
  { name: 'Officer Management Portal', url: 'http://127.0.0.1:5173/app/officer' },
  { name: 'Demo Control Panel', url: 'http://127.0.0.1:5173/demo' },
];

async function runAccessibilityAudit() {
  console.log('=== STARTING AUTOMATED AXE-CORE ACCESSIBILITY AUDIT ===\n');

  const tempProfileDir = path.join(os.tmpdir(), 'edge-axe-profile-' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempProfileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const summary = [];

  for (const item of PAGES_TO_AUDIT) {
    console.log(`Auditing: ${item.name} (${item.url})...`);
    await page.goto(item.url, { waitUntil: 'networkidle0' });
    await delay(1000);

    // Inject axe-core source
    await page.evaluate(axeCore.source);

    // Run axe
    const results = await page.evaluate(async () => {
      return await window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa'],
        },
      });
    });

    const violations = results.violations || [];
    const passes = results.passes || [];
    const incomplete = results.incomplete || [];

    console.log(`- Passes: ${passes.length} rules`);
    console.log(`- Violations: ${violations.length} rules`);

    if (violations.length > 0) {
      console.log('  Violations found:');
      violations.forEach((v, idx) => {
        console.log(`    ${idx + 1}. [${v.impact?.toUpperCase()}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
      });
    } else {
      console.log('  ✓ ZERO WCAG 2.1 AA Violations detected!');
    }
    console.log('');

    summary.push({
      page: item.name,
      url: item.url,
      passesCount: passes.length,
      violationsCount: violations.length,
      violations: violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
      })),
    });
  }

  await browser.close();

  // Write detailed report
  const reportPath = path.resolve(__dirname, '../../docs/ACCESSIBILITY_AUDIT_REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log('=== ACCESSIBILITY AUDIT SUMMARY ===');
  summary.forEach((s) => {
    console.log(`${s.page}: ${s.violationsCount === 0 ? '✓ PASSED (0 violations)' : `✗ ${s.violationsCount} violations`}`);
  });
}

runAccessibilityAudit();
