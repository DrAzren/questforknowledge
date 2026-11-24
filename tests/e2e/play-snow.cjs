// Plays World 5 (Kerajaan Beku) end to end through the real input layer, to the Snow Guardian and the trophy.
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
  await page.evaluate(() => localStorage.setItem('curious-affan-save-v1', JSON.stringify({ version: 1, unlockedWorld: 4, stagesDone: { jungle: 3, desert: 3, school: 3, volcano: 3 }, stageStars: {}, coins: 0, badges: ['jungle-explorer', 'desert-explorer', 'little-scholar', 'fire-explorer'], audio: { music: 0.5, sfx: 0.9, voice: 1, muted: false } })));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.affan.usingModel, null, { timeout: 30000 });
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8') });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  let s, c;
  const logged = (name) => ev((n) => window.bot.g.audio.log.includes(n), name);
  const count = (name) => ev((n) => window.bot.g.audio.log.filter((x) => x === n).length, name);
  const rounds = () => ev(() => window.bot.g.stage.rounds.map((r) => ({ prompt: r.question.prompt, detail: r.question.detail || '', voice: r.question.voice, answer: r.question.answer, pads: r.pads.map((p) => ({ value: p.value, x: p.x, z: p.z })) })));
  const sound = (r) => r.pads.filter((p) => p.value === r.answer).length === 1 && new Set(r.pads.map((p) => p.value)).size === 3;
  const hop = (x, z) => ev(([x, z]) => { window.bot.walkTo(x, z + 2.3, { max: 1500 }); const r = window.bot.jumpTo(x, z); window.bot.step(10); return r; }, [x, z]);
  // Hop on the right block for a round, optionally a wrong one first; then check the bridge froze.
  const doRound = async (rs, r, label, wrongFirst, hearts) => {
    const round = rs[r];
    if (wrongFirst) {
      const wrong = round.pads.find((p) => p.value !== round.answer);
      await hop(wrong.x, wrong.z);
      await ev(() => window.bot.step(150));
      s = await state(page);
      check(`${label}: wrong block turns pink and sinks, no heart lost, no star, water stays open`, s.hearts === hearts && s.stars === 0 && s.y < 0.2 && await ev((i) => !window.bot.g.stage.rounds[i].bridge.frozen, r) && await logged('sfx:wrong'), `y=${s.y.toFixed(2)}`);
    }
    const right = round.pads.find((p) => p.value === round.answer);
    const before = (await state(page)).stars;
    await hop(right.x, right.z);
    s = await state(page);
    check(`${label}: "${round.answer}" is right, star awarded, the water freezes into a bridge`, s.stars === before + 1 && await ev((i) => window.bot.g.stage.rounds[i].bridge.frozen, r), `stars=${s.stars}`);
    await ev(() => window.bot.step(100));
  };
  const overBridge = (nearZ, toZ) => ev(([nearZ, toZ]) => { const b = window.bot; b.walkTo(1.8, nearZ + 2.4, { max: 600 }); b.walkTo(0, nearZ + 0.8); b.walkTo(0, toZ, { max: 900, hop: false }); return { z: b.g.body.z, y: b.g.body.y, hearts: b.g.hearts }; }, [nearZ, toZ]);
  const floes = (z1, z2, landZ) => ev(([z1, z2, landZ]) => {
    const b = window.bot, g = b.g;
    const plat = (z) => g.stage.movers.map((m) => m.collider).find((k) => k.tag === 'platform' && Math.abs(k.z - z) < 0.2);
    b.walkTo(0, z1 + 2.75);
    const p = plat(z1);
    b.until(() => Math.abs(p.x - g.body.x) < 0.5, 900);
    const on1 = b.jumpOnto(p);
    const q = plat(z2);
    b.until(() => Math.abs(q.x - p.x) < 0.9, 900);
    b.walkOn(p, 0, -0.8);
    const on2 = b.jumpOnto(q);
    b.walkOn(q, 0, -0.8);
    b.jumpTo(g.body.x, landZ);
    return { on1, on2, z: g.body.z, y: g.body.y, hearts: g.hearts };
  }, [z1, z2, landZ]);
  const pastBall = (z) => ev(([z]) => { const b = window.bot, g = b.g; const k = g.physics.colliders.find((q) => q.tag === 'snowball'); b.walkTo(-4.6, z + 1.8, { max: 900 }); b.until(() => k.x > 2.5, 900); b.walkTo(-4.6, z - 2, { max: 300 }); return { z: g.body.z, hearts: g.hearts }; }, [z]);

  await page.click('#btn-worlds');
  const cards = await page.$$eval('.world-card', (els) => els.map((e) => e.className + '|' + e.textContent));
  check('world map: the snow kingdom is unlocked and playable', cards[4].includes('live') && !cards[4].includes('locked') && !cards[4].includes('Akan datang'));
  await page.click('.world-card.world-snow');
  await ev(() => window.bot.freeze());
  s = await state(page);
  check('choosing World 5 starts snow stage 1', s.world === 'snow' && s.stage === 'snow-1' && s.mode === 'intro');
  await ev(() => window.bot.untilMode('play'));
  check('snow music requested and Affan speaks the opening line', (await state(page)).music === 'snow' && await logged('voice:intro_snow'));
  await ev(() => window.bot.step(120));

  // ---------- Stage 1: letters ----------
  let rs = await rounds();
  check('3 letter rounds: missing letter, small letter, first letter; each answer on exactly one block', rs.length === 3 && rs.every(sound)
    && rs[0].voice === 'q_huruf_hilang' && rs[0].detail.includes('?')
    && rs[1].voice === `q_huruf_${rs[1].answer}` && rs[1].detail === rs[1].answer.toUpperCase() && rs[1].pads.every((p) => p.value === p.value.toLowerCase())
    && /^q_awal_[a-z]+$/.test(rs[2].voice) && rs[2].detail.startsWith('_') && rs[2].voice.slice(7).toUpperCase()[0] === rs[2].answer,
  rs.map((r) => `${r.detail} -> ${r.answer}:${r.pads.map((p) => p.value).join('')}`).join(' | '));
  s = await state(page);
  check('missing-letter question shown with its narration', s.question === `${rs[0].prompt}|${rs[0].detail}` && s.questionVoice === rs[0].voice, s.question);
  await shot(page, 'w5_1_question.png');
  await ev(() => { const b = window.bot; b.walkTo(1.8, 1.4); b.walkTo(1.8, -3.4); b.walkTo(1.8, -8, { max: 200, hop: false }); b.until(() => b.g._busy, 200); });
  s = await state(page);
  check('icy water costs a heart with a splash', s.hearts === 2 && await logged('sfx:splash'), `hearts=${s.hearts}`);
  await ev(() => window.bot.until(() => !window.bot.g._busy, 200));
  check('respawned at the checkpoint after the splash', Math.abs((await state(page)).z - 7) < 0.3);
  await doRound(rs, 0, 'letter 1', true, 2);
  check('ice-forming sound played and every plank of the bridge is in place', await logged('sfx:ice_form') && await ev(() => window.bot.g.stage.bridges[0].planks.every((p) => p.visible && Math.abs(p.scale.x - 1) < 0.001)));
  await shot(page, 'w5_1_bridge.png');
  c = await overBridge(-6, -13.4);
  check('crossed the first ice bridge', c.z < -12.6 && Math.abs(c.y) < 0.05 && c.hearts === 2, JSON.stringify(c));
  await ev(() => { const b = window.bot; b.walkTo(0, -14.4, { max: 300 }); b.walkTo(0, -15.6, { max: 60, hop: false }); b.until(() => b.g.audio.log.includes('sfx:penguin'), 600); b.step(30); });
  s = await state(page);
  check('a sliding penguin bumps Affan with a squawk and takes no heart', s.hearts === 2 && await logged('sfx:penguin') && await logged('sfx:bump'), `x=${s.x.toFixed(2)}`);
  await ev(() => window.bot.walkTo(4.4, -22, { max: 2500 }));
  s = await state(page);
  check('past both sliding penguins', s.z < -21 && s.hearts === 2, `z=${s.z.toFixed(2)}`);
  check('small-letter question shown with its narration', s.question === `${rs[1].prompt}|${rs[1].detail}` && s.questionVoice === rs[1].voice, s.question);
  await doRound(rs, 1, 'letter 2', false, 2);
  c = await overBridge(-30, -38.2);
  check('crossed the second ice bridge to the checkpoint', c.z < -37.4 && Math.abs(c.y) < 0.05, JSON.stringify(c));
  c = await floes(-42.9, -46.7, -49.9);
  check('drifting ice floes carry Affan over the third channel', c.on1 && c.on2 && c.z < -49.2 && Math.abs(c.y) < 0.05 && c.hearts === 2, JSON.stringify(c));
  const bumps = await count('sfx:bump');
  await ev(() => { const b = window.bot; b.walkTo(0, -50.4, { max: 300 }); b.walkTo(0, -51.3, { max: 300 }); b.walkTo(0, -52.4, { max: 60, hop: false }); b.step(460); });
  check('the rolling snowball pushes Affan without taking a heart', (await state(page)).hearts === 2 && await count('sfx:bump') > bumps);
  await pastBall(-52.4);
  s = await state(page);
  check('first-letter question shown with its narration', s.question === `${rs[2].prompt}|${rs[2].detail}` && s.questionVoice === rs[2].voice, s.question);
  await doRound(rs, 2, 'letter 3', false, 2);
  await overBridge(-62, -69.6);
  await ev(() => window.bot.walkTo(0, -77.8, { max: 900, hop: false }));
  s = await state(page);
  check('snow stage 1 completes with 3 stars', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars} z=${s.z.toFixed(2)}`);
  await ev(() => window.bot.step(200));
  await page.click('#btn-next');

  // ---------- Stage 2: penguin maths ----------
  s = await state(page);
  check('snow stage 2 loads', s.stage === 'snow-2');
  await ev(() => { window.bot.untilMode('play'); window.bot.step(60); });
  rs = await rounds();
  const st2 = await ev(() => { const st = window.bot.g.stage; return { counted: st.counted.length, flock: st.flock.length, leavers: st.leavers.length, parts: st.rounds[1].question.parts || null }; });
  const sub = rs[1].voice.match(/^q_sub_(\d+)_(\d+)$/);
  check('3 maths rounds: counting, subtraction, missing number; each answer on exactly one block', rs.length === 3 && rs.every(sound)
    && rs[0].voice === 'q_kira_penguin' && rs[0].answer >= 3 && rs[0].answer <= 8
    && sub && +sub[1] - +sub[2] === rs[1].answer && +sub[1] <= 10 && rs[1].answer > 0
    && rs[2].voice === 'q_nombor_hilang' && rs[2].detail.includes('?') && rs[2].answer <= 20,
  rs.map((r) => `${r.detail || r.prompt} -> ${r.answer}:${r.pads.map((p) => p.value).join(',')}`).join(' | '));
  check('there are exactly as many penguins to count as the answer', st2.counted === rs[0].answer, `${st2.counted}`);
  check('the subtraction is acted out: as many penguins as the first number, and the second number of them will leave', st2.flock === +sub[1] && st2.leavers === +sub[2], JSON.stringify(st2));
  s = await state(page);
  check('counting question shown with its narration', s.question.startsWith('Kira penguin') && s.questionVoice === 'q_kira_penguin', s.question);
  await shot(page, 'w5_2_count.png');
  // Around the shelf of penguins to the blocks.
  await ev(() => { const b = window.bot; b.walkTo(4.6, 7.4, { max: 600 }); b.walkTo(4.6, 2.2, { max: 600 }); });
  await doRound(rs, 0, 'counting', true, 3);
  check('the counted penguins cheer', await ev(() => window.bot.g.stage.counted.every((p) => p.userData.mode === 'cheer')));
  c = await overBridge(-6, -13.4);
  check('crossed the ice bridge after counting', c.z < -12.6 && Math.abs(c.y) < 0.05 && c.hearts === 3, JSON.stringify(c));
  await pastBall(-15.4);
  s = await state(page);
  check('subtraction question shown with its narration', s.question.startsWith(rs[1].prompt) && s.questionVoice === rs[1].voice, s.question);
  await ev(() => window.bot.step(120));
  await shot(page, 'w5_2_subtract.png');
  await ev(() => window.bot.until(() => window.bot.g.stage.leavers.every((l) => l.gone), 900));
  c = await ev(() => { const st = window.bot.g.stage; return { left: st.flock.filter((p) => p.visible).length, gone: st.leavers.filter((l) => l.gone).length }; });
  check('the penguins taken away slide off, leaving exactly the answer standing', c.left === rs[1].answer && c.gone === +sub[2] && await logged('sfx:penguin'), JSON.stringify(c));
  await ev(() => { const b = window.bot; b.walkTo(-4.6, -22.4, { max: 600 }); });
  await doRound(rs, 1, 'subtraction', false, 3);
  c = await overBridge(-30, -38.2);
  check('crossed the ice bridge after the subtraction', c.z < -37.4 && Math.abs(c.y) < 0.05, JSON.stringify(c));
  c = await floes(-42.9, -46.7, -49.9);
  check('ice floes carry Affan to the last question', c.on1 && c.on2 && c.z < -49.2 && c.hearts === 3, JSON.stringify(c));
  s = await state(page);
  check('missing-number question shown with its narration', s.question === `${rs[2].prompt}|${rs[2].detail}` && s.questionVoice === 'q_nombor_hilang', s.question);
  await ev(() => { const b = window.bot; b.walkTo(4.5, -50.4, { max: 600 }); b.walkTo(4.5, -54.3, { max: 600 }); });
  await shot(page, 'w5_2_sequence.png');
  await doRound(rs, 2, 'missing number', false, 3);
  await overBridge(-62, -69.6);
  await ev(() => window.bot.walkTo(0, -77.8, { max: 2000 }));
  s = await state(page);
  check('snow stage 2 completes with 3 stars', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars} z=${s.z.toFixed(2)}`);
  await ev(() => window.bot.step(200));
  await page.click('#btn-next');

  // ---------- Stage 3: the Snow Guardian ----------
  s = await state(page);
  check('snow stage 3 loads', s.stage === 'snow-3');
  await ev(() => { window.bot.untilMode('play'); window.bot.step(60); });
  const qs = await ev(() => window.bot.g.stage.questions.map((q) => ({ prompt: q.prompt, voice: q.voice, answer: q.answer, options: q.options.map((o) => ({ value: o.value, kind: o.face.kind })) })));
  check('the Guardian has five questions, one of each kind: letter, sum, colour, shape, animal', qs.length === 5
    && qs[0].voice === 'q_huruf_hilang' && /^q_add_\d+_\d+$/.test(qs[1].voice) && /^q_warna_/.test(qs[2].voice) && /^q_pijak_/.test(qs[3].voice) && /^q_cari_/.test(qs[4].voice)
    && qs[2].options.every((o) => o.kind === 'colour') && qs[3].options.every((o) => o.kind === 'shape') && qs[4].options.every((o) => o.kind === 'emoji')
    && qs.every((q) => q.options.filter((o) => o.value === q.answer).length === 1 && new Set(q.options.map((o) => o.value)).size === 3),
  qs.map((q) => `${q.voice}=${q.answer}`).join(' | '));
  c = await ev(() => { const st = window.bot.g.stage; return { phase: st.phase, flat: st.answerPads.every((p) => p.collider.top < 0.13), mood: st.guardian.userData.mood, lit: st.guardian.userData.lit }; });
  check('before Affan arrives the Guardian waits, his answer blocks flat in the snow', c.phase === 'approach' && c.flat && c.lit === 0, JSON.stringify(c));
  c = await floes(-10.3, -14.1, -17.3);
  check('ice floes carry Affan to the arena', c.on1 && c.on2 && c.z < -16.6 && Math.abs(c.y) < 0.05 && c.hearts === 3, JSON.stringify(c));
  await ev(() => { window.bot.walkTo(0, -22.5, { max: 600 }); window.bot.step(30); });
  c = await ev(() => { const st = window.bot.g.stage; return { phase: st.phase, caption: window.bot.g.hud.captionText, cam: st.cameraOffset.z }; });
  check('the Guardian welcomes Affan in his own voice, with his words on screen', c.phase === 'greet' && c.caption.startsWith('Selamat datang, Affan') && await logged('voice:g_selamat') && await logged('sfx:guardian'), JSON.stringify(c));
  await shot(page, 'w5_3_greet.png');
  await ev(() => { const b = window.bot; b.until(() => b.g.stage.phase === 'ask', 900); b.step(40); });
  s = await state(page);
  c = await ev(() => { const st = window.bot.g.stage; return { raised: st.answerPads.every((p) => Math.abs(p.collider.top - 0.6) < 0.001), values: st.answerPads.map((p) => p.value), cam: st.cameraOffset.z }; });
  check('first question asked: blocks rise showing the answers, camera pulls back to show the Guardian', c.raised && c.values.includes(qs[0].answer) && c.cam > 8 && s.question.startsWith(qs[0].prompt) && s.questionVoice === 'q_huruf_hilang', `${s.question} ${JSON.stringify(c)}`);
  await shot(page, 'w5_3_ask.png');

  const answer = (wrong) => ev(([wrong]) => {
    const b = window.bot, g = b.g, st = g.stage;
    const q = st.questions[st.current];
    const pad = st.answerPads.find((p) => (p.value === q.answer) !== wrong);
    b.walkTo(pad.x, pad.z + 2.3, { max: 900 });
    b.jumpTo(pad.x, pad.z);
    b.step(12);
    return { phase: st.phase, current: st.current, lit: st.guardian.userData.lit, mood: st.guardian.userData.mood, stars: g.stageStars, hearts: g.hearts, on: g.body.ground === pad.collider };
  }, [wrong]);
  c = await answer(true);
  check('wrong answer: the Guardian tilts his head kindly, nothing is lost', c.on && c.phase === 'ask' && c.lit === 0 && c.stars === 0 && c.hearts === 3 && c.mood === 'think', JSON.stringify(c));
  for (let i = 0; i < 5; i++) {
    c = await answer(false);
    check(`question ${i + 1} (${qs[i].voice}): right answer lights shard ${i + 1} of 5 and earns a star`, c.on && c.lit === i + 1 && c.stars === i + 1 && c.hearts === 3 && c.phase === (i === 4 ? 'unlock' : 'between'), JSON.stringify(c));
    if (i === 0) check('the crystal chimes, the Guardian chuckles, the penguins cheer', await logged('sfx:crystal_chime') && await count('sfx:guardian') >= 2 && await ev(() => window.bot.g.stage.penguins.every((p) => p.userData.mode === 'cheer')));
    if (i < 4) {
      await ev(() => { const b = window.bot; b.until(() => b.g.stage.phase === 'ask', 600); b.step(20); });
      c = await ev(() => { const b = window.bot, g = b.g, st = g.stage, q = st.questions[st.current]; const under = st.answerPads.find((p) => g.body.ground === p.collider); return { current: st.current, standing: !!under, underIsAnswer: !!under && under.value === q.answer, armed: under ? under.armed : null, stars: g.stageStars, text: g.hud.questionText, voice: g.questionVoice }; });
      check(`question ${i + 2} appears; the block Affan is still standing on is never the answer and does not count until he hops`, c.current === i + 1 && c.standing && !c.underIsAnswer && c.armed === false && c.stars === i + 1 && c.text.startsWith(qs[i + 1].prompt) && c.voice === qs[i + 1].voice, JSON.stringify(c));
      if (i === 1) await shot(page, 'w5_3_colour.png');
      if (i === 3) await shot(page, 'w5_3_animal.png');
    }
  }
  await ev(() => { const b = window.bot; b.until(() => b.g.stage.phase === 'finale', 600); b.step(30); });
  c = await ev(() => { const g = window.bot.g, st = g.stage; return { phase: st.phase, mood: st.guardian.userData.mood, busy: g.busy, caption: g.hud.captionText, music: g.audio.currentMusic, question: g.hud.questionText }; });
  check('finale: the Guardian lifts the freed crystal, the finale music starts, the player just watches', c.phase === 'finale' && c.mood === 'cheer' && c.busy && c.music === 'finale' && c.caption.startsWith('Hebat, Affan') && c.question === '' && await logged('sfx:crystal_magic') && await logged('voice:g_hebat'), JSON.stringify(c));
  await ev(() => window.bot.step(260));
  await shot(page, 'w5_3_finale.png');
  c = await ev(() => { const st = window.bot.g.stage; return { magic: st.magic, fog: window.bot.g.scene.fog.color.getHexString() }; });
  check('the kingdom turns magical: sky and light change and the northern lights come out', c.magic > 0.99 && c.fog === 'a99be8', JSON.stringify(c));
  await ev(() => window.bot.until(() => window.bot.g.mode === 'complete', 600));
  s = await state(page);
  check('Affan says the closing line and the stage completes', s.mode === 'complete' && s.stars === 5 && await logged('voice:final_berjaya'), `mode=${s.mode} stars=${s.stars}`);
  await ev(() => { const b = window.bot; b.until(() => b.g.hud.current === 'complete', 900); b.step(30); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'w5_3_trophy.png') });
  const trophy = await page.evaluate(() => ({ cls: document.getElementById('screen-complete').className, title: document.getElementById('trophy-title').textContent, en: document.getElementById('trophy-en').textContent, name: document.getElementById('trophy-name').textContent, shown: getComputedStyle(document.getElementById('trophy')).display, head: document.getElementById('complete-title').textContent, next: getComputedStyle(document.getElementById('btn-next')).display }));
  check('the Master Explorer Trophy is awarded', trophy.cls.includes('trophy') && trophy.shown === 'flex' && trophy.title === 'Trofi Peneroka Agung' && trophy.en === 'Master Explorer Trophy' && trophy.name === 'THE CURIOUS AFFAN' && trophy.head === 'Tahniah, Affan!' && trophy.next === 'none', JSON.stringify(trophy));
  const save = await ev(() => JSON.parse(localStorage.getItem('curious-affan-save-v1')));
  check('trophy saved; every world is finished', save.badges.includes('master-explorer') && save.badges.length === 5 && save.stagesDone.snow === 3 && save.unlockedWorld === 4, JSON.stringify({ b: save.badges, u: save.unlockedWorld }));
  await page.click('#btn-complete-menu');
  const cards2 = await page.$$eval('.world-card', (els) => els.map((e) => e.className + '|' + e.textContent));
  check('world map: all five worlds show as finished', cards2.length === 5 && cards2.every((t) => t.includes('Selesai') && !t.includes('locked')), cards2.map((t) => t.split('|')[1].slice(-12)).join(' / '));
  const missing = await ev(async () => {
    const names = ['intro_snow', 'final_berjaya', 'g_selamat', 'g_hebat', 'q_kira_penguin', ...['penguin', 'beruang', 'ikan', 'salji', 'rusa'].map((w) => 'q_awal_' + w), ...['merah', 'biru', 'kuning', 'hijau', 'oren', 'ungu'].map((w) => 'q_warna_' + w)];
    const sfx = ['step_snow', 'ice_form', 'penguin', 'guardian', 'crystal_chime', 'crystal_magic'];
    const bad = [];
    for (const n of names) { const r = await fetch(`assets/audio/voice/${n}.mp3`, { method: 'HEAD' }); if (!r.ok) bad.push(n); }
    for (const n of sfx) { const r = await fetch(`assets/audio/sfx/${n}.mp3`, { method: 'HEAD' }); if (!r.ok) bad.push(n); }
    for (const n of ['snow', 'finale']) { const r = await fetch(`assets/audio/music/${n}.mp3`, { method: 'HEAD' }); if (!r.ok) bad.push(n + ' music'); }
    return { bad, total: names.length + sfx.length + 2 };
  });
  check(`all ${missing.total} snow audio files exist`, missing.bad.length === 0, missing.bad.join(','));
  check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
