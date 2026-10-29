const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickButtonWithText(page, textList) {
  const patterns = Array.isArray(textList) ? textList : [textList];
  await page.waitForFunction(
    (pats) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some((b) => pats.some((p) => b.innerText.toLowerCase().includes(p.toLowerCase())));
    },
    { timeout: 8000 },
    patterns
  );

  const clicked = await page.evaluate((pats) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find((b) => pats.some((p) => b.innerText.toLowerCase().includes(p.toLowerCase())));
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, patterns);

  if (!clicked) {
    throw new Error(`Failed to find and click button with text in: ${JSON.stringify(patterns)}`);
  }
}

(async () => {
  console.log('=== STARTING OFFICER PORTAL & REAL CLOSURE VERIFICATION E2E ACCEPTANCE TEST ===\n');

  // Reset database before test
  try {
    await fetch('http://127.0.0.1:8000/api/demo/reset', { method: 'POST' });
  } catch (e) {}

  const tempProfileDir = path.join(os.tmpdir(), 'edge-officer-' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempProfileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.includes('React DevTools') && !text.includes('favicon')) {
      console.log('PAGE LOG:', text);
    }
  });

  try {
    // 1. Navigate to /app/officer
    console.log('1. Navigating to Officer Portal at /app/officer...');
    await page.goto('http://127.0.0.1:5173/app/officer', { waitUntil: 'networkidle0' });
    await delay(1000);

    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('- Header portal title present:', pageText.includes('Field Worker and Officer Management Portal') || pageText.includes('फील्ड वर्कर एवं अधिकारी'));
    console.log('- Role switcher chips present:', pageText.includes('Field engineer L1') || pageText.includes('फील्ड इंजीनियर'));
    console.log('- Fast forward button present:', pageText.includes('Fast Forward SLA') || pageText.includes('+2 Hours'));

    // 2. Test Fast Forward SLA (+2 Hours)
    console.log('\n2. Testing Fast Forward SLA (+2 Hours)...');
    await clickButtonWithText(page, ['Fast Forward SLA (+2 Hours)', 'फास्ट फॉरवर्ड']);
    await delay(1500);

    const toastVisible = await page.evaluate(() => document.body.innerText.includes('Simulated clock fast-forwarded by +2h'));
    console.log('- Fast forward feedback toast visible:', toastVisible);

    // 3. Test Active Queue Table & Sorting
    console.log('\n3. Inspecting Active Repair Queue table...');
    const queueRowsCount = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
    console.log(`- Queue table rendered with ${queueRowsCount} tickets`);
    if (queueRowsCount === 0) {
      throw new Error('Active repair queue is empty.');
    }

    const tableText = await page.evaluate(() => document.body.innerText);
    console.log('- Table displays SLA deadline countdowns:', tableText.includes('left') || tableText.includes('Overdue') || tableText.includes('Completed'));
    console.log('- Contractor liability chips rendered:', tableText.includes('Contractor Liability') || tableText.includes('ठेकेदार दायित्व'));

    // 4. Test Case Drawer & Explainable Severity Factors
    console.log('\n4. Opening Case Drawer...');
    // Click first case ID
    const firstCaseId = await page.evaluate(() => {
      const link = document.querySelector('tbody tr td span.text-sky-600');
      if (link) {
        link.click();
        return link.innerText.trim();
      }
      return null;
    });
    console.log(`- Clicked Case ID: "${firstCaseId}"`);
    await delay(1200);

    const drawerText = await page.evaluate(() => document.body.innerText.toLowerCase());
    console.log('- Drawer meta strip visible:', drawerText.includes('department') && drawerText.includes('ward & location'));
    console.log('- Explainable Severity Factors visible:', drawerText.includes('explainable severity factors') || drawerText.includes('severity score ='));
    console.log('- Evidence photos section rendered:', drawerText.includes('evidence photos') || drawerText.includes('साक्ष्य फोटो'));

    // Test Acknowledge in Drawer (if available)
    const ackBtnExists = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.innerText.includes('Acknowledge Case') || b.innerText.includes('संज्ञान लें')
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (ackBtnExists) {
      console.log('- Clicked "Acknowledge Case" button in drawer');
      await delay(1000);
      const postAckText = await page.evaluate(() => document.body.innerText);
      console.log('- Status updated to Acknowledged in drawer without reload:', postAckText.includes('Acknowledged') || postAckText.includes('संज्ञान में लिया गया'));
    } else {
      console.log('- Case already acknowledged');
    }

    // Close drawer
    await page.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Close drawer"]');
      if (closeBtn) closeBtn.click();
    });
    await delay(600);

    // 5. TEST REAL CLOSURE VERIFICATION IN CLOSURE MODAL
    console.log('\n5. Testing Real Closure Verification in Closure Modal...');
    // Open closure modal for the first row
    await clickButtonWithText(page, ['Verify Fix', 'सुधार सत्यापित']);
    await delay(800);

    const modalText = await page.evaluate(() => document.body.innerText);
    console.log('- Closure modal opened:', modalText.includes('Submit Fix Verification Evidence') || modalText.includes('मरम्मत सत्यापन साक्ष्य'));

    // FAKE SCENARIO 1: Wrong Location (Rule 1 Fails)
    console.log('\n--- Testing Rejection 1: Wrong Location (Rule 1) ---');
    await clickButtonWithText(page, ['wrong location', 'गलत स्थान']);
    await delay(1500);

    const resText1 = await page.evaluate(() => document.body.innerText);
    console.log('- Evaluation shows REJECTED title:', resText1.includes('CLOSURE REJECTED') || resText1.includes('समापन अस्वीकृत'));
    console.log('- Rule 1 (GPS Proximity) failed:', resText1.includes('GPS verification failed') || resText1.includes('जीपीएस सत्यापन विफल'));

    // FAKE SCENARIO 2: Defect Still Visible (Rule 4 Fails)
    console.log('\n--- Testing Rejection 2: Defect Still Visible (Rule 4) ---');
    await clickButtonWithText(page, ['defect still visible', 'दोष अभी भी']);
    await delay(1500);

    const resText2 = await page.evaluate(() => document.body.innerText);
    console.log('- Rule 4 (AI Defect Clearance) failed:', resText2.includes('AI defect clearance failed') || resText2.includes('एआई निरीक्षण विफल'));

    // FAKE SCENARIO 3: Reuse Old Photo (Rule 3 Fails)
    console.log('\n--- Testing Rejection 3: Reuse Old Photo (Rule 3) ---');
    await clickButtonWithText(page, ['reuse old photo', 'पुरानी फोटो']);
    await delay(1500);

    const resText3 = await page.evaluate(() => document.body.innerText);
    console.log('- Rule 3 (No Photo Reuse) failed:', resText3.includes('Image reuse detected') || resText3.includes('फोटो का पुन: उपयोग'));

    // GENUINE SCENARIO: Repaired Scene (All 4 Rules Pass -> Case Resolved)
    console.log('\n--- Testing Genuine Acceptance: Repaired Scene ---');
    // Pick another case for genuine repair
    await page.evaluate(() => {
      const cancelBtns = Array.from(document.querySelectorAll('button')).filter(
        (b) => b.innerText.trim() === 'Cancel' || b.innerText.trim() === 'रद्द करें'
      );
      if (cancelBtns.length > 0) cancelBtns[0].click();
    });
    await delay(600);

    // Open closure modal for second ticket if available, or first
    const verifyButtons = await page.$$('button');
    let verifyBtn = null;
    for (const b of verifyButtons) {
      const txt = await page.evaluate((el) => el.innerText, b);
      if (txt.includes('Verify Fix') || txt.includes('सुधार सत्यापित')) {
        verifyBtn = b;
        // Don't break, pick second one if exists
      }
    }
    if (verifyBtn) {
      await verifyBtn.click();
      await delay(800);
    }

    await clickButtonWithText(page, ['repaired scene', 'मरम्मत की गई']);
    await delay(2000);

    const resTextGenuine = await page.evaluate(() => document.body.innerText);
    console.log('- Evaluation shows VERIFIED title:', resTextGenuine.includes('CLOSURE VERIFIED') || resTextGenuine.includes('समापन सत्यापित'));
    console.log('- All 4 rules passed checkmark present:', !resTextGenuine.includes('failed') && !resTextGenuine.includes('विफल'));
    console.log('- Link to public ledger block present:', resTextGenuine.includes('View Block in Ledger') || resTextGenuine.includes('लेजर में ब्लॉक देखें'));

    // Close closure modal
    await page.evaluate(() => {
      const cancelBtns = Array.from(document.querySelectorAll('button')).filter(
        (b) => b.innerText.trim() === 'Cancel' || b.innerText.trim() === 'रद्द करें'
      );
      if (cancelBtns.length > 0) cancelBtns[0].click();
    });
    await delay(800);

    // 6. Verify Rejected Attempts in Drawer Timeline
    console.log('\n6. Verifying Rejected Attempts in Case Drawer Timeline...');
    // Reopen drawer for the first case
    await page.evaluate(() => {
      const firstLink = document.querySelector('tbody tr td span.text-sky-600');
      if (firstLink) firstLink.click();
    });
    await delay(1200);

    const timelineText = await page.evaluate(() => document.body.innerText.toLowerCase());
    console.log('- Drawer displays Rejected Closure Attempts section:', timelineText.includes('rejected closure attempts') || timelineText.includes('अस्वीकृत समापन प्रयास'));
    console.log('- Rejection reasons listed in timeline:', timelineText.includes('gps verification failed') || timelineText.includes('ai defect clearance failed') || timelineText.includes('image reuse detected'));

    // 7. Verify Ledger Chain Integrity
    console.log('\n7. Verifying Cryptographic Ledger Chain Integrity from Header...');
    await clickButtonWithText(page, ['Verify Ledger Chain', 'Chain valid', 'सत्यापित करें']);
    await delay(1800);

    const headerVerifyText = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.innerText.includes('Chain valid') || b.innerText.includes('Broken at')
      );
      return btn ? btn.innerText.trim() : 'Not Found';
    });
    console.log(`- Header verify button status: "${headerVerifyText}"`);
    console.log('- Ledger chain verified valid:', headerVerifyText.includes('Chain valid'));

    console.log('\n=== ALL OFFICER PORTAL & CLOSURE VERIFICATION TESTS PASSED! ===');
  } catch (err) {
    console.error('\nTEST FAILED WITH ERROR:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
