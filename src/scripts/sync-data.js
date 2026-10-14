import { fetchTeam } from '../scrapers/teamScraper.js';
import { fetchYSWS } from '../scrapers/yswsScraper.js';

async function runSync() {
  console.log('[Sync] Starting full synchronization...');
  const [team, ysws] = await Promise.all([
    fetchTeam(),
    fetchYSWS()
  ]);

  console.log(`[Sync] Complete!`);
  console.log(`- Team members indexed: ${team.length}`);
  console.log(`- Total YSWS programs: ${ysws.length}`);
  console.log(`- Active YSWS: ${ysws.filter(p => p.isActive).length}`);
  console.log(`- New limited-time YSWS: ${ysws.filter(p => p.isNew).length}`);
}

runSync().catch(err => {
  console.error('[Sync] Error:', err);
  process.exit(1);
});
