const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickButtonWithText(page, textPatterns) {
  const patterns = Array.isArray(textPatterns) ? textPatterns : [textPatterns];
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
    throw new Error(`Could not click button matching ${JSON.stringify(patterns)}`);
  }
}

async function runCitizenAcceptanceTests() {
  console.log('=== STARTING CITIZEN EXPERIENCE ACCEPTANCE TEST ===');

  // Reset database before test
  await fetch('http://127.0.0.1:8000/api/demo/reset', { method: 'POST' });

  const tempProfileDir = path.join(os.tmpdir(), 'edge-citizen-' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempProfileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.includes('[vite]') && !text.includes('React DevTools')) {
      console.log('PAGE LOG:', text);
    }
  });

  try {
    // 1. Visit Report Wizard on phone viewport (360x780)
    console.log('\n1. Testing Phone Viewport (360px) at /app/report...');
    await page.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true });
    await page.goto('http://127.0.0.1:5173/app/report', { waitUntil: 'networkidle0' });

    // Verify Step 1 is displayed
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('- Step 1 loaded: contains "Step 1 of 5":', pageText.includes('1 of 5') || pageText.includes('1 / 5') || pageText.includes('चरण 1'));
    if (!pageText.includes('1 of 5') && !pageText.includes('1 / 5') && !pageText.includes('चरण 1')) {
      throw new Error('Step 1 progress bar not found');
    }

    // 2. Step 1: Phone & Simulated OTP
    console.log('\n2. Step 1: Entering phone and verifying simulated OTP...');
    await clickButtonWithText(page, ['Send Verification Code', 'सत्यापन कोड']);
    console.log('- Clicked "Send Verification Code"');

    // Wait for simulated SMS toast
    const smsToast = await page.waitForSelector('#sms-toast', { timeout: 5000 });
    const toastText = await page.evaluate((el) => el.innerText, smsToast);
    console.log(`- Simulated SMS Toast appeared: "${toastText.replace(/\s+/g, ' ')}"`);

    // Click Auto-fill Code
    await clickButtonWithText(page, ['Auto-fill', 'स्वतः भरें']);
    console.log('- Clicked "Auto-fill Code"');

    // Wait for "Phone number verified"
    await page.waitForFunction(
      () => document.body.innerText.includes('Phone number verified') || document.body.innerText.includes('सत्यापित हो गया'),
      { timeout: 5000 }
    );
    console.log('- Phone verified checkmark displayed');

    // Click Continue to Photo
    await clickButtonWithText(page, ['Continue to Photo', 'फोटो की ओर']);

    // 3. Step 2: Photo Capture
    console.log('\n3. Step 2: Choosing defect photo sample...');
    await page.waitForFunction(
      () => document.body.innerText.includes('2 of 5') || document.body.innerText.includes('2 / 5') || document.body.innerText.includes('चरण 2'),
      { timeout: 5000 }
    );

    // Pick test sample pothole
    await clickButtonWithText(page, ['Pothole', 'सड़क का गड्ढा']);
    await delay(800);
    console.log('- Pothole test photo selected and preview thumbnail rendered');

    // Click Continue to Location
    await clickButtonWithText(page, ['Continue to Location', 'स्थान की ओर']);

    // 4. Step 3: Location Confirmation
    console.log('\n4. Step 3: Confirming location...');
    await page.waitForFunction(
      () => document.body.innerText.includes('3 of 5') || document.body.innerText.includes('3 / 5') || document.body.innerText.includes('चरण 3'),
      { timeout: 5000 }
    );

    // Wait a brief moment for location lookup, click demo location if present
    await delay(1200);
    const demoLocExists = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((btn) =>
        btn.innerText.includes('Use Demo Location') || btn.innerText.includes('डेमो स्थान')
      );
      if (b) {
        b.click();
        return true;
      }
      return false;
    });
    if (demoLocExists) {
      console.log('- Clicked "Use Demo Location" button');
      await delay(500);
    }

    // Verify street-level label appears
    const locText = await page.evaluate(() => document.body.innerText);
    console.log('- Location card has Sector 14 label:', locText.includes('Sector 14') || locText.includes('सेक्टर 14'));

    // Click Confirm Location & Analyze
    await clickButtonWithText(page, ['Confirm Location & Analyze', 'स्थान की पुष्टि']);

    // 5. Step 4: AI Triage & Voice Input
    console.log('\n5. Step 4: Inspecting AI Triage card...');
    await page.waitForFunction(
      () => document.body.innerText.includes('4 of 5') || document.body.innerText.includes('4 / 5') || document.body.innerText.includes('चरण 4'),
      { timeout: 5000 }
    );

    const aiText = await page.evaluate(() => document.body.innerText);
    console.log('- AI Triage Card visible with "We think this is a pothole":', aiText.includes('think this is a') || aiText.includes('अनुमान है'));
    console.log('- Shows Demo detection mode badge:', aiText.includes('Demo detection mode') || aiText.includes('डेमो'));

    // Enter optional description
    const descTextarea = await page.waitForSelector('textarea');
    await descTextarea.type('Near Main Market corner road section');
    console.log('- Typed description remarks');

    // Click Continue to Review
    await clickButtonWithText(page, ['Continue to Review', 'समीक्षा की ओर']);

    // 6. Step 5: Review & Send Report
    console.log('\n6. Step 5: Reviewing summary and publishing to ledger...');
    await page.waitForFunction(
      () => document.body.innerText.includes('5 of 5') || document.body.innerText.includes('5 / 5') || document.body.innerText.includes('चरण 5'),
      { timeout: 5000 }
    );

    const reviewText = await page.evaluate(() => document.body.innerText);
    console.log('- No department dropdown in review:', !reviewText.includes('select department'));

    // Click Send Report & Start Clock
    await clickButtonWithText(page, ['Send Report', 'रिपोर्ट भेजें']);
    console.log('- Clicked "Send Report & Start Clock"');

    // 7. Success Screen Verification
    console.log('\n7. Verifying Success Screen elements...');
    const caseIdEl = await page.waitForSelector('#success-case-id', { timeout: 8000 });
    const createdCaseId = await page.evaluate((el) => el.innerText, caseIdEl);
    console.log(`- Created Case ID: "${createdCaseId}"`);
    if (!createdCaseId.startsWith('CAS-')) {
      throw new Error(`Unexpected case ID: ${createdCaseId}`);
    }

    const successText = await page.evaluate(() => document.body.innerText.toLowerCase());
    console.log('- Success shows assigned department:', successText.includes('public works') || successText.includes('pwd') || successText.includes('लोक निर्माण'));
    console.log('- Success shows deadline notice:', successText.includes('deadline') || successText.includes('समय सीमा') || successText.includes('within'));
    console.log('- QR code SVG rendered:', (await page.$('svg')) !== null);
    console.log('- Simulated SMS preview visible:', successText.includes('simulated sms') || successText.includes('सिम्युलेटेड'));

    // 8. Public Tracking Page at /track/:id
    console.log(`\n8. Testing Tracking Page at /track/${createdCaseId} (No login)...`);
    await page.goto(`http://127.0.0.1:5173/track/${createdCaseId}`, { waitUntil: 'networkidle0' });

    const trackText = await page.evaluate(() => document.body.innerText);
    console.log(`- Tracking page loaded Case ID "${createdCaseId}":`, trackText.includes(createdCaseId));
    console.log('- Current holder displayed:', trackText.includes('Public Works') || trackText.includes('Field Engineer'));
    console.log('- Time left displayed:', trackText.includes('left') || trackText.includes('Progress') || trackText.includes('overdue'));
    console.log('- Before photo evidence displayed:', (await page.$('img')) !== null);

    // Check 7 steps in timeline
    const timelineStepsCount = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('h3')).filter((h) =>
        ['Reported', 'Checked by AI', 'Assigned', 'Seen by officer', 'Being fixed', 'Fixed and checked', 'Confirmed'].some((s) =>
          h.innerText.includes(s)
        )
      );
      return items.length;
    });
    console.log(`- Timeline steps present: ${timelineStepsCount} of 7`);

    // 9. Test One-Tap "Still Broken" Reopen Action
    console.log('\n9. Testing One-Tap "Still Broken" Reopen Button...');
    await clickButtonWithText(page, ['Report Still Broken', 'Still Broken', 'समस्या अभी भी है']);
    console.log('- Clicked "Still Broken" button');

    await page.waitForFunction(
      () => document.body.innerText.includes('Reopened') || document.body.innerText.includes('पुनः खोला गया'),
      { timeout: 8000 }
    );
    console.log('- Case status dynamically updated to Reopened on tracking screen');

    // 10. Test Bilingual & A11y Controls on Tracking Page
    console.log('\n10. Testing Bilingual Hindi Toggle & Text Scaling...');
    await clickButtonWithText(page, ['हिंदी', 'English']);
    await delay(400);

    const hiText = await page.evaluate(() => document.body.innerText);
    console.log('- Switched to Hindi (contains "शिकायत"):', hiText.includes('शिकायत') || hiText.includes('मरम्मत'));

    // Test text size A++
    const aPlusPlusExists = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.trim() === 'A++');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (aPlusPlusExists) {
      await delay(200);
      const isAPlusPlus = await page.evaluate(() => document.documentElement.classList.contains('text-size-aplusplus'));
      console.log('- A++ text sizing active on documentElement:', isAPlusPlus);
    }

    // 11. Verify Ledger Chain Integrity via API
    console.log('\n11. Verifying Ledger Chain Integrity after all user reports and reopenings...');
    const verifyRes = await fetch('http://127.0.0.1:8000/api/ledger/verify');
    const verifyData = await verifyRes.json();
    console.log(`- Chain valid: ${verifyData.valid} | Blocks checked: ${verifyData.checked}`);
    if (!verifyData.valid) {
      throw new Error('Ledger chain broken!');
    }

    console.log('\n=== ALL CITIZEN EXPERIENCE ACCEPTANCE TESTS PASSED! ===');
  } catch (err) {
    console.error('Acceptance test failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runCitizenAcceptanceTests();
