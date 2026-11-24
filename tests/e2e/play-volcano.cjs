// Plays World 4 (Cabaran Gunung Berapi) end to end through the real input layer.
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
  await page.evaluate(() => localStorage.setItem('curious-affan-save-v1', JSON.stringify({ version: 1, unlockedWorld: 3, stagesDone: { jungle: 3, desert: 3, school: 3 }, stageStars: {}, coins: 0, badges: ['jungle-explorer', 'desert-explorer', 'little-scholar'], audio: { music: 0.5, sfx: 0.9, voice: 1, muted: false } })));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.affan.usingModel, null, { timeout: 30000 });
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8') });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  let s, c;
  // Rocks fall at random places and times. The run switches the random ones off and drops its own, so every run is the same.
  const calm = () => ev(() => { const z = window.bot.g.stage.zones; z.forEach((k) => { k.timer = 1e9; }); return z.length; });
  const hop = (x, z) => ev(([x, z]) => { window.bot.walkTo(x, z + 2.3, { max: 1500 }); const r = window.bot.jumpTo(x, z); window.bot.step(10); return r; }, [x, z]);
  const logged = (name) => ev((n) => window.bot.g.audio.log.includes(n), name);

  await page.click('#btn-worlds');
  const cards = await page.$$eval('.world-card', (els) => els.map((e) => e.className));
  check('world map: volcano is unlocked and playable', cards[3].includes('live') && !cards[3].includes('locked'));
  await page.click('.world-card.world-volcano');
  await ev(() => window.bot.freeze());
  s = await state(page);
  check('choosing World 4 starts volcano stage 1', s.world === 'volcano' && s.stage === 'volcano-1' && s.mode === 'intro');
  await ev(() => window.bot.untilMode('play'));
  check('volcano music requested and Affan speaks the opening line', (await state(page)).music === 'volcano' && await logged('voice:intro_volcano'));
  await ev(() => window.bot.step(120));

  // ---------- Stage 1: addition, lava bridges ----------
  check('stage 1 has a falling-rock area', (await calm()) === 1);
  const lr = await ev(() => window.bot.g.stage.rounds.map((r) => ({ prompt: r.question.prompt, voice: r.question.voice, answer: r.question.answer, rocks: r.rocks.map((p) => ({ value: p.value, x: p.x, z: p.z })) })));
  check('3 addition rounds, all different, sums within 10, each answer on exactly one rock', lr.length === 3 && new Set(lr.map((r) => r.voice)).size === 3 && lr.every((r) => { const m = r.voice.match(/^q_add_(\d+)_(\d+)$/); return m && +m[1] + +m[2] === r.answer && r.answer <= 10 && r.rocks.filter((p) => p.value === r.answer).length === 1 && new Set(r.rocks.map((p) => p.value)).size === 3; }), lr.map((r) => `${r.voice}=${r.answer}:${r.rocks.map((p) => p.value).join(',')}`).join(' | '));
  s = await state(page);
  check('addition question shown with its narration', s.question.startsWith(lr[0].prompt) && s.questionVoice === lr[0].voice, `${s.question} / ${s.questionVoice}`);
  await shot(page, 'v1_question.png');

  // Before the bridge is up the lava is open: a cartoon sizzle, one heart, back to the checkpoint.
  await ev(() => { const b = window.bot; b.walkTo(1.8, 1.4); b.walkTo(1.8, -3.4); b.walkTo(1.8, -8, { max: 200, hop: false }); b.until(() => b.g._busy, 200); });
  s = await state(page);
  check('touching lava costs a heart and plays the sizzle', s.hearts === 2 && await logged('sfx:sizzle'), `hearts=${s.hearts}`);
  await ev(() => window.bot.until(() => !window.bot.g._busy, 200));
  s = await state(page);
  check('respawned at the checkpoint after the lava', Math.abs(s.z - 7) < 0.3 && Math.abs(s.y) < 0.1, `z=${s.z.toFixed(2)}`);

  const doRound = async (r, wrongFirst) => {
    const round = lr[r];
    if (wrongFirst) {
      const wrong = round.rocks.find((p) => p.value !== round.answer);
      await hop(wrong.x, wrong.z);
      await ev(() => window.bot.step(150));
      s = await state(page);
      check('wrong rock: sinks gently, no heart lost, no star, bridge stays down', s.hearts === 2 && s.stars === 0 && s.y < 0.2 && await ev(() => !window.bot.g.stage.rounds[0].bridge.raised) && await logged('sfx:wrong'), `y=${s.y.toFixed(2)}`);
    }
    const right = round.rocks.find((p) => p.value === round.answer);
    const before = (await state(page)).stars;
    await hop(right.x, right.z);
    s = await state(page);
    check(`round ${r + 1}: rock ${round.answer} is right, star awarded, bridge rises`, s.stars === before + 1 && await ev((i) => window.bot.g.stage.rounds[i].bridge.raised, r), `stars=${s.stars}`);
    await ev(() => window.bot.step(80));
  };
  await doRound(0, true);
  check('rising bridge sound played', await logged('sfx:rock_rise'));
  await shot(page, 'v1_bridge.png');
  await ev(() => { const b = window.bot; b.walkTo(1.8, -3.6, { max: 600 }); b.walkTo(0, -5.2); b.walkTo(0, -13.4, { max: 900, hop: false }); });
  s = await state(page);
  check('crossed the first lava bridge', s.z < -12.6 && Math.abs(s.y) < 0.05 && s.hearts === 2, `z=${s.z.toFixed(2)} y=${s.y.toFixed(2)}`);

  // A falling rock: a shadow warns, then a soft bonk that never takes a heart.
  await ev(() => { const b = window.bot; b.walkTo(0, -17, { max: 600 }); b.g.stage.dropRock(b.g.body.x, b.g.body.z); b.step(60); });
  await shot(page, 'v1_rock_warning.png');
  await ev(() => window.bot.step(90));
  s = await state(page);
  check('falling rock nudges Affan aside without taking a heart', s.hearts === 2 && await logged('sfx:rock_fall') && await logged('sfx:bump') && Math.hypot(s.x, s.z + 17) > 0.5, `x=${s.x.toFixed(2)} z=${s.z.toFixed(2)}`);
  await ev(() => window.bot.step(120));

  await doRound(1, false);
  await ev(() => { const b = window.bot; b.walkTo(1.8, -27.6, { max: 600 }); b.walkTo(0, -29.2); b.walkTo(0, -38.2, { max: 900, hop: false }); });
  s = await state(page);
  check('crossed the second lava bridge to the checkpoint', s.z < -37.4 && Math.abs(s.y) < 0.05, `z=${s.z.toFixed(2)}`);

  c = await ev(() => {
    const b = window.bot, g = b.g;
    const plat = (z) => g.stage.movers.map((m) => m.collider).find((k) => k.tag === 'platform' && Math.abs(k.z - z) < 0.2);
    b.walkTo(0, -40.15);
    let p = plat(-42.9);
    b.until(() => Math.abs(p.x - g.body.x) < 0.5, 900);
    const on1 = b.jumpOnto(p);
    const q = plat(-46.7);
    b.until(() => Math.abs(q.x - p.x) < 0.9, 900);
    b.walkOn(p, 0, -0.85);
    const on2 = b.jumpOnto(q);
    b.walkOn(q, 0, -0.85);
    b.jumpTo(g.body.x, -49.9);
    b.walkTo(0, -50.4, { max: 200 });
    return { on1, on2, z: g.body.z, y: g.body.y, hearts: g.hearts };
  });
  check('drifting rock slabs carry Affan over the third lava river', c.on1 && c.on2 && c.z < -49.4 && Math.abs(c.y) < 0.05 && c.hearts === 2, JSON.stringify(c));

  // The rolling boulder bumps, never hurts.
  await ev(() => { const b = window.bot; b.walkTo(0, -51.3, { max: 300 }); b.walkTo(0, -52.4, { max: 60, hop: false }); b.step(460); });
  s = await state(page);
  check('rolling boulder pushes Affan without taking a heart', s.hearts === 2 && await ev(() => window.bot.g.audio.log.filter((x) => x === 'sfx:bump').length >= 2), `x=${s.x.toFixed(2)} z=${s.z.toFixed(2)}`);
  await ev(() => { const b = window.bot, g = b.g; const k = g.physics.colliders.find((q) => q.tag === 'boulder'); b.walkTo(-4.6, -50.6, { max: 600 }); b.until(() => k.x > 2.5, 900); b.walkTo(-4.6, -54.4, { max: 300 }); });
  await doRound(2, false);
  await ev(() => { const b = window.bot; b.walkTo(1.8, -59.6, { max: 600 }); b.walkTo(0, -61.2); b.walkTo(0, -77.8, { max: 1200, hop: false }); });
  s = await state(page);
  check('volcano stage 1 completes with 3 stars', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars} z=${s.z.toFixed(2)}`);
  await ev(() => window.bot.step(200));
  await page.click('#btn-next');

  // ---------- Stage 2: subtraction, steam lifts ----------
  s = await state(page);
  check('volcano stage 2 loads', s.stage === 'volcano-2');
  await ev(() => { window.bot.untilMode('play'); window.bot.step(60); });
  check('stage 2 has two falling-rock areas', (await calm()) === 2);
  const sr = await ev(() => window.bot.g.stage.rounds.map((r) => ({ prompt: r.question.prompt, voice: r.question.voice, answer: r.question.answer, parts: r.question.parts, base: r.base, cliffZ: r.cliffZ, crystals: r.crystals.length, lifts: r.lifts.map((p) => ({ value: p.value, x: p.x, z: p.z })) })));
  check('3 subtraction rounds getting harder, never negative, each answer on exactly one steam vent', sr.length === 3 && sr.every((r, i) => r.parts[0] - r.parts[1] === r.answer && r.answer > 0 && r.parts[0] <= 10 && r.voice === `q_sub_${r.parts[0]}_${r.parts[1]}` && (i === 0 || r.parts[0] >= sr[i - 1].parts[0]) && r.lifts.filter((p) => p.value === r.answer).length === 1 && new Set(r.lifts.map((p) => p.value)).size === 3), sr.map((r) => `${r.parts.join('-')}=${r.answer}:${r.lifts.map((p) => p.value).join(',')}`).join(' | '));
  s = await state(page);
  check('subtraction question shown with its narration', s.question.startsWith(sr[0].prompt) && s.questionVoice === sr[0].voice, `${s.question} / ${s.questionVoice}`);
  check('the picture shows as many crystals as the first number', sr.every((r) => r.crystals === r.parts[0]));
  await ev(() => { window.bot.walkTo(0, 2, { max: 600 }); window.bot.step(240); });
  check('the crystals taken away are crossed out one by one', await ev(() => { const r = window.bot.g.stage.rounds[0]; return r.crossed === r.question.parts[1]; }));
  await shot(page, 'v2_crystals.png');

  const ride = (r, value) => ev(([r, value]) => {
    const b = window.bot, g = b.g, round = g.stage.rounds[r], l = round.lifts.find((k) => k.value === value);
    b.walkTo(l.x, l.z + 2.5, { max: 1500 });
    b.jumpTo(l.x, l.z);
    b.step(12);
    const onIt = g.body.ground === l.collider;
    b.until(() => l.state !== 'lift' || l.top >= round.base + 3 - 0.001, 400);
    b.step(20);
    return { onIt, state: l.state, top: l.top, y: g.body.y, hearts: g.hearts, stars: g.stageStars };
  }, [r, value]);
  const offLift = (r) => ev(([r]) => { const b = window.bot, g = b.g, round = g.stage.rounds[r]; b.walkTo(g.body.x, round.cliffZ - 2.4, { max: 300, hop: false }); b.walkTo(0, round.cliffZ - 2.4, { max: 600 }); return { y: g.body.y, z: g.body.z }; }, [r]);

  // Round 1: wrong vent, right vent, then drop back down to see the lift come back.
  const wrongLift = sr[0].lifts.find((p) => p.value !== sr[0].answer);
  c = await ride(0, wrongLift.value);
  await ev(() => window.bot.step(150));
  s = await state(page);
  check('wrong vent: a weak puff, it settles, no heart lost, no star', c.onIt && c.hearts === 3 && c.stars === 0 && s.y < 0.25 && await logged('sfx:wrong'), JSON.stringify(c));
  check('the cliff cannot be jumped: a lift is the only way up', await ev(() => { const b = window.bot; b.walkTo(1.8, -6.5, { max: 600 }); b.jumpTo(1.8, -10); return b.g.body.y < 1 && b.g.body.z > -9.3; }));
  c = await ride(0, sr[0].answer);
  check('round 1: right vent lifts Affan to the next level with a star', c.onIt && c.state === 'lift' && Math.abs(c.y - 3) < 0.05 && c.stars === 1 && await logged('sfx:geyser'), JSON.stringify(c));
  await shot(page, 'v2_lift.png');
  c = await offLift(0);
  check('stepped off the lift onto the upper level', Math.abs(c.y - 3) < 0.05 && c.z < -11, JSON.stringify(c));
  c = await ev(() => {
    const b = window.bot, g = b.g, round = g.stage.rounds[0], l = round.lifts.find((k) => k.state === 'lift');
    const side = l.x > 1 ? -1.8 : 1.8;
    b.walkTo(side, -10.4, { max: 600 });
    b.walkTo(side, -7.6, { max: 300, hop: false });
    b.step(40);
    const fellTo = g.body.y;
    b.until(() => l.top <= 0.501, 400);
    const cameDown = l.top;
    b.walkTo(l.x, l.z + 2.5, { max: 900 });
    b.jumpTo(l.x, l.z);
    b.until(() => l.top >= 2.999, 400);
    b.step(10);
    return { fellTo, cameDown, y: g.body.y, hearts: g.hearts, stars: g.stageStars };
  });
  check('dropping back down is safe: the lift comes back and carries Affan up again', c.fellTo < 0.1 && Math.abs(c.cameDown - 0.5) < 0.01 && Math.abs(c.y - 3) < 0.05 && c.hearts === 3 && c.stars === 1, JSON.stringify(c));
  await offLift(0);

  await ev(() => { const b = window.bot; b.walkTo(0, -18, { max: 900 }); b.g.stage.dropRock(b.g.body.x, b.g.body.z, 3); b.step(150); });
  s = await state(page);
  check('falling rock on the upper level bumps without hurting', s.hearts === 3 && Math.abs(s.y - 3) < 0.05 && await logged('sfx:bump'));
  s = await state(page);
  await ev(() => window.bot.walkTo(0, -24, { max: 900 }));
  s = await state(page);
  check('second subtraction question appears on the second level', s.question.startsWith(sr[1].prompt) && s.questionVoice === sr[1].voice, s.question);
  c = await ride(1, sr[1].answer);
  check('round 2: right vent lifts Affan to the third level', c.onIt && Math.abs(c.y - 6) < 0.05 && c.stars === 2, JSON.stringify(c));
  await offLift(1);
  await ev(() => { const b = window.bot, g = b.g; const k = g.physics.colliders.find((q) => q.tag === 'boulder'); b.walkTo(-4.6, -38.6, { max: 900 }); b.until(() => k.x > 2.5, 900); b.walkTo(-4.6, -43, { max: 400 }); b.walkTo(0, -50, { max: 900 }); });
  s = await state(page);
  check('past the boulder on the third level', s.z < -49 && Math.abs(s.y - 6) < 0.05 && s.hearts === 3, `z=${s.z.toFixed(2)}`);
  c = await ride(2, sr[2].answer);
  check('round 3: right vent lifts Affan to the top', c.onIt && Math.abs(c.y - 9) < 0.05 && c.stars === 3, JSON.stringify(c));
  await offLift(2);
  await ev(() => window.bot.walkTo(0, -68.8, { max: 900 }));
  s = await state(page);
  check('volcano stage 2 completes with 3 stars', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars} z=${s.z.toFixed(2)}`);
  await ev(() => window.bot.step(200));
  await page.click('#btn-next');

  // ---------- Stage 3: number sequences, stepping stones ----------
  s = await state(page);
  check('volcano stage 3 loads', s.stage === 'volcano-3');
  await ev(() => { window.bot.untilMode('play'); window.bot.step(60); });
  check('stage 3 has a falling-rock area', (await calm()) === 1);
  const qr = await ev(() => window.bot.g.stage.rounds.map((r) => ({ detail: r.question.detail, answer: r.question.answer, sequence: r.question.sequence, missing: r.question.missingIndex, rocks: r.rocks.map((p) => ({ value: p.value, x: p.x, z: p.z })), stones: r.stones.map((p) => ({ z: p.z, number: p.number })) })));
  check('3 sequences (from 1, then higher, then teens), 5 stones each, the missing number on exactly one rock', qr.length === 3 && qr[0].sequence[0] === 1 && qr[1].sequence[0] >= 2 && qr[2].sequence[0] >= 10 && qr[2].sequence[4] <= 20 && qr.every((r) => r.stones.length === 5 && r.sequence.every((n, i) => n === r.sequence[0] + i) && r.sequence[r.missing] === r.answer && r.missing > 0 && r.rocks.filter((p) => p.value === r.answer).length === 1 && new Set(r.rocks.map((p) => p.value)).size === 3), qr.map((r) => `${r.detail} -> ${r.answer}:${r.rocks.map((p) => p.value).join(',')}`).join(' | '));
  s = await state(page);
  check('sequence question shown with its narration', s.question === `Nombor apakah yang hilang?|${qr[0].detail}` && s.questionVoice === 'q_nombor_hilang', s.question);
  await shot(page, 'v3_question.png');
  c = await ev(() => { const b = window.bot; b.walkTo(1.8, 1.4); b.walkTo(1.8, -3.4); b.walkTo(0, -5); b.walkTo(0, -9, { max: 240 }); b.step(30); return { z: b.g.body.z, y: b.g.body.y, hearts: b.g.hearts, busy: b.g._busy }; });
  check('before the answer, the bank is fenced: Affan cannot fall in reaching for a stone that is not up', c.z > -6.2 && Math.abs(c.y) < 0.05 && c.hearts === 3 && !c.busy, JSON.stringify(c));

  const doSeq = async (r, wrongFirst) => {
    const round = qr[r];
    if (wrongFirst) {
      const wrong = round.rocks.find((p) => p.value !== round.answer);
      await hop(wrong.x, wrong.z);
      await ev(() => window.bot.step(150));
      s = await state(page);
      check('wrong number: rock sinks, no heart lost, stones stay down', s.hearts === 3 && s.stars === 0 && await ev(() => window.bot.g.stage.rounds[0].stones.every((p) => !p.collider.enabled)));
    }
    const right = round.rocks.find((p) => p.value === round.answer);
    const before = (await state(page)).stars;
    await hop(right.x, right.z);
    await ev(() => window.bot.step(140));
    s = await state(page);
    check(`sequence ${r + 1}: ${round.answer} is right, star awarded, all five stones rise`, s.stars === before + 1 && await ev((i) => window.bot.g.stage.rounds[i].stones.every((p) => p.collider.enabled && p.rise === 1 && Math.abs(p.mesh.position.y) < 0.001), r), `stars=${s.stars}`);
  };
  const crossStones = (r, from = 0) => ev(([r, from]) => {
    const b = window.bot, g = b.g, round = g.stage.rounds[r], st = round.stones;
    const landed = [];
    if (from === 0) { b.walkTo(1.8, st[0].z + 5.2, { max: 900 }); b.walkTo(0, st[0].z + 1.7, { max: 600 }); }
    for (let i = from; i < st.length; i++) { b.jumpTo(0, st[i].z); landed.push(g.body.ground === st[i].collider); if (g._busy) break; }
    b.jumpTo(0, st[4].z - 2.4);
    b.walkTo(0, st[4].z - 3.2, { max: 200 });
    return { landed, z: g.body.z, y: g.body.y, hearts: g.hearts, visited: st.filter((p) => p.visited).length };
  }, [r, from]);

  await doSeq(0, true);
  await shot(page, 'v3_stones.png');
  c = await crossStones(0);
  check('sequence 1: hopped across all five stones in counting order', c.landed.length === 5 && c.landed.every(Boolean) && c.visited === 5 && c.z < -20 && Math.abs(c.y) < 0.05 && c.hearts === 3, JSON.stringify(c));
  await ev(() => { const b = window.bot; b.walkTo(0, -21.5, { max: 300 }); b.walkTo(4.6, -30.6, { max: 900 }); });
  await doSeq(1, false);
  // Slip off a stone: lava, one heart, back at the last checkpoint with the stones still up.
  c = await ev(() => {
    const b = window.bot, g = b.g, st = g.stage.rounds[1].stones;
    b.walkTo(1.8, st[0].z + 5.2, { max: 900 }); b.walkTo(0, st[0].z + 1.7, { max: 600 });
    b.jumpTo(0, st[0].z);
    b.walkTo(2.4, st[0].z, { max: 120, hop: false });
    b.until(() => g._busy, 200);
    const hearts = g.hearts;
    b.until(() => !g._busy, 200);
    return { hearts, z: g.body.z, y: g.body.y, up: st.every((p) => p.collider.enabled) };
  });
  check('slipping off a stone: sizzle, one heart, back at the checkpoint, stones still up', c.hearts === 2 && Math.abs(c.z + 21.5) < 0.3 && Math.abs(c.y) < 0.1 && c.up, JSON.stringify(c));
  c = await crossStones(1);
  check('sequence 2: crossed the second river on the stones', c.landed.every(Boolean) && c.z < -51.9 && Math.abs(c.y) < 0.05 && c.hearts === 2, JSON.stringify(c));
  await ev(() => { const b = window.bot, g = b.g; const k = g.physics.colliders.find((q) => q.tag === 'boulder'); b.walkTo(-4.6, -56.6, { max: 900 }); b.until(() => k.x > 2.5, 900); b.walkTo(-4.6, -61, { max: 400 }); });
  await doSeq(2, false);
  c = await crossStones(2);
  check('sequence 3: crossed the last river on the stones', c.landed.every(Boolean) && c.z < -83.8 && Math.abs(c.y) < 0.05 && c.hearts === 2, JSON.stringify(c));
  await ev(() => window.bot.walkTo(0, -92.8, { max: 900 }));
  s = await state(page);
  check('volcano stage 3 completes with 3 stars', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars} z=${s.z.toFixed(2)}`);
  await ev(() => window.bot.step(200));
  await page.screenshot({ path: path.join(OUT, 'v3_badge.png') });
  check('world complete screen shows the Fire Explorer badge', (await page.textContent('#badge-name')).includes('Peneroka Api'));
  const save = await ev(() => JSON.parse(localStorage.getItem('curious-affan-save-v1')));
  check('badge saved and World 5 unlocked', save.badges.includes('fire-explorer') && save.unlockedWorld === 4 && save.stagesDone.volcano === 3, JSON.stringify({ b: save.badges, u: save.unlockedWorld }));
  await page.click('#btn-complete-menu');
  const cards2 = await page.$$eval('.world-card', (els) => els.map((e) => e.className + '|' + e.textContent));
  check('world map: World 4 is done and World 5 is open to play', !cards2[3].includes('locked') && cards2[4].includes('live') && !cards2[4].includes('locked'));
  const missing = await ev(async () => {
    const subs = [[3, 1], [4, 2], [5, 2], [5, 3], [6, 1], [6, 3], [7, 2], [7, 4], [8, 3], [8, 5], [9, 4], [9, 6], [10, 3], [10, 5], [10, 7]];
    const adds = [[3, 3], [4, 2], [5, 1], [4, 3], [2, 5], [6, 1], [4, 4], [5, 3], [6, 2], [5, 4], [7, 2], [5, 5], [6, 4], [3, 6]];
    const names = ['intro_volcano', 'q_nombor_hilang', ...subs.map(([a, b]) => `q_sub_${a}_${b}`), ...adds.map(([a, b]) => `q_add_${a}_${b}`)];
    const sfx = ['step_rock', 'lava_amb', 'sizzle', 'rock_rise', 'rock_fall', 'geyser'];
    const bad = [];
    for (const n of names) { const r = await fetch(`assets/audio/voice/${n}.mp3`, { method: 'HEAD' }); if (!r.ok) bad.push(n); }
    for (const n of sfx) { const r = await fetch(`assets/audio/sfx/${n}.mp3`, { method: 'HEAD' }); if (!r.ok) bad.push(n); }
    const m = await fetch('assets/audio/music/volcano.mp3', { method: 'HEAD' }); if (!m.ok) bad.push('volcano music');
    return { bad, total: names.length + sfx.length + 1 };
  });
  check(`all ${missing.total} volcano audio files exist`, missing.bad.length === 0, missing.bad.join(','));
  check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
