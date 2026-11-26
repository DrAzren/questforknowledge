// Scans every stage for places where scenery stands between the camera and Affan.
// Affan is placed every 0.6 units along the path (centre and both sides), with every door open,
// and the sight lines from the camera to his head, his waist and the ground just ahead are checked.
const fs = require('fs');
const path = require('path');
const { open } = require('./lib.cjs');
// Stages that end somewhere other than a goal arch: where the walkable path stops.
const ENDS = { 'snow-3': -33.6 };
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };

(async () => {
  const { browser, page, errors } = await open({ width: 960, height: 540 });
  await page.evaluate(() => localStorage.setItem('curious-affan-save-v1', JSON.stringify({ version: 1, unlockedWorld: 4, stagesDone: {}, stageStars: {}, coins: 0, badges: [], audio: { music: 0.5, sfx: 0.9, voice: 1, muted: true } })));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.affan.usingModel, null, { timeout: 30000 });
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8') });
  await page.evaluate(() => window.bot.freeze());
  const names = [['jungle', 3], ['desert', 3], ['school', 3], ['volcano', 3], ['snow', 3]];
  let total = 0;
  for (let w = 0; w < names.length; w++) {
    for (let st = 0; st < names[w][1]; st++) {
      const r = await page.evaluate(([w, st, ends]) => {
        const b = window.bot, g = b.g;
        g.loadStage(w, st, false);
        b.step(10);
        const stage = g.stage;
        // Open every door and gate, so the scan covers the far side of each.
        for (const r of (stage.rounds || stage.stations || [])) if (r.gate && r.gate.open) r.gate.open();
        b.step(140);
        // Where Affan could stand at (x, z): on the floor, or on top of anything low enough to hop onto.
        // Null over a pit, and null inside a wall or anything too tall to climb.
        const standAt = (x, z) => {
          const over = g.physics.colliders.filter((c) => c.enabled && c.tag !== 'wall' && c.top <= 12
            && (c.kind === 'box' ? Math.abs(x - c.x) <= c.hx && Math.abs(z - c.z) <= c.hz : Math.hypot(x - c.x, z - c.z) <= c.r));
          const floors = over.filter((c) => c.top - c.bottom >= 2.9 && c.bottom <= -2);
          if (!floors.length) return null;
          const base = Math.max(...floors.map((c) => c.top));
          if (over.some((c) => c.top > base + 1.5 && c.bottom < base + 1.3)) return null;
          return Math.max(base, ...over.filter((c) => c.top <= base + 1.5).map((c) => c.top));
        };
        const end = stage.goalZ !== undefined ? stage.goalZ + 1 : (ends[g.debugState().stage] ?? -1e9);
        const blockedAt = [];
        let places = 0;
        const spawn = stage.spawn;
        g.body.active = false;
        for (let z = spawn.z; z > spawn.z - 110; z -= 0.6) {
          for (const x of [0, -3.2, 3.2]) {
            if (z < end) continue;
            const y = standAt(x, z);
            if (y === null) continue;
            places++;
            g.body.x = x; g.body.y = y; g.body.z = z; g.body.vx = g.body.vy = g.body.vz = 0;
            g.snapCamera(g.body);
            b.step(45);
            const hits = g.viewBlocked().filter((h) => h.size >= 1.2);
            // Standing close behind a low block or a stump hides his legs, which is ordinary. The view counts as
            // blocked when his head is hidden, or when his waist and the ground ahead of him both are.
            const lines = hits.map((h) => h.line);
            if (lines.includes('head') || (lines.includes('waist') && lines.includes('ahead'))) blockedAt.push({ x, z: +z.toFixed(1), lines: hits.map((h) => h.line).join('+'), what: hits[0].what, at: hits[0].at.map((v) => +v.toFixed(1)) });
          }
        }
        return { id: g.debugState().stage, places, blocked: blockedAt.length, sample: blockedAt.slice(0, 4), all: blockedAt, zs: [...new Set(blockedAt.map((p) => Math.round(p.z)))].slice(0, 30) };
      }, [w, st, ENDS]);
      total += r.blocked;
      if (process.env.VIEW_DETAIL && r.blocked) console.log(r.all.map((p) => `    x=${p.x} z=${p.z} ${p.lines} ${p.what} at ${p.at.join(',')}`).join('\n'));
      check(`${r.id}: clear view of Affan at all ${r.places} places along the path`, r.blocked === 0, r.blocked ? `${r.blocked} blocked, around z=${r.zs.join(',')} e.g. ${JSON.stringify(r.sample[0])}` : '');
    }
  }
  check('no console or page errors during the scan', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
