const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickButtonWithText(page, candidates) {
  return await page.evaluate((names) => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    for (const b of buttons) {
      const text = b.innerText.trim().toLowerCase();
      for (const name of names) {
        if (text.includes(name.toLowerCase())) {
          b.click();
          return true;
        }
      }
    }
    return false;
  }, candidates);
}

async function runScenarioIteration(page, iterationNum) {
  console.log(`\n======================================================`);
  console.log(`>>> STARTING SCENARIO ITERATION ${iterationNum} OF 3 <<<`);
  console.log(`======================================================`);

  // Step 0: Clean State Reset
  console.log(`\n[Iteration ${iterationNum}] 0. Triggering /api/demo/reset...`);
  const resetRes = await fetch('http://127.0.0.1:8000/api/demo/reset', { method: 'POST' });
  const resetData = await resetRes.json();
  console.log(`- Database reset in ${resetData.duration_seconds}s (Total blocks: ${resetData.total_blocks})`);

  // Step 1: Citizen Report Wizard
  console.log(`\n[Iteration ${iterationNum}] 1. Filing citizen defect report at /app/report...`);
  await page.goto('http://127.0.0.1:5173/app/report', { waitUntil: 'networkidle0' });
  await delay(800);

  // 1a. Step 1: Phone & Simulated OTP
  await clickButtonWithText(page, ['Send Verification Code', 'सत्यापन कोड']);
  await page.waitForSelector('#sms-toast', { timeout: 4000 });
  await clickButtonWithText(page, ['Auto-fill Code', 'स्वतः कोड भरें']);
  await delay(600);
  await clickButtonWithText(page, ['Continue to Photo', 'फोटो की ओर']);

  // 1b. Step 2: Photo Sample
  await delay(600);
  await clickButtonWithText(page, ['Pothole', 'सड़क का गड्ढा']);
  await delay(600);
  await clickButtonWithText(page, ['Continue to Location', 'स्थान की ओर']);

  // 1c. Step 3: Location
  await page.waitForFunction(
    () => document.body.innerText.includes('3 of 5') || document.body.innerText.includes('3 / 5') || document.body.innerText.includes('चरण 3'),
    { timeout: 5000 }
  );
  await clickButtonWithText(page, ['Use Demo Location', 'डेमो स्थान']);
  await delay(600);
  await clickButtonWithText(page, ['Confirm Location & Analyze', 'स्थान की पुष्टि']);

  // 1d. Step 4: AI Triage & Voice / Description
  await page.waitForFunction(
    () => document.body.innerText.includes('4 of 5') || document.body.innerText.includes('4 / 5') || document.body.innerText.includes('चरण 4'),
    { timeout: 5000 }
  );
  const descTextarea = await page.waitForSelector('textarea');
  await descTextarea.type(`Repeatability test iteration #${iterationNum} defect note`);
  await delay(400);
  await clickButtonWithText(page, ['Continue to Review', 'समीक्षा की ओर']);

  // 1e. Step 5: Review & Submit
  await page.waitForFunction(
    () => document.body.innerText.includes('5 of 5') || document.body.innerText.includes('5 / 5') || document.body.innerText.includes('चरण 5'),
    { timeout: 5000 }
  );
  await clickButtonWithText(page, ['Send Report & Start Clock', 'रिपोर्ट भेजें']);

  // Extract created Case ID from success screen
  const caseIdEl = await page.waitForSelector('#success-case-id', { timeout: 8000 });
  const caseId = await page.evaluate((el) => el.innerText.trim(), caseIdEl);
  console.log(`- Citizen report successfully submitted! Generated Case ID: "${caseId}"`);
  if (!caseId || !caseId.startsWith('CAS-')) {
    throw new Error(`Failed to create case in iteration ${iterationNum}, got: ${caseId}`);
  }

  // Step 2: Public Tracking Timeline
  console.log(`\n[Iteration ${iterationNum}] 2. Verifying Tracking Page at /track/${caseId}...`);
  await page.goto(`http://127.0.0.1:5173/track/${caseId}`, { waitUntil: 'networkidle0' });
  await delay(1000);

  const trackingText = await page.evaluate(() => document.body.innerText.toLowerCase());
  const hasTimeline = trackingText.includes('reported') && (trackingText.includes('pwd') || trackingText.includes('roads'));
  console.log(`- Public tracking timeline active for ${caseId}:`, hasTimeline);

  // Step 3: Officer Portal, Fast-Forward SLA, Fake Rejection & Genuine Fix
  console.log(`\n[Iteration ${iterationNum}] 3. Officer Portal SLA advance, fake rejection & genuine closure...`);
  await page.goto('http://127.0.0.1:5173/app/officer', { waitUntil: 'networkidle0' });
  await delay(1000);

  // 3a. Fast Forward Clock
  await clickButtonWithText(page, ['Fast-Forward SLA', 'समय आगे बढ़ाएं']);
  await delay(1200);

  // 3b. Open Closure Modal on the first ticket
  await clickButtonWithText(page, ['Verify Fix', 'सुधार सत्यापित']);
  await delay(1000);

  // 3c. Fake Rejection: Wrong location
  console.log('- Testing Fake Fix Rejection (Rule 1 GPS)...');
  await clickButtonWithText(page, ['wrong location', 'गलत स्थान']);
  await delay(1500);

  const rejText = await page.evaluate(() => document.body.innerText.toLowerCase());
  const rejectionPassed = rejText.includes('closure rejected') && rejText.includes('gps verification failed');
  console.log('- Rule 1 rejection correctly triggered:', rejectionPassed);
  if (!rejectionPassed) {
    throw new Error(`Expected closure rejection in iteration ${iterationNum}`);
  }

  // 3d. Genuine Fix: Repaired scene
  console.log('- Testing Genuine Repair Acceptance (All 4 rules pass)...');
  // Cancel current rejected modal and open on another ticket
  await page.evaluate(() => {
    const cancelBtns = Array.from(document.querySelectorAll('button')).filter(
      (b) => b.innerText.trim() === 'Cancel' || b.innerText.trim() === 'रद्द करें'
    );
    if (cancelBtns.length > 0) cancelBtns[0].click();
  });
  await delay(800);

  // Pick another open ticket to verify genuine fix
  const verifyButtons = await page.$$('button');
  let secondVerifyBtn = null;
  for (const b of verifyButtons) {
    const txt = await page.evaluate((el) => el.innerText, b);
    if (txt.includes('Verify Fix') || txt.includes('सुधार सत्यापित')) {
      secondVerifyBtn = b;
    }
  }
  if (secondVerifyBtn) {
    await secondVerifyBtn.click();
    await delay(1000);
  }

  await clickButtonWithText(page, ['repaired scene', 'मरम्मत की गई']);
  await delay(2000);

  const genuineText = await page.evaluate(() => document.body.innerText.toLowerCase());
  const genuinePassed = genuineText.includes('closure verified') && !genuineText.includes('failed');
  console.log('- Genuine repair approved and case resolved:', genuinePassed);
  if (!genuinePassed) {
    throw new Error(`Expected closure verification acceptance in iteration ${iterationNum}`);
  }

  // Step 4: Public Dashboard & Tamper Audit
  console.log(`\n[Iteration ${iterationNum}] 4. Public Dashboard, SVG map pins & audit tamper test...`);
  await page.goto('http://127.0.0.1:5173/app/ledger', { waitUntil: 'networkidle0' });
  await delay(1200);

  const dashText = await page.evaluate(() => document.body.innerText.toLowerCase());
  console.log('- Public Dashboard loaded with active metrics:', dashText.includes('active complaints'));
  console.log('- Department scorecards rendered with grades:', dashText.includes('grade a') || dashText.includes('grade b'));

  // Tamper Block #5
  console.log('- Testing Tamper Detection on Block #5...');
  await clickButtonWithText(page, ['Simulate Audit Tamper', 'ऑडिट छेड़छाड़']);
  await delay(1800);

  const postTamperText = await page.evaluate(() => document.body.innerText.toLowerCase());
  const tamperDetected = postTamperText.includes('broken at block #5') || postTamperText.includes('ledger tamper detected');
  console.log('- Malicious tamper detected immediately:', tamperDetected);
  if (!tamperDetected) {
    throw new Error(`Tamper detection failed in iteration ${iterationNum}`);
  }

  // Restore Clean Chain
  console.log('- Restoring clean chain...');
  await clickButtonWithText(page, ['Restore Clean Chain', 'पुनर्स्थापित']);
  await delay(1800);

  const postRestoreText = await page.evaluate(() => document.body.innerText.toLowerCase());
  const restoredClean = postRestoreText.includes('chain valid') && !postRestoreText.includes('broken at block');
  console.log('- Cryptographic ledger chain restored cleanly:', restoredClean);
  if (!restoredClean) {
    throw new Error(`Chain restoration failed in iteration ${iterationNum}`);
  }

  console.log(`\n>>> ITERATION ${iterationNum} COMPLETED SUCCESSFULLY! <<<`);
}

async function runFullRepeatabilitySuite() {
  console.log('=== STARTING 3-CYCLE REPEATABILITY ACCEPTANCE SUITE ===');
  console.log('Testing full end-to-end workflow 3 times consecutively after database reset...\n');

  const tempProfileDir = path.join(os.tmpdir(), 'edge-repeat-profile-' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempProfileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('console', (msg) => {
    const txt = msg.text();
    if (!txt.includes('React Router') && !txt.includes('Download the React DevTools')) {
      // console.log('PAGE:', txt);
    }
  });

  try {
    for (let i = 1; i <= 3; i++) {
      await runScenarioIteration(page, i);
      await delay(1000);
    }

    console.log('\n=============================================================');
    console.log('=== ALL 3 REPEATABILITY ITERATIONS PASSED WITHOUT MANUAL FIXES! ===');
    console.log('=============================================================');
  } catch (err) {
    console.error('\nREPEATABILITY TEST FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runFullRepeatabilitySuite();
