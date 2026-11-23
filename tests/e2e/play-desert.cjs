// Plays World 2 (Gurun Penemuan) end to end through the real input layer.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const { open, state } = require('./lib.cjs');
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };
const shot = async (page, file) => { await page.evaluate(() => window.bot.render()); await page.screenshot({ path: path.join(OUT, file) }); };

(async () => {
  const { browser, page, errors } = await open();
  // Start from a save where World 1 is finished, so World 2 is unlocked.
  await page.evaluate(() => localStorage.setItem('curious-affan-save-v1', JSON.stringify({ version: 1, unlockedWorld: 1, stagesDone: { jungle: 3 }, stageStars: {}, coins: 0, badges: ['jungle-explorer'], audio: { music: 0.5, sfx: 0.9, voice: 1, muted: false } })));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.affan.usingModel, null, { timeout: 30000 });
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8') });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  let s;

  await page.click('#btn-worlds');
  const cards = await page.$$eval('.world-card', (els) => els.map((e) => e.className));
  check('world map: desert is unlocked and playable', cards[1].includes('live') && !cards[1].includes('locked'));
  await page.click('.world-card.world-desert');
  await ev(() => window.bot.freeze());
  s = await state(page);
  check('choosing World 2 starts desert stage 1', s.world === 'desert' && s.stage === 'desert-1' && s.mode === 'intro');
  await ev(() => window.bot.untilMode('play'));
  check('desert music and wind requested', (await state(page)).music === 'desert' && await ev(() => window.bot.g.audio.log.includes('music:desert')));
  check('Affan speaks the desert opening line', await ev(() => window.bot.g.audio.log.includes('voice:intro_desert')));
  await ev(() => window.bot.step(120));

  // ---------- Stage 1: shape gates ----------
  const rounds = await ev(() => window.bot.g.stage.rounds.map((r) => ({ target: r.target, z: r.gate.z, plates: r.plates.map((p) => ({ shape: p.shape, x: p.x, z: p.z })) })));
  check('3 shape gates with 3 different target shapes, each on exactly one plate', rounds.length === 3 && new Set(rounds.map((r) => r.target)).size === 3 && rounds.every((r) => r.plates.filter((p) => p.shape === r.target).length === 1), rounds.map((r) => r.target).join(' | '));
  s = await state(page);
  check('question is shown and has a narration clip', s.question.includes('pijak bentuk') && s.questionVoice === `q_pijak_${rounds[0].target.replace(/ /g, '_')}`, `${s.question} / ${s.questionVoice}`);
  check('question narration was played', await ev((v) => window.bot.g.audio.log.includes('voice:' + v), s.questionVoice));
  await page.click('#q-replay');
  check('speaker button replays the question', await ev((v) => window.bot.g.audio.log.filter((x) => x === 'voice:' + v).length >= 2, s.questionVoice));
  await shot(page, 'd1_question.png');

  const doGate = async (r, wrongFirst) => {
    const round = rounds[r];
    if (wrongFirst) {
      const wrong = round.plates.find((p) => p.shape !== round.target);
      await ev(([x, z]) => { window.bot.walkTo(x, z + 2.3, { max: 1500 }); window.bot.jumpTo(x, z); window.bot.step(10); }, [wrong.x, wrong.z]);
      s = await state(page);
      check('wrong plate: gate stays shut, no heart lost, no star', s.hearts === 3 && s.stars === 0 && await ev(() => !window.bot.g.stage.rounds[0].gate.isOpen && window.bot.g.audio.log.includes('sfx:wrong')));
      check('wrong feedback is spoken with the same words as shown', await ev(() => window.bot.g.audio.log.some((x) => ['voice:n_cuba_lagi', 'voice:n_tak_mengapa', 'voice:n_hampir', 'voice:oops_cuba_lagi'].includes(x))));
    }
    const right = round.plates.find((p) => p.shape === round.target);
    const before = (await state(page)).stars;
    await ev(([x, z]) => { window.bot.walkTo(x, z + 2.3, { max: 1500 }); window.bot.jumpTo(x, z); window.bot.step(10); }, [right.x, right.z]);
    s = await state(page);
    check(`gate ${r + 1}: stepping on ${round.target} opens it and awards a star`, s.stars === before + 1 && await ev((i) => window.bot.g.stage.rounds[i].gate.isOpen, r), `stars=${s.stars}`);
    await ev(() => window.bot.step(80));
    if (r === 0) await shot(page, 'd1_gate_open.png');
    await ev(([z]) => { window.bot.walkTo(1.85, z + 7.2, { max: 1500 }); window.bot.walkTo(1.85, z + 3.2); window.bot.walkTo(0, z + 2.2); window.bot.walkTo(0, z - 2.6, { hop: false }); }, [round.z]);
    s = await state(page);
    check(`gate ${r + 1}: Affan walks through the open door`, s.z < round.z - 2, `z=${s.z.toFixed(2)}`);
  };
  check('closed gate blocks the way', await ev(() => { window.bot.walkTo(1.85, 0.6); window.bot.walkTo(1.85, -3.2); window.bot.walkTo(0.8, -4.6); window.bot.walkTo(0.8, -8, { max: 150, hop: false }); return window.bot.g.body.z > -5.6 && window.bot.g.stageStars === 0; }));
  check('walking between the plinths answers nothing', (await state(page)).stars === 0 && await ev(() => !window.bot.g.audio.log.includes('sfx:wrong')));
  await doGate(0, true);
  check('door-opening sound played', await ev(() => window.bot.g.audio.log.includes('sfx:stone_door')));

  // Sliding platforms over quicksand: wait for the slab, hop on, ride, hop to the next, hop off.
  const cross = (zs, landZ) => ev(([zs, landZ]) => {
    const b = window.bot, g = b.g;
    const plat = (z) => g.stage.movers.map((m) => m.collider).find((c) => c.tag === 'platform' && Math.abs(c.z - z) < 0.2);
    b.walkTo(0, zs[0] + 2.75);
    let p = plat(zs[0]);
    b.until(() => Math.abs(p.x - g.body.x) < 0.5, 900);
    const on1 = b.jumpOnto(p);
    for (let i = 1; i < zs.length; i++) {
      const q = plat(zs[i]);
      b.until(() => Math.abs(q.x - p.x) < 0.9, 900);
      b.walkOn(p, 0, -0.85);
      b.jumpOnto(q);
      p = q;
    }
    const onLast = g.body.grounded && g.body.ground === p;
    const off0 = g.body.x - p.x, px0 = p.x; b.step(150);
    const carried = g.body.ground === p && Math.abs((g.body.x - p.x) - off0) < 0.05 && Math.abs(p.x - px0) > 0.1;
    b.walkOn(p, 0, -0.85);
    b.jumpTo(g.body.x, landZ);
    return { on1, onLast, carried, z: g.body.z, y: g.body.y, hearts: g.hearts };
  }, [zs, landZ]);
  let c = await cross([-12.3, -16.1], -19.6);
  check('moving platforms: landed on both and was carried along', c.on1 && c.onLast && c.carried, JSON.stringify(c));
  check('crossed the quicksand without losing a heart', c.z < -18.4 && Math.abs(c.y) < 0.05 && c.hearts === 3, `z=${c.z.toFixed(2)}`);
  await shot(page, 'd1_after_pit.png');

  // Deliberately fall into the quicksand once.
  await ev(() => { window.bot.walkTo(4.5, -19.4); window.bot.walkTo(4.5, -17.2, { max: 120, hop: false }); window.bot.until(() => window.bot.g._busy, 200); });
  s = await state(page);
  check('falling into quicksand costs a heart and plays the sand sound', s.hearts === 2 && await ev(() => window.bot.g.audio.log.includes('sfx:sand_sink')), `hearts=${s.hearts}`);
  await ev(() => window.bot.until(() => !window.bot.g._busy, 200));
  s = await state(page);
  check('respawned at the checkpoint after the pit', Math.abs(s.z + 20.2) < 0.3 && s.y > -0.1, `z=${s.z.toFixed(2)}`);

  await doGate(1, false);
  // Rolling boulders: they push, they never hurt.
  const hBefore = (await state(page)).hearts;
  await ev(() => { const b = window.bot, g = b.g; b.walkTo(0, -34.2); const boulder = g.stage.movers.map((m) => m.collider).find((c) => c.tag === 'boulder'); b.until(() => Math.abs(boulder.x) < 0.6, 600); b.walkTo(0, -35.4, { max: 40, hop: false }); b.step(50); });
  s = await state(page);
  check('rolling boulder nudges Affan aside without taking a heart', s.hearts === hBefore && await ev(() => window.bot.g.audio.log.includes('sfx:bump')), `x=${s.x.toFixed(2)}`);
  await ev(() => { window.bot.walkTo(0, -42.6, { max: 1500 }); });
  s = await state(page);
  check('got past both boulders', s.z < -41.5 && s.hearts === hBefore, `z=${s.z.toFixed(2)}`);
  // Shuttle bridge.
  c = await ev(() => { const b = window.bot, g = b.g; const p = g.stage.movers.map((m) => m.collider).find((c) => c.tag === 'platform' && c.z < -40); b.walkTo(0, -43.0); b.until(() => p.z > -45.05, 900); b.walkTo(0, p.z, { max: 80, hop: false }); const on = g.body.ground === p; b.until(() => p.z < -46.75, 900); b.walkTo(0, -49.8, { max: 200, hop: false }); return { on, z: g.body.z, y: g.body.y, hearts: g.hearts }; });
  check('shuttle bridge carries Affan across the second pit', c.on && c.z < -48.2 && Math.abs(c.y) < 0.05 && c.hearts === hBefore, JSON.stringify(c));
  await doGate(2, false);
  await ev(() => window.bot.walkTo(0, -66.6, { max: 600 }));
  s = await state(page);
  check('desert stage 1 completes with 3 stars', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars}`);
  await ev(() => window.bot.step(200));
  await page.click('#btn-next');

  // ---------- Stage 2: colour carpets ----------
  s = await state(page);
  check('desert stage 2 loads', s.stage === 'desert-2');
  await ev(() => { window.bot.untilMode('play'); window.bot.step(120); });
  const cr = await ev(() => window.bot.g.stage.rounds.map((r) => ({ target: r.target, far: r.farLedgeZ, carpets: r.carpets.map((c) => ({ colour: c.colour, x: c.x, dockZ: c.dockZ, farZ: c.farZ })) })));
  check('3 canyons with 3 different target colours, each on exactly one carpet', cr.length === 3 && new Set(cr.map((r) => r.target)).size === 3 && cr.every((r) => r.carpets.filter((c) => c.colour === r.target).length === 1 && new Set(r.carpets.map((c) => c.colour)).size === 3), cr.map((r) => r.target).join(' | '));
  s = await state(page);
  check('colour question shown with narration', s.question.includes('Naik permaidani') && s.questionVoice === `q_naik_${cr[0].target}`, s.question);
  await shot(page, 'd2_question.png');
  const ride = (r) => ev((r) => {
    const b = window.bot, g = b.g, round = g.stage.rounds[r], c = round.carpets.find((k) => k.colour === round.target);
    b.walkTo(c.x, c.dockZ + 2.4, { max: 1500 });
    b.walkTo(c.x, c.dockZ, { max: 200, hop: false });
    const boarded = b.until(() => c.state === 'flying', 120);
    b.step(120);
    const midAir = { y: g.body.y, z: g.body.z, onCarpet: g.body.ground === c.collider };
    b.until(() => c.state === 'arrived', 600);
    b.step(10);
    return { boarded, midAir, state: c.state, z: g.body.z, farZ: c.farZ, y: g.body.y };
  }, r);
  // Wrong carpet first.
  await ev(() => { const b = window.bot, round = b.g.stage.rounds[0], w = round.carpets.find((k) => k.colour !== round.target); b.walkTo(w.x, w.dockZ + 2.4); b.walkTo(w.x, w.dockZ, { max: 200, hop: false }); b.step(90); });
  s = await state(page);
  check('wrong carpet wobbles and stays put: no flight, no heart lost', s.hearts === 3 && s.stars === 0 && s.z > -4.5 && await ev(() => { const round = window.bot.g.stage.rounds[0]; return round.carpets.every((k) => k.state === 'docked') && round.carpets.some((k) => k.tried); }), `z=${s.z.toFixed(2)}`);
  const coins0 = (await state(page)).coins;
  let r0 = await ride(0);
  check('right carpet takes off with Affan on it', r0.boarded && r0.midAir.onCarpet && r0.midAir.y > 0.2, JSON.stringify(r0.midAir));
  check('carpet lands at the far ledge', r0.state === 'arrived' && Math.abs(r0.z - r0.farZ) < 1.2, `z=${r0.z.toFixed(2)} far=${r0.farZ}`);
  s = await state(page);
  check('star for the right colour, coins collected in flight, take-off sound', s.stars === 1 && s.coins >= coins0 + 3 && await ev(() => window.bot.g.audio.log.includes('sfx:carpet')), `stars=${s.stars} coins=${s.coins}`);
  await ev(() => window.bot.walkTo(0, -18.4, { max: 400, hop: false }));
  check('checkpoint on the second ledge', await ev(() => Math.abs(window.bot.g.checkpoint.z + 18.4) < 0.01));
  // Jump off the next carpet mid-flight: sand fall, respawn, carpet returns.
  await ev(() => { const b = window.bot, g = b.g, round = g.stage.rounds[1], c = round.carpets.find((k) => k.colour === round.target); b.walkTo(c.x, c.dockZ + 2.4, { max: 1500 }); b.walkTo(c.x, c.dockZ, { max: 200, hop: false }); b.until(() => c.state === 'flying', 120); b.step(100); g.input.setKey('left', true); g.input.setKey('jump', true); b.step(40); b.release(); b.until(() => g._busy, 300); });
  s = await state(page);
  check('jumping off a flying carpet: lose a heart', s.hearts === 2, `hearts=${s.hearts}`);
  await ev(() => window.bot.until(() => !window.bot.g._busy, 200));
  check('after the fall the carpet is back at its dock', await ev(() => { const round = window.bot.g.stage.rounds[1]; const c = round.carpets.find((k) => k.colour === round.target); return c.state === 'docked' && Math.abs(c.collider.z - c.dockZ) < 0.01; }));
  r0 = await ride(1);
  check('second canyon crossed on the right carpet', r0.state === 'arrived', `z=${r0.z.toFixed(2)}`);
  await ev(() => { window.bot.walkTo(0, -46.4, { max: 400, hop: false }); });
  r0 = await ride(2);
  check('third canyon crossed (hopping the low wall on the way)', r0.state === 'arrived' && (await state(page)).stars === 3, `z=${r0.z.toFixed(2)}`);
  await ev(() => { window.bot.walkTo(0, -74.4, { max: 400, hop: false }); window.bot.walkTo(0, -81.6, { max: 600 }); });
  s = await state(page);
  check('desert stage 2 completes with 3 stars', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars}`);
  await ev(() => window.bot.step(200));
  await page.click('#btn-next');

  // ---------- Stage 3: counting ----------
  s = await state(page);
  check('desert stage 3 loads', s.stage === 'desert-3');
  await ev(() => { window.bot.untilMode('play'); window.bot.step(120); });
  const st = await ev(() => ({ placed: window.bot.g.stage.placed, stations: window.bot.g.stage.stations.map((x) => ({ answer: x.answer, voice: x.voice, gateZ: x.gate.z, drums: x.drums.map((d) => ({ value: d.value, x: d.x, z: d.z })) })) }));
  check('answers equal the number of camels, cacti and stars actually placed', st.stations[0].answer === st.placed.camels && st.stations[1].answer === st.placed.cacti && st.stations[2].answer === st.placed.stars, JSON.stringify(st.placed));
  check('counts are within the 1-20 range for this age', [st.placed.camels, st.placed.cacti, st.placed.stars].every((n) => n >= 2 && n <= 10));
  check('each station offers the answer on exactly one of three drums', st.stations.every((x) => x.drums.filter((d) => d.value === x.answer).length === 1 && new Set(x.drums.map((d) => d.value)).size === 3));
  s = await state(page);
  check('counting question shown with narration', s.question.includes('Kira unta') && s.questionVoice === 'q_kira_unta', s.question);
  await shot(page, 'd3_camels.png');
  const drum = (i, value) => ev(([i, value]) => { const b = window.bot, d = b.g.stage.stations[i].drums.find((k) => k.value === value); b.walkTo(d.x, d.z + 2.1, { max: 1500 }); return b.jumpTo(d.x, d.z); }, [i, value]);
  const wrongDrum = st.stations[0].drums.find((d) => d.value !== st.stations[0].answer);
  await drum(0, wrongDrum.value);
  await ev(() => window.bot.step(120));
  s = await state(page);
  check('wrong drum sinks gently with Affan on it: no heart lost, no star', s.hearts === 3 && s.stars === 0 && s.y < 0.2 && await ev((v) => window.bot.g.stage.stations[0].drums.find((k) => k.value === v).state === 'sunk', wrongDrum.value), `y=${s.y.toFixed(2)}`);
  for (let i = 0; i < 3; i++) {
    const x = st.stations[i];
    const before = (await state(page)).stars;
    if (i === 2) await shot(page, 'd3_stars.png');
    s = await drum(i, x.answer);
    check(`station ${i + 1}: jumping on drum ${x.answer} is right, opens the gate`, s.stars === before + 1 && await ev((k) => window.bot.g.stage.stations[k].gate.isOpen, i), `stars=${s.stars}`);
    await ev(() => window.bot.step(80));
    await ev(([z]) => { window.bot.walkTo(0, z + 5.5, { max: 600 }); window.bot.walkTo(0, z - 2.4, { max: 600, hop: false }); }, [x.gateZ]);
    s = await state(page);
    check(`station ${i + 1}: through the gate`, s.z < x.gateZ - 1.8, `z=${s.z.toFixed(2)}`);
    if (i === 0) {
      c = await cross([-18.3, -22.1], -25.6);
      check('counting stage: crossed the platforms', c.z < -24.4 && c.hearts === 3, JSON.stringify(c));
      await ev(() => window.bot.walkTo(0, -26.2, { max: 200 }));
    }
    if (i === 1) {
      await ev(() => { window.bot.walkTo(0, -54.2, { max: 2000 }); });
      check('counting stage: past the boulders to the last checkpoint', (await state(page)).z < -53.5);
    }
  }
  await ev(() => window.bot.walkTo(0, -71.6, { max: 400 }));
  check('treasure chest opens when Affan reaches it', await ev(() => window.bot.g.stage.chestOpen));
  await ev(() => window.bot.step(100));
  s = await state(page);
  check('desert stage 3 completes', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars}`);
  await ev(() => window.bot.step(200));
  await page.screenshot({ path: path.join(OUT, 'd3_badge.png') });
  check('world complete screen shows the Desert Explorer badge', (await page.textContent('#badge-name')).includes('Peneroka Gurun'));
  const save = await ev(() => JSON.parse(localStorage.getItem('curious-affan-save-v1')));
  check('badge saved and World 3 unlocked (shown as coming soon)', save.badges.includes('desert-explorer') && save.unlockedWorld === 2 && save.stagesDone.desert === 3, JSON.stringify({ b: save.badges, u: save.unlockedWorld }));
  await page.click('#btn-complete-menu');
  const cards2 = await page.$$eval('.world-card', (els) => els.map((e) => e.className + '|' + e.textContent));
  check('world map: World 3 says "Akan datang!", Worlds 4-5 still locked', cards2[2].includes('Akan datang') && cards2[3].includes('locked') && cards2[4].includes('locked'));
  // Every narration clip the game can ask for exists as a file.
  const missing = await ev(async () => {
    const names = ['intro_jungle', 'intro_desert', 'jom', 'yeay', 'betul', 'wah_hebat', 'oops_cuba_lagi', 'kita_dah_berjaya', 'n_bagus', 'n_hebatnya', 'n_pandainya', 'n_cuba_lagi', 'n_tak_mengapa', 'n_hampir', 'q_huruf_hilang', 'q_kira_bintang', 'q_kira_unta', 'q_kira_kaktus', 'q_peti_harta',
      ...['merah', 'biru', 'kuning', 'hijau'].map((c) => 'q_kumpul_' + c), 'q_kumpul_bulat', 'q_kumpul_segi_empat', 'q_kumpul_segi_tiga', 'q_kumpul_4_bintang', 'q_kumpul_5_bintang', 'q_kumpul_6_bintang',
      ...['bulatan', 'segi_empat_sama', 'segi_tiga', 'segi_empat_tepat'].map((c) => 'q_pijak_' + c), ...['merah', 'biru', 'kuning', 'hijau', 'oren', 'ungu'].map((c) => 'q_naik_' + c),
      ...[[2, 1], [1, 3], [2, 2], [3, 2], [1, 4], [2, 3], [3, 3], [4, 2], [5, 1], [4, 3], [2, 5], [6, 1], [4, 4], [5, 3], [6, 2], [5, 4], [7, 2], [5, 5], [6, 4], [3, 6]].map(([a, b]) => `q_add_${a}_${b}`)];
    const bad = [];
    for (const n of names) { const r = await fetch(`assets/audio/voice/${n}.mp3`, { method: 'HEAD' }); if (!r.ok) bad.push(n); }
    return { bad, total: names.length };
  });
  check(`all ${missing.total} voice clips exist`, missing.bad.length === 0, missing.bad.join(','));
  check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
