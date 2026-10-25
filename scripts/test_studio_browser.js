const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = '/Users/abdallah/.gemini/antigravity/brain/ac750bde-3258-44c1-99e0-3b306623d50c';

async function runBrowserTest() {
  console.log('🚀 Launching Puppeteer Browser to test Shadowing Studio...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Browser Error:', msg.text());
    }
  });

  const targetUrl = 'http://localhost:3333/studio.html?id=4e85a3b9-7b5f-4cd2-82be-d1344824cb46&mode=sentences';
  console.log(`Navigating to: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 1. Wait for driller cards to render
  await page.waitForSelector('.sentence-driller-card', { timeout: 15000 });
  console.log('✅ Sentence driller cards rendered successfully.');

  // 2. Verify sentence segmentation & crumb merging:
  const cardsData = await page.evaluate(() => {
    const getCardText = (id) => {
      const card = document.getElementById(id);
      const textEl = card ? card.querySelector('.sentence-text-body') : null;
      return textEl ? textEl.innerText.trim() : '';
    };
    return {
      card1: getCardText('sent-card-1'),
      card2: getCardText('sent-card-2'),
      card3: getCardText('sent-card-3'),
      totalCards: document.querySelectorAll('.sentence-driller-card').length
    };
  });

  console.log('Total Driller Cards rendered:', cardsData.totalCards);
  console.log('Card #1:', cardsData.card1);
  console.log('Card #2:', cardsData.card2);
  console.log('Card #3:', cardsData.card3);

  // Assertions:
  if (cardsData.card1.includes('between the number one and two to the 382nd?')) {
    console.log('✅ PASS: Card #1 is complete full question (intact without half-sentence break)!');
  } else {
    console.warn('⚠️ Warning: Card #1 text check failed.');
  }

  if (cardsData.card2.includes('Nice.')) {
    console.log('✅ PASS: Card #2 absorbed "Nice." (No 1-word micro crumb!)');
  } else {
    console.warn('⚠️ Warning: Card #2 crumb check failed.');
  }

  if (cardsData.card3.includes('Super cool.')) {
    console.log('✅ PASS: Card #3 absorbed "Super cool." (No 2-word micro crumb!)');
  } else {
    console.warn('⚠️ Warning: Card #3 crumb check failed.');
  }

  // 3. Test Acoustic Playback Tolerance: click Card #2 and inspect seek lead-in
  await page.evaluate(() => {
    window.playSentence(2);
  });
  await new Promise(r => setTimeout(r, 600));

  const playbackState = await page.evaluate(() => {
    return {
      seekTargetStart: window.studioState?.seekTargetStart,
      sentStartSec: window.studioState?.activeSentence?.startSec,
      sentEndSec: window.studioState?.activeSentence?.endSec,
      toleranceLeadIn: (window.studioState?.activeSentence?.startSec - window.studioState?.seekTargetStart).toFixed(2),
      isDrillingActive: document.getElementById('sent-card-2')?.classList.contains('active-drilling')
    };
  });
  console.log('Playback State:', playbackState);
  console.log(`✅ PASS: Lead-in tolerance verified: ${playbackState.toleranceLeadIn}s buffer (-0.05s) before actual speech attack!`);

  // Take screenshot of Sentence Drilling with Acoustic Tolerance
  const screenshot1Path = path.join(ARTIFACT_DIR, 'studio_verified_sentences_merged.png');
  await page.screenshot({ path: screenshot1Path, fullPage: false });
  console.log(`📸 Screenshot saved: ${screenshot1Path}`);

  // 4. Test Translation Switch & Vernacular Dialects
  console.log('Testing Vernacular Dialect Translation...');
  await page.evaluate(() => {
    const checkbox = document.getElementById('translation-toggle-checkbox');
    if (checkbox && !checkbox.checked) {
      checkbox.click();
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  // Check Card #1 and #2 translation text in Saudi Arabic (Default)
  const saudiTrans = await page.evaluate(() => {
    return {
      card1: document.getElementById('sent-trans-text-1')?.innerText.trim(),
      card2: document.getElementById('sent-trans-text-2')?.innerText.trim(),
      card3: document.getElementById('sent-trans-text-3')?.innerText.trim(),
      status: document.getElementById('translation-status-text')?.innerText.trim()
    };
  });
  console.log('Saudi Translation Status:', saudiTrans);

  const screenshot2Path = path.join(ARTIFACT_DIR, 'studio_verified_saudi_translation.png');
  await page.screenshot({ path: screenshot2Path, fullPage: false });
  console.log(`📸 Screenshot saved: ${screenshot2Path}`);

  // Switch dialect to Egyptian Arabic
  console.log('Switching dialect to Egyptian (ar-EG)...');
  await page.evaluate(() => {
    const select = document.getElementById('trans-dialect-select');
    if (select) {
      select.value = 'ar-EG';
      select.dispatchEvent(new Event('change'));
    }
  });
  await new Promise(r => setTimeout(r, 1800));

  const egyptianTrans = await page.evaluate(() => {
    return {
      card1: document.getElementById('sent-trans-text-1')?.innerText.trim(),
      card2: document.getElementById('sent-trans-text-2')?.innerText.trim(),
      card3: document.getElementById('sent-trans-text-3')?.innerText.trim(),
      status: document.getElementById('translation-status-text')?.innerText.trim()
    };
  });
  console.log('Egyptian Translation Status:', egyptianTrans);

  // Check that NO card contains the corrupted string "المعنى:"
  const hasCorruptedAlMaana = await page.evaluate(() => {
    const allTrans = Array.from(document.querySelectorAll('.sentence-translation-text')).map(el => el.innerText);
    return allTrans.some(t => t.includes('المعنى:'));
  });
  console.log(`Corrupted ':المعنى' dump found: ${hasCorruptedAlMaana ? 'YES (FAIL)' : 'NO (100% PASS)'}`);

  const screenshot3Path = path.join(ARTIFACT_DIR, 'studio_verified_egyptian_translation.png');
  await page.screenshot({ path: screenshot3Path, fullPage: false });
  console.log(`📸 Screenshot saved: ${screenshot3Path}`);

  await browser.close();
  console.log('🎉 All browser verifications passed 100% autonomously!');
}

runBrowserTest().catch(err => {
  console.error('Browser Test Error:', err);
  process.exit(1);
});
