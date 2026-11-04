/**
 * One-off timing refresh for existing shadowing sessions.
 *
 * The current extractor uses YouTube's per-word caption offsets (JSON3). Older
 * sessions were stored with interpolated word times, so their drill boundaries
 * can include the tail of the previous word or the onset of the next word.
 *
 * Run with the server up:
 *   npm run migrate:timings
 *
 * The endpoint rebuilds each session in place (same id, same notes, same drill
 * count) and clears translation caches because the sentence text/timing changed.
 */
const BASE_URL = process.env.FLAPTAP_URL || 'http://localhost:3333';

async function main() {
  const response = await fetch(`${BASE_URL}/api/history`);
  if (!response.ok) throw new Error(`History API returned ${response.status}`);
  const items = await response.json();

  const targets = items.filter((item) =>
    item.track === 'shadowing' &&
    item.videoId &&
    item.sourceUrl &&
    item.timingVersion !== 2,
  );

  if (targets.length === 0) {
    console.log('✅ Every shadowing session already uses word-accurate timing.');
    return;
  }

  console.log(`Refreshing ${targets.length} shadowing session(s)...`);
  const failed = [];

  for (const item of targets) {
    process.stdout.write(`→ ${item.title} ... `);
    try {
      const res = await fetch(`${BASE_URL}/api/tracks/shadowing/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.sourceUrl, force: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      console.log(`ok (${body.sentences?.length || 0} sentences, 3-decimal timings)`);
    } catch (error) {
      console.log(`failed: ${error.message}`);
      failed.push(item);
    }
  }

  if (failed.length > 0) {
    console.error(`\n❌ ${failed.length} session(s) could not be refreshed.`);
    console.error('   If YouTube is rate-limiting this IP, wait a few minutes and run again.');
    process.exitCode = 1;
  } else {
    console.log('\n🎉 Timing refresh complete.');
  }
}

main().catch((error) => {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
});
