const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function runLighthouseAudit() {
  console.log('--- RUNNING LIGHTHOUSE ACCESSIBILITY AUDIT ---');
  const tempProfileDir = path.join(os.tmpdir(), 'edge-lh-profile-' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempProfileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--remote-debugging-port=9222'],
  });

  try {
    const lighthouse = (await import('lighthouse')).default;
    const result = await lighthouse('http://127.0.0.1:5173/', {
      port: 9222,
      output: 'json',
      onlyCategories: ['accessibility'],
      logLevel: 'error',
    });

    const report = JSON.parse(result.report);
    const a11yScore = Math.round(report.categories.accessibility.score * 100);
    console.log(`\n========================================`);
    console.log(`LIGHTHOUSE ACCESSIBILITY SCORE: ${a11yScore} / 100`);
    console.log(`========================================\n`);

    if (report.categories.accessibility.auditRefs) {
      const audits = report.audits;
      const failed = report.categories.accessibility.auditRefs
        .filter(ref => ref.weight > 0 && audits[ref.id] && audits[ref.id].score !== null && audits[ref.id].score < 1)
        .map(ref => ({ id: ref.id, title: audits[ref.id].title, desc: audits[ref.id].description }));
      if (failed.length > 0) {
        console.log('Failed accessibility audits:');
        failed.forEach(f => console.log(`- ${f.title} (${f.id})`));
      } else {
        console.log('All weighted accessibility audits PASSED!');
      }
    }
  } catch (err) {
    console.error('Lighthouse audit error:', err);
  } finally {
    await browser.close();
  }
}

runLighthouseAudit();
