// Plays World 3 (Sekolah Ajaib) end to end through the real input layer.
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
  await page.evaluate(() => localStorage.setItem('curious-affan-save-v1', JSON.stringify({ version: 1, unlockedWorld: 2, stagesDone: { jungle: 3, desert: 3 }, stageStars: {}, coins: 0, badges: ['jungle-explorer', 'desert-explorer'], audio: { music: 0.5, sfx: 0.9, voice: 1, muted: false } })));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.affan.usingModel, null, { timeout: 30000 });
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8') });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  let s;

  await page.click('#btn-worlds');
  const cards = await page.$$eval('.world-card', (els) => els.map((e) => e.className));
  check('world map: school is unlocked and playable', cards[2].includes('live') && !cards[2].includes('locked'));
  await page.click('.world-card.world-school');
  await ev(() => window.bot.freeze());
  s = await state(page);
  check('choosing World 3 starts school stage 1', s.world === 'school' && s.stage === 'school-1' && s.mode === 'intro');
  await ev(() => window.bot.untilMode('play'));
  check('school music requested and Affan speaks the opening line', (await state(page)).music === 'school' && await ev(() => window.bot.g.audio.log.includes('voice:intro_school')));
  await ev(() => window.bot.step(120));

  // ---------- Stage 1: capital and small letters ----------
  const rounds = await ev(() => window.bot.g.stage.rounds.map((r) => ({ upper: r.upper, lower: r.lower, z: r.gate.z, blocks: r.blocks.map((p) => ({ letter: p.letter, x: p.x, z: p.z })) })));
  check('3 doors, 3 different capitals, each with its small letter on exactly one block', rounds.length === 3 && new Set(rounds.map((r) => r.upper)).size === 3 && rounds.every((r) => r.lower === r.upper.toLowerCase() && r.blocks.filter((p) => p.letter === r.lower).length === 1 && new Set(r.blocks.map((p) => p.letter)).size === 3), rounds.map((r) => `${r.upper}:${r.blocks.map((b) => b.letter).join('')}`).join(' | '));
  s = await state(page);
  check('letter question shown with its narration', s.question.includes('Cari huruf kecil') && s.question.endsWith(rounds[0].upper) && s.questionVoice === `q_huruf_${rounds[0].lower}`, `${s.question} / ${s.questionVoice}`);
  await shot(page, 's1_letters.png');

  const hop = (x, z) => ev(([x, z]) => { window.bot.walkTo(x, z + 2.3, { max: 1500 }); const r = window.bot.jumpTo(x, z); window.bot.step(10); return r; }, [x, z]);
  const through = (z) => ev(([z]) => { window.bot.walkTo(1.85, z + 7.2, { max: 1500 }); window.bot.walkTo(1.85, z + 3.2); window.bot.walkTo(0, z + 2.2); window.bot.walkTo(0, z - 2.6, { hop: false }); return window.bot.g.body.z; }, [z]);
  const doDoor = async (r, wrongFirst) => {
    const round = rounds[r];
    if (wrongFirst) {
      const wrong = round.blocks.find((p) => p.letter !== round.lower);
      await hop(wrong.x, wrong.z);
      s = await state(page);
      check('wrong letter block: door stays shut, no heart lost, no star', s.hearts === 3 && s.stars === 0 && await ev(() => !window.bot.g.stage.rounds[0].gate.isOpen && window.bot.g.audio.log.includes('sfx:wrong')));
    }
    const right = round.blocks.find((p) => p.letter === round.lower);
    const before = (await state(page)).stars;
    await hop(right.x, right.z);
    s = await state(page);
    check(`door ${r + 1}: block "${round.lower}" for "${round.upper}" opens it and awards a star`, s.stars === before + 1 && await ev((i) => window.bot.g.stage.rounds[i].gate.isOpen, r), `stars=${s.stars}`);
    await ev(() => window.bot.step(80));
    if (r === 0) await shot(page, 's1_door_open.png');
    const z = await through(round.z);
    check(`door ${r + 1}: Affan walks through`, z < round.z - 2, `z=${z.toFixed(2)}`);
  };
  check('closed pencil gate blocks the way', await ev(() => { window.bot.walkTo(1.85, 0.6); window.bot.walkTo(1.85, -3.2); window.bot.walkTo(0.8, -4.6); window.bot.walkTo(0.8, -8, { max: 150, hop: false }); return window.bot.g.body.z > -5.6 && window.bot.g.stageStars === 0; }));
  await doDoor(0, true);
  check('gate chime played', await ev(() => window.bot.g.audio.log.includes('sfx:gate_chime')));

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
    b.walkOn(p, 0, -0.85);
    b.jumpTo(g.body.x, landZ);
    return { on1, onLast, z: g.body.z, y: g.body.y, hearts: g.hearts };
  }, [zs, landZ]);
  let c = await cross([-12.3, -16.1], -19.6);
  check('floating books carry Affan over the ball pit', c.on1 && c.onLast && c.z < -18.4 && Math.abs(c.y) < 0.05 && c.hearts === 3, JSON.stringify(c));
  await ev(() => { window.bot.walkTo(4.5, -19.4); window.bot.walkTo(4.5, -17.2, { max: 120, hop: false }); window.bot.until(() => window.bot.g._busy, 200); });
  s = await state(page);
  check('falling into the ball pit costs a heart and plays its sound', s.hearts === 2 && await ev(() => window.bot.g.audio.log.includes('sfx:ball_pit')), `hearts=${s.hearts}`);
  await ev(() => window.bot.until(() => !window.bot.g._busy, 200));
  check('respawned at the checkpoint after the pit', Math.abs((await state(page)).z + 20.2) < 0.3);
  await doDoor(1, false);
  // Spinners: a bead bumps Affan aside, never hurts; the open lane lets him pass.
  const h0 = (await state(page)).hearts;
  await ev(() => { window.bot.walkTo(-0.3, -33.6); window.bot.walkTo(-0.3, -36, { max: 200, hop: false }); window.bot.step(480); });
  s = await state(page);
  check('spinner bead nudges Affan without taking a heart', s.hearts === h0 && await ev(() => window.bot.g.audio.log.includes('sfx:bump')), `x=${s.x.toFixed(2)} z=${s.z.toFixed(2)}`);
  await ev(() => { const b = window.bot; b.walkTo(4.2, -33.4, { max: 600 }); b.walkTo(4.2, -38.2, { max: 600 }); b.walkTo(-4.2, -38.2, { max: 600 }); b.walkTo(-4.2, -42.6, { max: 600 }); b.walkTo(0, -43.0, { max: 600 }); });
  s = await state(page);
  check('passed both spinners by the open lanes', s.z < -42.5 && s.hearts === h0, `z=${s.z.toFixed(2)}`);
  c = await ev(() => { const b = window.bot, g = b.g; const p = g.stage.movers.map((m) => m.collider).find((k) => k.tag === 'platform' && k.z < -40); b.until(() => p.z > -45.05, 900); b.walkTo(0, p.z, { max: 80, hop: false }); const on = g.body.ground === p; b.until(() => p.z < -46.75, 900); b.walkTo(0, -49.8, { max: 200, hop: false }); return { on, z: g.body.z, y: g.body.y, hearts: g.hearts }; });
  check('shuttling book carries Affan over the second ball pit', c.on && c.z < -48.2 && Math.abs(c.y) < 0.05 && c.hearts === h0, JSON.stringify(c));
  await doDoor(2, false);
  await ev(() => window.bot.walkTo(0, -66.6, { max: 600 }));
  s = await state(page);
  check('school stage 1 completes with 3 stars', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars}`);
  await ev(() => window.bot.step(200));
  await page.click('#btn-next');

  // ---------- Stage 2: word builder ----------
  s = await state(page);
  check('school stage 2 loads', s.stage === 'school-2');
  await ev(() => { window.bot.untilMode('play'); window.bot.step(120); });
  const wr = await ev(() => window.bot.g.stage.rounds.map((r) => ({ word: r.word, voice: r.voice, segMinZ: r.segMinZ, tiles: r.tiles.map((t) => ({ letter: t.letter, x: t.x, z: t.z, top: t.top })) })));
  check('3 different three-letter words; each has its letters plus 2 spares on 5 book piles', wr.length === 3 && new Set(wr.map((r) => r.word)).size === 3 && wr.every((r) => r.word.length === 3 && r.tiles.length === 5 && r.word.split('').every((ch) => r.tiles.filter((t) => t.letter === ch).length === 1)), wr.map((r) => `${r.word}:${r.tiles.map((t) => t.letter).join('')}`).join(' | '));
  s = await state(page);
  check('word question shown with narration and empty slots', s.question.startsWith(`Eja: ${wr[0].word}`) && s.question.endsWith('_ _ _') && s.questionVoice === wr[0].voice, s.question);
  await shot(page, 's2_word.png');
  const climb = (r, letter) => ev(([r, letter]) => {
    const b = window.bot, g = b.g, t = g.stage.rounds[r].tiles.find((k) => k.letter === letter);
    if (g.body.y > 0.3) b.walkTo(g.body.x, g.body.z + 2.6, { max: 200 });
    if (t.top > 1.0) { b.walkTo(t.x, t.z + 3.0, { max: 1500 }); b.jumpTo(t.x, t.z + 1.5); b.jumpTo(t.x, t.z); }
    else { b.walkTo(t.x, t.z + 2.0, { max: 1500 }); b.jumpTo(t.x, t.z); }
    b.step(12);
    const round = g.stage.rounds[r];
    return { found: round.found, state: t.state, hearts: g.hearts, stars: g.stageStars, bridge: round.bridge.enabled, onIt: g.body.ground === t.collider };
  }, [r, letter]);
  // Round 1: a spare letter, then a letter out of order, then the word in order.
  const w0 = wr[0];
  const spare = w0.tiles.find((t) => !w0.word.includes(t.letter)).letter;
  let k = await climb(0, spare);
  check('spare letter: set aside, nothing collected, no heart lost', k.onIt && k.state === 'gone' && k.found === 0 && k.hearts === 3, JSON.stringify(k));
  k = await climb(0, w0.word[2]);
  check('right letter in the wrong order: stays for later, nothing collected', k.onIt && k.state === 'idle' && k.found === 0 && k.hearts === 3 && !k.bridge, JSON.stringify(k));
  for (let r = 0; r < 3; r++) {
    const w = wr[r];
    if (r === 1) await ev(() => { const b = window.bot; b.walkTo(0, -12.9, { max: 300, hop: false }); b.walkTo(4.6, -13.2, { max: 600 }); b.walkTo(4.6, -19.4, { max: 600 }); });
    if (r === 2) await ev(() => { const b = window.bot; b.walkTo(0, -37.2, { max: 300, hop: false }); b.walkTo(0, -42.4, { max: 900 }); });
    if (r > 0) { s = await state(page); check(`word ${r + 1}: reached the next book piles`, s.z < (r === 1 ? -18.5 : -41.5) && s.hearts === 3, `z=${s.z.toFixed(2)} hearts=${s.hearts}`); }
    for (let i = 0; i < 3; i++) {
      k = await climb(r, w.word[i]);
      if (i < 2) check(`word ${r + 1}: "${w.word[i]}" collected in order (${i + 1}/3)`, k.found === i + 1 && !k.bridge, JSON.stringify(k));
      if (r === 0 && i === 0) { s = await state(page); check('panel shows the letters found so far', s.question.endsWith(`${w.word[0]} _ _`), s.question); }
    }
    check(`word ${r + 1}: ${w.word} spelled, star awarded, bridge built`, k.found === 3 && k.bridge && k.stars === r + 1, JSON.stringify(k));
    await ev(() => window.bot.step(90));
    if (r === 0) await shot(page, 's2_bridge.png');
    await ev(([z]) => { const b = window.bot; b.walkTo(b.g.body.x, b.g.body.z + 2.6, { max: 200 }); b.walkTo(0, z + 4.4, { max: 900 }); b.walkTo(0, z + 1.2, { max: 600 }); b.walkTo(0, z - 7.2, { max: 600, hop: false }); }, [w.segMinZ]);
    s = await state(page);
    check(`word ${r + 1}: crossed the word bridge`, s.z < w.segMinZ - 6.4 && Math.abs(s.y) < 0.05 && s.hearts === 3, `z=${s.z.toFixed(2)} y=${s.y.toFixed(2)}`);
  }
  await ev(() => window.bot.walkTo(0, -68.6, { max: 600 }));
  s = await state(page);
  check('school stage 2 completes with 3 stars', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars}`);
  await ev(() => window.bot.step(200));
  await page.click('#btn-next');

  // ---------- Stage 3: animals ----------
  s = await state(page);
  check('school stage 3 loads', s.stage === 'school-3');
  await ev(() => { window.bot.untilMode('play'); window.bot.step(120); });
  const ar = await ev(() => window.bot.g.stage.rounds.map((r) => ({ kind: r.kind, target: r.target, z: r.gate.z, choices: r.choices.map((p) => ({ animal: p.animal, x: p.x, z: p.z })) })));
  check('3 rounds (name, sound, sound) with 3 different animals, each on exactly one card', ar.map((r) => r.kind).join() === 'name,sound,sound' && new Set(ar.map((r) => r.target)).size === 3 && ar.every((r) => r.choices.filter((p) => p.animal === r.target).length === 1 && new Set(r.choices.map((p) => p.animal)).size === 3), ar.map((r) => `${r.kind}:${r.target}`).join(' | '));
  s = await state(page);
  check('name round: "Cari <animal>" shown with narration', s.question === `Cari ${ar[0].target.toUpperCase()}|` && s.questionVoice === `q_cari_${ar[0].target}`, s.question);
  await shot(page, 's3_animals.png');
  for (let r = 0; r < 3; r++) {
    const round = ar[r];
    if (r === 1) {
      // Garden pond: stepping stone, then the drifting lily pad.
      c = await ev(() => { const b = window.bot, g = b.g; b.walkTo(0, -11.5, { max: 300, hop: false }); b.jumpTo(0, -14.05); const pad = g.stage.movers.map((m) => m.collider).find((q) => q.tag === 'platform'); b.until(() => Math.abs(pad.x - g.body.x) < 0.5, 900); b.walkTo(g.body.x, -14.7, { max: 40, hop: false }); const on = b.jumpOnto(pad); b.walkOn(pad, 0, -0.8); b.jumpTo(g.body.x, -21.2); b.walkTo(0, -21.8, { max: 200 }); return { on, z: g.body.z, y: g.body.y, hearts: g.hearts }; });
      check('pond crossed by stone and lily pad', c.on && c.z < -20 && Math.abs(c.y) < 0.05 && c.hearts === 3, JSON.stringify(c));
      s = await state(page);
      check('sound round: narration is followed by the animal sound', s.questionVoice === 'q_bunyi' && s.questionSfx === `animal_${round.target}`, `${s.questionVoice} + ${s.questionSfx}`);
      const heard = await page.waitForFunction((n) => window.bot.g.audio.log.includes('sfx:' + n), `animal_${round.target}`, { timeout: 15000 }).then(() => true, () => false);
      check('the animal sound actually plays after the narration', heard);
      const count = await ev((n) => window.bot.g.audio.log.filter((x) => x === 'sfx:' + n).length, `animal_${round.target}`);
      await page.click('#q-replay');
      const again = await page.waitForFunction(([n, c]) => window.bot.g.audio.log.filter((x) => x === 'sfx:' + n).length > c, [`animal_${round.target}`, count], { timeout: 15000 }).then(() => true, () => false);
      check('speaker button replays the narration and the animal sound', again);
      await shot(page, 's3_sound.png');
    }
    if (r === 2) {
      await ev(() => { window.bot.walkTo(0, -45.4, { max: 2500 }); });
      s = await state(page);
      check('past the beach balls to the last checkpoint', s.z < -44.6 && s.hearts === 3, `z=${s.z.toFixed(2)}`);
    }
    if (r === 0) {
      const wrong = round.choices.find((p) => p.animal !== round.target);
      await hop(wrong.x, wrong.z);
      s = await state(page);
      check('wrong animal: gate stays shut, no heart lost, no star', s.hearts === 3 && s.stars === 0 && await ev(() => !window.bot.g.stage.rounds[0].gate.isOpen));
      await ev(([x, z]) => window.bot.walkTo(x, z + 2.6, { max: 200 }), [wrong.x, wrong.z]);
    }
    const right = round.choices.find((p) => p.animal === round.target);
    const before = (await state(page)).stars;
    await hop(right.x, right.z);
    s = await state(page);
    check(`round ${r + 1} (${round.kind}): ${round.target} is right, gate opens, star awarded`, s.stars === before + 1 && await ev((i) => window.bot.g.stage.rounds[i].gate.isOpen, r), `stars=${s.stars}`);
    await ev(() => window.bot.step(120));
    check(`round ${r + 1}: the animal's own sound plays as a reward`, await ev((n) => window.bot.g.audio.log.filter((x) => x === 'sfx:' + n).length >= 1, `animal_${round.target}`));
    await ev(([x, z]) => window.bot.walkTo(x, z + 2.6, { max: 200 }), [right.x, right.z]);
    const z = await through(round.z);
    check(`round ${r + 1}: through the garden gate`, z < round.z - 2, `z=${z.toFixed(2)}`);
  }
  await ev(() => window.bot.walkTo(0, -64.6, { max: 600 }));
  s = await state(page);
  check('school stage 3 completes with 3 stars', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars}`);
  await ev(() => window.bot.step(200));
  await page.screenshot({ path: path.join(OUT, 's3_badge.png') });
  check('world complete screen shows the Little Scholar badge', (await page.textContent('#badge-name')).includes('Cendekiawan Cilik'));
  const save = await ev(() => JSON.parse(localStorage.getItem('curious-affan-save-v1')));
  check('badge saved and World 4 unlocked', save.badges.includes('little-scholar') && save.unlockedWorld === 3 && save.stagesDone.school === 3, JSON.stringify({ b: save.badges, u: save.unlockedWorld }));
  await page.click('#btn-complete-menu');
  const cards2 = await page.$$eval('.world-card', (els) => els.map((e) => e.className + '|' + e.textContent));
  check('world map: World 4 is open to play, World 5 still locked', cards2[3].includes('live') && !cards2[3].includes('locked') && cards2[4].includes('locked'));
  const missing = await ev(async () => {
    const names = ['intro_school', 'q_bunyi', ...'abdeghmnqr'.split('').map((l) => 'q_huruf_' + l), ...['cat', 'dog', 'sun', 'bus'].map((w) => 'q_eja_' + w), ...['kucing', 'anjing', 'lembu', 'itik', 'ayam', 'kambing'].map((a) => 'q_cari_' + a)];
    const sfx = ['step_floor', 'ball_pit', 'gate_chime', ...['kucing', 'anjing', 'lembu', 'itik', 'ayam', 'kambing'].map((a) => 'animal_' + a)];
    const bad = [];
    for (const n of names) { const r = await fetch(`assets/audio/voice/${n}.mp3`, { method: 'HEAD' }); if (!r.ok) bad.push(n); }
    for (const n of sfx) { const r = await fetch(`assets/audio/sfx/${n}.mp3`, { method: 'HEAD' }); if (!r.ok) bad.push(n); }
    const m = await fetch('assets/audio/music/school.mp3', { method: 'HEAD' }); if (!m.ok) bad.push('school music');
    return { bad, total: names.length + sfx.length + 1 };
  });
  check(`all ${missing.total} school audio files exist`, missing.bad.length === 0, missing.bad.join(','));
  check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
