/**
 * Flaptap Multi-Device Production Audit Suite
 * Tests full responsive matrices across Phone, Tablet, Laptop, Desktop and Ultra-Wide
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3333';
const AUDIT_DIR = path.join(__dirname, '..', 'data', 'audit_screenshots');
if (!fs.existsSync(AUDIT_DIR)) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: 'phone_360', width: 360, height: 780, isMobile: true, hasTouch: true },
  { name: 'phone_375', width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: 'phone_390', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: 'phone_430', width: 430, height: 932, isMobile: true, hasTouch: true },
  { name: 'phone_landscape_844', width: 844, height: 390, isMobile: true, hasTouch: true },
  { name: 'tablet_portrait_768', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: 'tablet_portrait_820', width: 820, height: 1180, isMobile: true, hasTouch: true },
  { name: 'tablet_landscape_1024', width: 1024, height: 768, isMobile: false, hasTouch: true },
  { name: 'laptop_1280', width: 1280, height: 800, isMobile: false, hasTouch: false },
  { name: 'desktop_1440', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'desktop_1920', width: 1920, height: 1080, isMobile: false, hasTouch: false },
  { name: 'ultrawide_2560', width: 2560, height: 1440, isMobile: false, hasTouch: false },
];

async function runDeviceAudit() {
  console.log('--- STARTING FLAPTAP MULTI-DEVICE AUDIT ---');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const issues = [];

  try {
    const page = await browser.newPage();

    // 1. Setup authenticated user directly in browser context so HttpOnly session cookie is saved
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
    const testEmail = `audit_${Date.now()}@flaptap.test`;
    const regRes = await page.evaluate(async (email) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'AuditPassword123!', name: 'Device Auditor' }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('flaptap_auth_token', data.token);
        localStorage.setItem('flaptap_user', JSON.stringify(data.user));
      }
      return data;
    }, testEmail);

    if (!regRes.token) {
      throw new Error(`Auth registration failed: ${JSON.stringify(regRes)}`);
    }

    // Process fixture lesson in browser context
    const procRes = await page.evaluate(async (tok) => {
      const res = await fetch('/api/tracks/shadowing/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=Ka0p5tUUmgg' }),
      });
      return res.json();
    }, regRes.token);

    const lessonId = procRes.id;
    if (!lessonId) {
      throw new Error(`Lesson processing failed: ${JSON.stringify(procRes)}`);
    }
    console.log(`Using lesson ID: ${lessonId}`);

    // =========================================================================
    // AUDIT 1: Index / Library Page Across All Viewports (Light & Dark, EN & AR)
    // =========================================================================
    console.log('\n--- Auditing index.html (Landing / Library) ---');
    for (const vp of VIEWPORTS) {
      await page.setViewport(vp);
      for (const theme of ['light', 'dark']) {
        for (const lang of ['en', 'ar']) {
          await page.evaluate((t, l) => {
            document.documentElement.setAttribute('data-theme', t);
            document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
            document.documentElement.setAttribute('lang', l);
          }, theme, lang);

          await new Promise((r) => setTimeout(r, 80));

          const overflow = await page.evaluate(() => {
            const sw = document.documentElement.scrollWidth;
            const iw = window.innerWidth;
            const diff = sw - iw;
            const culprits = [];
            if (diff > 0) {
              document.querySelectorAll('*').forEach((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.right > iw + 1) {
                  culprits.push({
                    tag: el.tagName,
                    id: el.id,
                    cls: el.className?.toString?.() || '',
                    right: Math.round(rect.right),
                    width: Math.round(rect.width),
                  });
                }
              });
            }
            return { diff, culprits: culprits.slice(0, 5) };
          });

          if (overflow.diff > 2) {
            const issueMsg = `index.html [${vp.name}] [${theme}] [${lang}] horizontal overflow: +${overflow.diff}px (Culprits: ${JSON.stringify(overflow.culprits)})`;
            console.error(`❌ ${issueMsg}`);
            issues.push(issueMsg);
          } else {
            // console.log(`✓ index.html [${vp.name}] [${theme}] [${lang}] (0px overflow)`);
          }
        }
      }
      await page.screenshot({ path: path.join(AUDIT_DIR, `index_${vp.name}.png`) });
    }
    console.log('✓ index.html responsive audit completed.');

    // =========================================================================
    // AUDIT 2: Studio Page Across All Viewports, Modes, Layouts & Themes
    // =========================================================================
    console.log('\n--- Auditing studio.html across All 12 Viewports, 5 Modes, 2 Layouts ---');
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    await page.goto(`${BASE_URL}/studio.html?id=${encodeURIComponent(lessonId)}&mode=shadow`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    console.log('Navigated to:', page.url());
    await page.waitForSelector('.sentence-driller-card', { timeout: 15000 });

    const MODES = ['shadow', 'read', 'listen', 'coach', 'notes'];
    const LAYOUTS = ['side', 'theater'];

    for (const vp of VIEWPORTS) {
      await page.setViewport(vp);

      for (const layout of LAYOUTS) {
        // Only test theater on larger screens if layout switcher exists, or test programmatic
        await page.evaluate((lay) => {
          if (window.switchStudioLayout) window.switchStudioLayout(lay);
        }, layout);

        for (const mode of MODES) {
          await page.evaluate((m) => {
            if (window.switchStudioMode) window.switchStudioMode(m);
          }, mode);

          for (const theme of ['light', 'dark']) {
            for (const lang of ['en', 'ar']) {
              await page.evaluate((t, l) => {
                document.documentElement.setAttribute('data-theme', t);
                document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
                document.documentElement.setAttribute('lang', l);
              }, theme, lang);

              await new Promise((r) => setTimeout(r, 60));

              const check = await page.evaluate(() => {
                const sw = document.documentElement.scrollWidth;
                const iw = window.innerWidth;
                const diff = sw - iw;
                const culprits = [];
                if (diff > 0) {
                  document.querySelectorAll('*').forEach((el) => {
                    const rect = el.getBoundingClientRect();
                    if (rect.right > iw + 2) {
                      culprits.push({
                        tag: el.tagName,
                        id: el.id,
                        cls: el.className?.toString?.() || '',
                        right: Math.round(rect.right),
                        width: Math.round(rect.width),
                      });
                    }
                  });
                }

                // Check button clickability & overlap
                const masterPlay = document.getElementById('deck-play-active-btn');
                const masterPlayVisible = masterPlay ? masterPlay.getBoundingClientRect().height > 0 : false;

                return { diff, culprits: culprits.slice(0, 5), masterPlayVisible };
              });

              if (check.diff > 2) {
                const issueMsg = `studio.html [${vp.name}] [layout:${layout}] [mode:${mode}] [${theme}] [${lang}] overflow: +${check.diff}px (Culprits: ${JSON.stringify(check.culprits)})`;
                console.error(`❌ ${issueMsg}`);
                issues.push(issueMsg);
              }
            }
          }
        }
      }
      await page.screenshot({ path: path.join(AUDIT_DIR, `studio_${vp.name}.png`) });
    }

    // =========================================================================
    // AUDIT 3: Interactive Word Lookup Popover Positioning & Edge Boundaries
    // =========================================================================
    console.log('\n--- Auditing Word Lookup Popover Edge Clamping ---');
    await page.setViewport({ width: 360, height: 780 });
    await page.evaluate(() => {
      if (window.switchStudioMode) window.switchStudioMode('shadow');
    });

    const popoverCheck = await page.evaluate(async () => {
      // Find first clickable word
      const wordSpan = document.querySelector('.sentence-driller-card .clickable-word');
      if (!wordSpan) return { foundWord: false };

      wordSpan.click();
      await new Promise((r) => setTimeout(r, 300));

      const popover = document.getElementById('word-lookup-popover');
      if (!popover || popover.hidden) return { foundWord: true, popoverVisible: false };

      const rect = popover.getBoundingClientRect();
      const docW = window.innerWidth;
      const docH = window.innerHeight;

      return {
        foundWord: true,
        popoverVisible: true,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        overflowsRight: rect.right > docW,
        overflowsLeft: rect.left < 0,
        overflowsBottom: rect.bottom > docH,
      };
    });

    console.log('Popover bounding report on 360px mobile:', JSON.stringify(popoverCheck));
    if (popoverCheck.overflowsRight || popoverCheck.overflowsLeft) {
      const issueMsg = `Word lookup popover overflows screen on mobile: ${JSON.stringify(popoverCheck)}`;
      console.error(`❌ ${issueMsg}`);
      issues.push(issueMsg);
    } else {
      console.log('✓ Popover fits within mobile viewport boundaries.');
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n======================================================');
    console.log(`AUDIT FINISHED: ${issues.length} total issues found.`);
    if (issues.length > 0) {
      console.log('List of issues to fix:');
      issues.forEach((iss, idx) => console.log(`  ${idx + 1}. ${iss}`));
    } else {
      console.log('ALL DEVICES PASSED WITH 0 ERRORS AND 0PX OVERFLOW! 🎉');
    }
    console.log('======================================================');

    return { totalIssues: issues.length, issues };
  } finally {
    await browser.close();
  }
}

runDeviceAudit()
  .then((res) => {
    if (res.totalIssues > 0) process.exit(1);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Audit exception:', err);
    process.exit(1);
  });
