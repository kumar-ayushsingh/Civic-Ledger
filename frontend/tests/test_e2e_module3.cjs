const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = ms => new Promise(r => setTimeout(r, ms));

async function runModule3Tests() {
  console.log('--- STARTING MODULE 3 DATA LAYER & LEDGER E2E TESTS ---');
  // 0. Ensure clean seed state before running tests
  await fetch('http://127.0.0.1:8000/api/demo/reset', { method: 'POST' });

  const tempProfileDir = path.join(os.tmpdir(), 'edge-m3-profile-' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempProfileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('response', res => {
    if (res.status() >= 400) console.log('RESP ERROR:', res.status(), res.url());
  });

  try {
    // 1. Visit Landing Page
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
    console.log('1. Page loaded at /');

    // 2. Click Verify Ledger Chain in Header
    console.log('\n2. Testing Header Verify Ledger Chain Button...');
    const verifyBtn = await page.$('button[title*="Verify SHA-256 Ledger Chain"]');
    if (!verifyBtn) throw new Error('Verify Ledger Chain button not found in header');

    await verifyBtn.click();
    await delay(1000);

    const btnText = await page.evaluate(el => el.innerText, verifyBtn);
    console.log(`- Verify button after click: "${btnText}"`);
    if (!btnText.includes('Chain valid')) {
      throw new Error(`Expected 'Chain valid', got: ${btnText}`);
    }

    // 3. Launch Prototype -> seeds and verifies for real
    console.log('\n3. Testing Launch Prototype (Real Seed & Verification)...');
    const launchBtn = await page.$('button[aria-label="Launch Prototype"]');
    await launchBtn.click();

    // Check loader appears
    await page.waitForSelector('[role="dialog"]', { timeout: 2000 });
    console.log('- Launch modal appeared');

    // Wait for transition to /app/ledger
    await page.waitForFunction(() => window.location.pathname === '/app/ledger', { timeout: 8000 });
    console.log(`- Navigated to: ${page.url()}`);

    // Check that ledger stub confirms real seed state
    const stubText = await page.$eval('main', el => el.innerText);
    console.log(`- Page has 30 Cases: ${stubText.includes('30')}`);
    console.log(`- Page has 3 Wards: ${stubText.includes('Ward 14, 15, 16')}`);

    // 4. Test Tamper then Verify
    console.log('\n4. Testing Tamper Simulation & Detection...');
    const tamperBtn = await page.$('button[title*="corrupts block #5"]');
    if (!tamperBtn) throw new Error('Simulate Audit Tamper button not found');

    await tamperBtn.click();
    console.log('- Clicked tamper button, waiting for tamper detection in header and banner...');

    // Wait for verify button in header to reflect broken block
    const brokenBtn = await page.waitForSelector('header button[aria-label*="Broken at block"]', { timeout: 8000 });
    const brokenBtnText = await page.evaluate(el => el.innerText, brokenBtn);
    console.log(`- Header button text after tamper: "${brokenBtnText}"`);
    if (!brokenBtnText.includes('Broken at block #5')) {
      throw new Error(`Expected 'Broken at block #5', got: ${brokenBtnText}`);
    }

    // Tamper banner must now be visible in DOM
    const banner = await page.waitForSelector('#tamper-banner', { timeout: 5000 });
    const bannerText = await page.evaluate(el => el.innerText, banner);
    console.log(`- Tamper banner visible: "${bannerText.replace(/\s+/g, ' ')}"`);
    if (!bannerText.includes('LEDGER TAMPER DETECTED') || !bannerText.includes('Block #5')) {
      throw new Error(`Tamper banner wording unexpected: ${bannerText}`);
    }

    // 5. Test Restore Clean Chain
    console.log('\n5. Testing Restore Clean Chain...');
    const restoreBtn = await page.waitForSelector('#tamper-banner button', { timeout: 5000 });
    await restoreBtn.click();

    // Check banner is dismissed
    await page.waitForFunction(() => !document.querySelector('#tamper-banner'), { timeout: 8000 });
    console.log(`- Banner dismissed after restore: true`);

    // Header button should now show valid chain
    await page.waitForFunction(() => {
      const btn = document.querySelector('header button[title*="Verify SHA-256 Ledger Chain"]');
      return btn && btn.innerText.includes('Chain valid');
    }, { timeout: 8000 });
    const restoredBtn = await page.$('header button[title*="Verify SHA-256 Ledger Chain"]');
    const restoredText = await page.evaluate(el => el.innerText, restoredBtn);
    console.log(`- Header button text after restore: "${restoredText}"`);

    console.log('\n--- ALL MODULE 3 E2E ACCEPTANCE TESTS PASSED! ---');
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runModule3Tests();
