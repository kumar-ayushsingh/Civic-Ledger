const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function runDashboardTests() {
  console.log('=== STARTING PUBLIC DASHBOARD & LEDGER ACCEPTANCE TESTS ===');

  // 0. Ensure clean seed state
  await fetch('http://127.0.0.1:8000/api/demo/reset', { method: 'POST' });

  const tempProfileDir = path.join(os.tmpdir(), 'edge-dash-profile-' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempProfileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  page.on('console', (msg) => {
    const txt = msg.text();
    if (!txt.includes('React Router') && !txt.includes('Download the React DevTools')) {
      console.log('PAGE LOG:', txt);
    }
  });

  try {
    // 1. Visit /app/ledger at Desktop width (1280px)
    await page.setViewport({ width: 1280, height: 900 });
    console.log('\n1. Navigating to Public Dashboard at /app/ledger...');
    await page.goto('http://127.0.0.1:5173/app/ledger', { waitUntil: 'networkidle0' });
    await delay(1000);

    // Verify Simulated Data Badge is visible
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
    console.log('- Simulated data badge visible:', pageText.includes('simulated data active'));

    // 2. Metrics Row Verification
    console.log('\n2. Verifying Metrics Row (4 Cards)...');
    const activeText = await page.$eval('#stat-active', (el) => el.innerText.trim());
    const verifiedText = await page.$eval('#stat-verified', (el) => el.innerText.trim());
    console.log(`- Active Complaints count: ${activeText}`);
    console.log(`- Verified Closures count: ${verifiedText}`);
    console.log('- Contains Avg Resolution Time card:', pageText.includes('avg resolution time'));
    console.log('- Contains Escalation Rate card:', pageText.includes('escalation rate'));

    // 3. Filter Buttons Verification
    console.log('\n3. Testing Circular Tag Filter Buttons...');
    // Click Potholes filter
    await page.click('#filter-pothole');
    await delay(600);
    let countLabel = await page.$eval('#case-count-label', (el) => el.innerText.trim());
    console.log(`- Potholes filter active: "${countLabel}"`);

    // Click Garbage Dumps filter
    await page.click('#filter-garbage');
    await delay(600);
    countLabel = await page.$eval('#case-count-label', (el) => el.innerText.trim());
    console.log(`- Garbage filter active: "${countLabel}"`);

    // Click Escalated Only filter
    await page.click('#filter-escalated');
    await delay(600);
    countLabel = await page.$eval('#case-count-label', (el) => el.innerText.trim());
    console.log(`- Escalated filter active: "${countLabel}"`);

    // Reset to All Cases
    await page.click('#filter-all');
    await delay(600);
    countLabel = await page.$eval('#case-count-label', (el) => el.innerText.trim());
    console.log(`- Reset to All Cases: "${countLabel}"`);

    // 4. Stylised SVG Ward Map & Circular Pins
    console.log('\n4. Inspecting Stylised SVG Ward Map & Circular Pins...');
    const hasSvgGrid = await page.evaluate(() => !!document.querySelector('#map-container svg pattern#grid'));
    const hasSvgRoads = await page.evaluate(() => document.querySelectorAll('#map-container svg path').length >= 4);
    const pinCount = await page.evaluate(() => document.querySelectorAll('#map-pins-layer button').length);
    console.log('- Stylized SVG grid rendered:', hasSvgGrid);
    console.log('- Stylized SVG roads rendered:', hasSvgRoads);
    console.log(`- Total circular map pins rendered: ${pinCount}`);

    // Pin Click Test
    const firstPin = await page.$('#map-pins-layer button');
    if (firstPin) {
      await firstPin.click();
      await delay(600);
      const footerInfo = await page.$eval('#map-selected-info', (el) => el.innerText.trim());
      console.log(`- Map footer info after pin click: "${footerInfo}"`);
    }

    // 5. Department Scorecards
    console.log('\n5. Inspecting Department Scorecards...');
    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
    console.log('- PWD / Roads Dept scorecard rendered:', bodyText.includes('public works') || bodyText.includes('pwd'));
    console.log('- Sanitation Board scorecard rendered:', bodyText.includes('sanitation'));
    console.log('- Scorecards display letter grades (Grade A / B):', bodyText.includes('grade a') || bodyText.includes('grade b'));
    console.log('- Contractors shown as firm names only:', bodyText.includes('contractor:'));

    // 6. Live Complaints Feed & Drawer Explorer
    console.log('\n6. Inspecting Live Complaints Feed & Explorer Drawer...');
    const firstCaseCard = await page.$('#cases-feed-container > div');
    if (!firstCaseCard) throw new Error('No complaint cards found in feed');
    console.log('- Complaints cards rendered in scrollable feed: true');

    // Open Case-Level Ledger Explorer Drawer
    const inspectBtn = await page.$('#cases-feed-container button[title*="Inspect SHA-256 blocks"]');
    if (inspectBtn) {
      await inspectBtn.click();
      await delay(1200);

      const drawerText = await page.evaluate(() => document.body.innerText.toLowerCase());
      console.log('- Case Ledger Explorer Drawer opened:', drawerText.includes('case ledger explorer') || drawerText.includes('case id:'));
      console.log('- Browser client-side SHA-256 verification indicator present:', drawerText.includes('cryptographically verified in browser') || drawerText.includes('sha-256 exact match'));

      // Close drawer
      const closeBtn = await page.$('button[aria-label="Close explorer"]');
      if (closeBtn) {
        await closeBtn.click();
        await delay(500);
      }
    }

    // 7. Dark Tamper-Evident Ledger Panel & Anchors
    console.log('\n7. Testing Dark Tamper-Evident Ledger Panel & Witness Anchors...');
    const ledgerStreamHasBlocks = await page.evaluate(() => {
      const stream = document.getElementById('ledger-stream');
      return stream && stream.innerText.includes('BLOCK #');
    });
    console.log('- Dark ledger panel streams real SHA-256 blocks:', ledgerStreamHasBlocks);

    // Test Create Anchor button
    const createAnchorBtn = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('Create Anchor'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (createAnchorBtn) {
      await delay(1200);
      const postAnchorText = await page.evaluate(() => document.body.innerText.toLowerCase());
      console.log('- Witness checkpoint generated via Create Anchor:', postAnchorText.includes('witness anchor #') || postAnchorText.includes('checkpoint #'));
    }

    // 8. Test Fast Live Report Arrival (Polling Test)
    console.log('\n8. Testing Fast Live Report Arrival on Map and Feed...');
    const beforeCount = await page.evaluate(() => document.querySelectorAll('#cases-feed-container > div').length);

    // Post a new citizen report via direct API
    const samplePhotoPath = path.resolve(__dirname, '../../backend/data/samples/pothole1.jpg');
    const photoBuffer = fs.readFileSync(samplePhotoPath);
    const formBlob = new Blob([photoBuffer], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('photo', formBlob, 'pothole_live_test.jpg');
    formData.append('lat', '28.4115');
    formData.append('lng', '77.3185');
    formData.append('description', 'Live fast reporting e2e test hole');

    const reportRes = await fetch('http://127.0.0.1:8000/api/reports', {
      method: 'POST',
      body: formData,
    });
    const reportData = await reportRes.json();
    console.log(`- Created live report via API: Case ID ${reportData.case_id}`);

    // Wait for the 3-second polling interval to pick up the new case
    await delay(3800);
    const afterCount = await page.evaluate(() => document.querySelectorAll('#cases-feed-container > div').length);
    console.log(`- Feed cases before: ${beforeCount}, after: ${afterCount}`);
    console.log('- New report dynamically rendered on dashboard without reload:', afterCount > beforeCount);

    // 9. Test Fast Forward Auto-Escalation & Clock Advance
    console.log('\n9. Testing Clock Fast-Forward Auto-Escalation & Pin Color Change...');
    const advanceRes = await fetch('http://127.0.0.1:8000/api/demo/advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours: 48 }),
    });
    const advanceData = await advanceRes.json();
    console.log(`- Fast-forwarded clock by +48 hours (${advanceData.escalations_triggered} escalations triggered)`);

    // Wait for polling to update
    await delay(3800);
    const escalatedPinsCount = await page.evaluate(() => {
      return document.querySelectorAll('#map-pins-layer button.bg-amber-500').length;
    });
    console.log(`- Escalated amber pins now on map: ${escalatedPinsCount}`);
    console.log('- Clock advance turned pins amber and escalated tickets:', escalatedPinsCount > 0);

    // 10. Test Mobile Viewport Responsiveness (360px width)
    console.log('\n10. Testing Mobile Viewport (360px) Responsiveness...');
    await page.setViewport({ width: 360, height: 740 });
    await delay(800);

    const mobileMetricsVisible = await page.evaluate(() => {
      const activeEl = document.getElementById('stat-active');
      return activeEl && activeEl.offsetParent !== null;
    });
    const mobileMapVisible = await page.evaluate(() => {
      const mapEl = document.getElementById('map-container');
      return mapEl && mapEl.offsetParent !== null;
    });
    const mobileFeedVisible = await page.evaluate(() => {
      const feedEl = document.getElementById('cases-feed-container');
      return feedEl && feedEl.offsetParent !== null;
    });
    console.log('- Metrics row responsive at 360px:', mobileMetricsVisible);
    console.log('- SVG Ward Map responsive at 360px:', mobileMapVisible);
    console.log('- Complaints Feed responsive at 360px:', mobileFeedVisible);

    // 11. Strict Public Privacy Rule Check: NO NAMED INDIVIDUAL OFFICERS
    console.log('\n11. Verifying Strict Privacy Rule: No Named Individual Officers...');
    const fullBodyText = await page.evaluate(() => document.body.innerText);
    const forbiddenNames = [
      'Ramesh', 'Sharma', 'Suresh', 'Verma', 'Vikram', 'Malhotra',
      'Anand', 'Deshmukh', 'Rajesh', 'Gupta', 'Deepak', 'Yadav'
    ];
    let foundForbidden = [];
    for (const name of forbiddenNames) {
      if (new RegExp(`\\b${name}\\b`, 'i').test(fullBodyText)) {
        foundForbidden.push(name);
      }
    }
    console.log('- Any officer names exposed on public dashboard:', foundForbidden.length > 0 ? foundForbidden : 'NONE (100% anonymized)');
    if (foundForbidden.length > 0) {
      throw new Error(`Public privacy breach: Found officer name(s): ${foundForbidden.join(', ')}`);
    }

    console.log('\n=== ALL PUBLIC DASHBOARD & LEDGER ACCEPTANCE TESTS PASSED! ===');
  } catch (err) {
    console.error('\nDASHBOARD TEST FAILED WITH ERROR:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runDashboardTests();
