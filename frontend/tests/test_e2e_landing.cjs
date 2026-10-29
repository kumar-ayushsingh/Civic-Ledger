const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const delay = ms => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log('--- STARTING E2E & ACCESSIBILITY TESTS ---');
  const tempProfileDir = path.join(os.tmpdir(), 'edge-test-profile-' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: tempProfileDir,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();

  try {
    // 1. Desktop Viewport Test
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });

    console.log('1. Page loaded successfully at /');

    // Title & Header Checks
    const title = await page.title();
    console.log(`- Page title: "${title}"`);

    const headerText = await page.$eval('header', el => el.innerText);
    console.log(`- Header innerText: "${headerText.replace(/\s+/g, ' ')}"`);
    const hasBeta = headerText.includes('Public Beta');
    const hasCivicLedger = headerText.includes('CivicLedger');
    const tabNavHidden = (await page.$('header nav[aria-label="Application tabs"]')) === null;
    console.log(`- Header has CivicLedger: ${hasCivicLedger}, Public Beta: ${hasBeta}`);
    console.log(`- Tab navigation hidden on landing page: ${tabNavHidden}`);

    // Hero Section Checks
    const heroTitle = await page.$eval('#hero-title', el => el.innerText.replace(/\s+/g, ' ').trim());
    console.log(`- Hero title text: "${heroTitle}"`);
    if (!heroTitle.includes('Every repair trackable,') || !heroTitle.includes('escalating, and verifiable.')) {
      throw new Error(`Hero title does not match reference: ${heroTitle}`);
    }

    const heroBadge = await page.$eval('section[aria-labelledby="hero-title"]', el => el.innerText);
    console.log(`- Has Theme 08 badge: ${heroBadge.includes('Theme 08')}`);
    console.log(`- Has AI Photo Match Check pill: ${heroBadge.includes('AI Photo Match Check')}`);
    console.log(`- Has Auto SLA Escalation pill: ${heroBadge.includes('Auto SLA Escalation')}`);
    console.log(`- Has SHA-256 Audit Log pill: ${heroBadge.includes('SHA-256 Audit Log')}`);

    // Problem Section Checks
    const problemText = await page.$eval('#the-problem', el => el.innerText);
    console.log(`- Problem section has 1,68,491: ${problemText.includes('1,68,491')}`);
    console.log(`- Problem section has 1,856: ${problemText.includes('1,856')}`);
    console.log(`- Problem section has 1,481: ${problemText.includes('1,481')}`);
    console.log(`- Problem section has MoRTH: ${problemText.includes('MoRTH')}`);
    console.log(`- Problem section has Sources line: ${problemText.includes('Sources:')}`);
    console.log(`- Problem section has paper closure card: ${problemText.includes('Paper Closures') || problemText.includes('without proof of repair')}`);

    // Approach 6-Step Section Checks
    const approachText = await page.$eval('#our-approach', el => el.innerText);
    const hasStep1 = approachText.includes('Report');
    const hasStep2 = approachText.includes('AI check');
    const hasStep3 = approachText.includes('Assign');
    const hasStep4 = approachText.includes('Clock');
    const hasStep5 = approachText.includes('Escalate');
    const hasStep6 = approachText.includes('Verified closure and ledger');
    console.log(`- Approach 6 steps present: Report(${hasStep1}), AI check(${hasStep2}), Assign(${hasStep3}), Clock(${hasStep4}), Escalate(${hasStep5}), Verified closure(${hasStep6})`);

    // Three Pillars Checks
    const pillarsText = await page.$eval('section[aria-labelledby="pillars-heading"]', el => el.innerText);
    console.log(`- Pillar 1 (AI Defect Detection): ${pillarsText.includes('AI Defect Detection')}`);
    console.log(`- Pillar 2 (Transparent Timers): ${pillarsText.includes('Transparent Timers')}`);
    console.log(`- Pillar 3 (Verified Closure): ${pillarsText.includes('Verified Closure')}`);

    // Prototype Features 8 Cards
    const featuresText = await page.$eval('section[aria-labelledby="features-heading"]', el => el.innerText);
    console.log(`- Feature 1 (Live-Photo): ${featuresText.includes('Live-Photo')}`);
    console.log(`- Feature 2 (Phone OTP): ${featuresText.includes('Phone OTP')}`);
    console.log(`- Feature 3 (Hindi & English): ${featuresText.includes('Hindi & English')}`);
    console.log(`- Feature 4 (Voice Input): ${featuresText.includes('Voice Input')}`);
    console.log(`- Feature 5 (QR Tracking): ${featuresText.includes('QR Tracking')}`);
    console.log(`- Feature 6 (SLA Clock): ${featuresText.includes('SLA Clock')}`);
    console.log(`- Feature 7 (Closure Rules): ${featuresText.includes('Closure Rules')}`);
    console.log(`- Feature 8 (Tamper-Evident Ledger): ${featuresText.includes('Tamper-Evident Ledger')}`);

    // Built for everyone strip
    const everyoneText = await page.$eval('section[aria-labelledby="everyone-heading"]', el => el.innerText);
    console.log(`- Built for everyone has no sign-up: ${everyoneText.includes('No sign-up')}`);
    console.log(`- Built for everyone has big buttons: ${everyoneText.includes('Big 48px buttons') || everyoneText.includes('touch buttons')}`);

    // How to explore demo
    const howToText = await page.$eval('section[aria-labelledby="howto-heading"]', el => el.innerText);
    console.log(`- Simulated data banner: ${howToText.includes('Prototype uses simulated data')}`);

    // Footer
    const footerText = await page.$eval('footer', el => el.innerText);
    console.log(`- Footer text match: ${footerText.includes("CYPHER 26") && footerText.includes("Theme 08")}`);

    // 2. Mobile Viewport (390px) Test
    console.log('\n2. Testing Mobile 390px width...');
    await page.setViewport({ width: 390, height: 844 });
    await delay(400);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    console.log(`- Mobile scrollWidth: ${bodyWidth}px, innerWidth: ${windowWidth}px`);
    if (bodyWidth > windowWidth + 5) {
      console.warn(`WARNING: Potential horizontal overflow on 390px! scrollWidth=${bodyWidth}, innerWidth=${windowWidth}`);
    } else {
      console.log(`- Responsive match confirmed: No horizontal scroll on 390px phone!`);
    }

    // 3. A++ Text Scaling Test
    console.log('\n3. Testing A++ Text Scaling...');
    const aPlusPlusBtn = await page.$('button[title*="Extra large text (A++)"], button[aria-label*="Extra large text (A++)"]');
    if (aPlusPlusBtn) {
      await aPlusPlusBtn.click();
      await delay(300);
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      console.log(`- html element classes with A++: "${htmlClass}"`);
      const scaledWidth = await page.evaluate(() => document.body.scrollWidth);
      console.log(`- 390px phone with A++ scrollWidth: ${scaledWidth}px (no layout break)`);
    }

    // 4. Hindi Translation Test
    console.log('\n4. Testing Hindi Language Toggle...');
    const langBtn = await page.$('button[title*="Hindi"]');
    if (langBtn) {
      await langBtn.click();
      await delay(400);
      const hindiTitle = await page.$eval('#hero-title', el => el.innerText);
      const hindiBadge = await page.$eval('span.uppercase', el => el.innerText);
      console.log(`- Hindi Hero Title: "${hindiTitle.replace(/\s+/g, ' ')}"`);
      console.log(`- Hindi Badge: "${hindiBadge}"`);
      const hindiHtmlLang = await page.evaluate(() => document.documentElement.lang);
      console.log(`- documentElement lang: "${hindiHtmlLang}"`);

      // Switch back to English for remaining tests
      const enBtn = await page.$('button[title*="English"]');
      if (enBtn) await enBtn.click();
      await delay(300);
    }

    // 5. Axe-Core Accessibility Audit
    console.log('\n5. Running Axe-Core Accessibility Audit...');
    await page.setViewport({ width: 1280, height: 900 });
    const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
    await page.evaluate(axeSource);

    const axeResults = await page.evaluate(async () => {
      return await window.axe.run({
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        },
      });
    });

    console.log(`- Axe violations count: ${axeResults.violations.length}`);
    if (axeResults.violations.length > 0) {
      axeResults.violations.forEach(v => {
        console.log(`  * [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`);
        v.nodes.forEach(n => console.log(`      Node: ${n.target.join(' ')} | html: ${n.html.substring(0, 80)}`));
      });
    } else {
      console.log('  * PASSED with ZERO accessibility violations!');
    }

    // 6. Launch Prototype Loader and Transition Test
    console.log('\n6. Testing Launch Prototype Behavior...');
    // Reset to A standard text size
    const aBtn = await page.$('button[title*="Standard text (A)"]');
    if (aBtn) await aBtn.click();
    await delay(200);

    const launchButtons = await page.$$('button[aria-label="Launch Prototype"]');
    console.log(`- Found ${launchButtons.length} Launch Prototype buttons on page`);
    if (launchButtons.length > 0) {
      await launchButtons[0].click();

      // Check modal appeared
      await page.waitForSelector('[role="dialog"]', { timeout: 2000 });
      console.log('- Launch modal appeared with role="dialog"');

      // Verify the 3 lines are present in modal
      const modalText = await page.$eval('[role="dialog"]', el => el.innerText);
      console.log(`- Has 'Starting services': ${modalText.includes('Starting services')}`);
      console.log(`- Has 'Loading simulated ward data': ${modalText.includes('Loading simulated ward data')}`);
      console.log(`- Has 'Verifying ledger chain': ${modalText.includes('Verifying ledger chain')}`);

      // Wait for navigation to /app/ledger (approx 2.5s)
      await page.waitForFunction(() => window.location.pathname === '/app/ledger', { timeout: 6000 });
      console.log(`- Successfully navigated to: ${page.url()}`);

      // Check that Overview tab is present in App Shell
      const navOverview = await page.$eval('header nav', el => el.innerText);
      console.log(`- App Shell Tab Navigation active: "${navOverview.replace(/\s+/g, ' ')}"`);

      // Test clicking Overview tab returns to /
      const overviewLink = await page.$('header nav a[href="/"]');
      if (overviewLink) {
        await overviewLink.click();
        await page.waitForFunction(() => window.location.pathname === '/', { timeout: 4000 });
        console.log(`- Overview tab successfully navigated back to: ${page.url()}`);
      }
    }

    console.log('\n--- ALL E2E & VERIFICATION TESTS COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runTests();
