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
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.frames > 10);
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8') });
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // ---------- Menu ----------
  let s = await state(page);
  check('menu shown on boot', s.mode === 'menu' && s.screen === 'menu');
  check('Play label is "Main" on a fresh save', (await page.textContent('#btn-play')).includes('Main'));
  await page.click('#btn-worlds');
  const cards = await page.$$eval('.world-card', (els) => els.map((e) => e.className));
  check('five world portals', cards.length === 5);
  check('worlds 2-5 locked at start', cards.slice(1).every((c) => c.includes('locked')) && !cards[0].includes('locked'));
  await page.click('.world-card.world-desert');
  check('locked world cannot be entered', (await state(page)).mode === 'menu');
  await page.click('#btn-worlds-back');
  await page.click('#btn-settings');
  check('settings screen opens', (await state(page)).screen === 'settings');
  await page.click('#btn-settings-back');

  // ---------- Stage 1 ----------
  await page.click('#btn-play');
  await ev(() => window.bot.freeze());
  s = await state(page);
  check('stage 1 starts with opening shots', s.mode === 'intro' && s.stage === 'jungle-1');
  check('intro ends in play mode', await ev(() => window.bot.untilMode('play')));
  s = await state(page);
  check('3 hearts at start', s.hearts === 3);
  check('Affan speaks the opening line', await ev(() => window.bot.g.audio.log.includes('voice:intro_jungle')));
  check('jungle music requested', s.music === 'jungle');
  await ev(() => window.bot.step(240));

  const rows = await ev(() => window.bot.g.stage.rows.map((r) => ({ answer: r.question.answer, prompt: r.question.prompt, stones: r.stones.map((st) => ({ x: st.x, z: st.z, value: st.value })) })));
  check('3 addition questions, each with its answer on exactly one stone', rows.length === 3 && rows.every((r) => r.stones.filter((st) => st.value === r.answer).length === 1), rows.map((r) => r.prompt).join(' | '));

  // Hearts run out -> stage restarts kindly with full hearts.
  for (let i = 0; i < 3; i++) {
    await ev(() => { window.bot.walkTo(1.5, -5.2); window.bot.walkTo(1.5, -8, { max: 120, hop: false }); window.bot.until(() => window.bot.g._busy, 120); });
    s = await state(page);
    if (i < 2) {
      check(`fall ${i + 1}: lose one heart`, s.hearts === 2 - i, `hearts=${s.hearts}`);
      await ev(() => window.bot.until(() => !window.bot.g._busy, 200));
      s = await state(page);
      check(`fall ${i + 1}: respawned at checkpoint on land`, Math.abs(s.z - 4) < 0.3 && Math.abs(s.x) < 0.3 && s.y > -0.1, `x=${s.x.toFixed(2)} z=${s.z.toFixed(2)}`);
      await ev(() => window.bot.step(20));
    } else {
      await ev(() => window.bot.until(() => !window.bot.g._busy && window.bot.g.hearts === 3, 300));
      s = await state(page);
      check('third fall: stage restarts with 3 hearts (no game over)', s.hearts === 3 && s.mode === 'play' && s.stage === 'jungle-1', `hearts=${s.hearts} mode=${s.mode}`);
    }
  }
  check('splash sound played on falling in water', await ev(() => window.bot.g.audio.log.includes('sfx:splash')));

  const rows2 = await ev(() => window.bot.g.stage.rows.map((r) => ({ answer: r.question.answer, stones: r.stones.map((st) => ({ x: st.x, z: st.z, value: st.value })) })));
  const bankZ = [-5.55, -13.55, -21.55];
  const landZ = [-12.6, -20.6, -28.6];
  for (let r = 0; r < 3; r++) {
    const row = rows2[r];
    const right = row.stones.find((st) => st.value === row.answer);
    const wrong = row.stones.find((st) => st.value !== row.answer);
    if (r === 0) {
      // Wrong stone: warning wobble, sinks, splash, heart lost, second chance.
      await ev(([x, z]) => window.bot.walkTo(x, z), [wrong.x, bankZ[r]]);
      s = await state(page);
      check('question panel appears at the river', s.question.includes('berapakah'), s.question);
      await shot(page, 's1_question.png');
      await ev(([x, z]) => window.bot.jumpTo(x, z), [wrong.x, wrong.z]);
      const st = await ev((v) => window.bot.g.stage.rows[0].stones.find((x) => x.value === v).state, wrong.value);
      check('wrong stone wobbles as a warning first', st === 'wobble', st);
      check('Affan shows the surprised animation', (await state(page)).animation === 'surprised');
      await shot(page, 's1_wobble.png');
      await ev(() => window.bot.until(() => window.bot.g._busy, 200));
      s = await state(page);
      check('wrong stone sinks -> fall -> lose a heart', s.hearts === 2, `hearts=${s.hearts}`);
      await ev(() => window.bot.until(() => !window.bot.g._busy, 200));
      const st2 = await ev((v) => window.bot.g.stage.rows[0].stones.find((x) => x.value === v).state, wrong.value);
      check('sunk stone stays gone (fewer choices on the second try)', st2 === 'sunk' || st2 === 'sinking', st2);
      check('wrong + sink sounds played', await ev(() => ['sfx:wrong', 'sfx:stone_sink'].every((n) => window.bot.g.audio.log.includes(n))));
    }
    await ev(([x, z]) => window.bot.walkTo(x, z), [right.x, bankZ[r]]);
    const before = (await state(page)).stars;
    s = await ev(([x, z]) => window.bot.jumpTo(x, z), [right.x, right.z]);
    check(`row ${r + 1}: correct stone holds and awards a star`, s.stars === before + 1 && s.grounded && Math.abs(s.y) < 0.1, `stars=${s.stars} y=${s.y.toFixed(2)}`);
    if (r === 0) { check('correct sound + praise', await ev(() => window.bot.g.audio.log.includes('sfx:correct'))); check('celebrate animation', s.animation === 'celebrate', s.animation); await shot(page, 's1_correct.png'); }
    await ev(([x, z]) => window.bot.walkTo(x, z - 0.6, { hop: false }), [right.x, right.z]);
    s = await ev(([x, z]) => window.bot.jumpTo(x, z), [right.x, landZ[r]]);
    check(`row ${r + 1}: reached next safe ground`, s.grounded && Math.abs(s.y) < 0.05 && s.z < right.z - 1.5, `z=${s.z.toFixed(2)} y=${s.y.toFixed(2)}`);
    if (r < 2) {
      await ev(([z]) => window.bot.walkTo(0, z), [landZ[r]]);
      const cp = await ev(() => window.bot.g.checkpoint.z);
      check(`checkpoint ${r + 1} activated`, Math.abs(cp - landZ[r]) < 0.01, `cp.z=${cp}`);
    }
  }
  s = await state(page);
  check('hearts kept after correct answers', s.hearts === 2);
  await ev(() => { window.bot.walkTo(0, -30); window.bot.walkTo(0, -37.6, { max: 600 }); });
  s = await state(page);
  check('coins collected and counted', s.coins >= 4, `coins=${s.coins}`);
  check('reaching the arch completes the stage', s.mode === 'complete', s.mode);
  check('victory animation + level complete sound', s.animation === 'victory' && await ev(() => window.bot.g.audio.log.includes('sfx:level_complete')));
  await ev(() => window.bot.step(200));
  s = await state(page);
  check('stage complete screen with 3 stars', s.screen === 'complete' && s.stars === 3, `stars=${s.stars}`);
  await page.screenshot({ path: path.join(OUT, 's1_complete.png') });
  const save1 = await ev(() => JSON.parse(localStorage.getItem('curious-affan-save-v1')));
  check('progress saved to browser storage', save1 && save1.stagesDone.jungle === 1 && save1.stageStars['jungle-1'] === 3, JSON.stringify(save1 && save1.stagesDone));

  // ---------- Stage 2 ----------
  await page.click('#btn-next');
  s = await state(page);
  check('next stage loads: Huruf Yang Hilang', s.stage === 'jungle-2' && s.mode === 'intro');
  await ev(() => window.bot.untilMode('play'));
  await ev(() => window.bot.step(120));
  const rounds = await ev(() => window.bot.g.stage.rounds.map((r) => ({ answer: r.question.answer, detail: r.question.detail, gapMaxZ: r.gapMaxZ, options: r.options.map((o) => ({ letter: o.letter, x: o.x, z: o.z, top: o.top })) })));
  check('3 missing-letter rounds; first is A-E', rounds.length === 3 && rounds[0].detail.replace(/[ ?]/g, '').split('').every((c) => 'ABCDE'.includes(c)), rounds.map((r) => r.detail + '=' + r.answer).join(' | '));
  const climb = async (o) => {
    if (o.top > 0.9) {
      await ev(([x, z]) => window.bot.walkTo(x, z + 3.0), [o.x, o.z]);
      await ev(([x, z]) => window.bot.jumpTo(x, z + 1.5), [o.x, o.z]);
      return ev(([x, z]) => window.bot.jumpTo(x, z), [o.x, o.z]);
    }
    await ev(([x, z]) => window.bot.walkTo(x, z + 2.0), [o.x, o.z]);
    return ev(([x, z]) => window.bot.jumpTo(x, z), [o.x, o.z]);
  };
  const pre = [null, async () => { await ev(() => { window.bot.walkTo(0, -14.2); window.bot.jumpTo(0, -16.6); }); }, async () => { await ev(() => { window.bot.walkTo(0, -35.2); window.bot.jumpTo(0, -37.6); window.bot.walkTo(4.8, -38.2); window.bot.walkTo(4.8, -40.6); }); }];
  for (let r = 0; r < 3; r++) {
    const round = rounds[r];
    if (pre[r]) await pre[r]();
    if (r > 0) { s = await state(page); check(`round ${r + 1}: got past the logs`, s.z < (r === 1 ? -15.8 : -39.9) && s.hearts === 3, `z=${s.z.toFixed(2)}`); }
    s = await state(page);
    if (r === 0) { check('letter question panel shown', s.question.includes('Huruf apakah') && s.question.includes('?'), s.question); await shot(page, 's2_question.png'); }
    check(`round ${r + 1}: bridge is not walkable before answering`, await ev((i) => window.bot.g.stage.rounds[i].bridge.enabled === false, r));
    if (r === 0) {
      const wrong = round.options.find((o) => o.letter !== round.answer);
      s = await climb(wrong);
      check('wrong letter: kind feedback, no heart lost, no star', s.hearts === 3 && s.stars === 0 && await ev(() => window.bot.g.audio.log.includes('sfx:wrong')), `hearts=${s.hearts}`);
      check('wrong letter is set aside', await ev((l) => ['wrong', 'gone'].includes(window.bot.g.stage.rounds[0].options.find((o) => o.letter === l).state), wrong.letter));
      await ev(([x, z]) => window.bot.walkTo(x, z + 2.6), [wrong.x, wrong.z]);
    }
    const right = round.options.find((o) => o.letter === round.answer);
    const before = (await state(page)).stars;
    s = await climb(right);
    check(`round ${r + 1}: correct letter "${round.answer}" awards a star and builds the bridge`, s.stars === before + 1 && await ev((i) => window.bot.g.stage.rounds[i].bridge.enabled, r), `stars=${s.stars}`);
    await ev(() => window.bot.step(90));
    if (r === 0) await shot(page, 's2_bridge.png');
    await ev(([x, z, gz]) => { window.bot.walkTo(x, z + 2.6); window.bot.walkTo(0, gz + 1.2); window.bot.walkTo(0, gz - 7.4, { hop: false }); }, [right.x, right.z, round.gapMaxZ]);
    s = await state(page);
    check(`round ${r + 1}: crossed the rebuilt bridge`, s.z < round.gapMaxZ - 6.5 && s.hearts === 3 && Math.abs(s.y) < 0.05, `z=${s.z.toFixed(2)} y=${s.y.toFixed(2)}`);
  }
  await ev(() => { window.bot.walkTo(0, -56.3); window.bot.jumpTo(0, -58); window.bot.walkTo(0, -62.6, { max: 400 }); });
  s = await state(page);
  check('stage 2 completes', s.mode === 'complete' && s.stars === 3, `mode=${s.mode} stars=${s.stars}`);
  await ev(() => window.bot.step(200));
  await page.click('#btn-next');

  // ---------- Stage 3 ----------
  s = await state(page);
  check('stage 3 loads: Harta Karun Hutan', s.stage === 'jungle-3');
  await ev(() => window.bot.untilMode('play'));
  await ev(() => window.bot.step(120));
  await shot(page, 's3_start.png');
  const goGem = (i) => ev((idx) => {
    const b = window.bot, st = b.g.stage, gem = st.gems[idx];
    const x = gem.obj.position.x, z = gem.obj.position.z, h = gem.baseY - 0.75;
    if (h > 1) { b.walkTo(x, z + 3.3); b.jumpTo(x, z + 1.9); b.jumpTo(x, z); }
    else if (h > 0.5) { b.walkTo(x, z + 2.15); b.jumpTo(x, z); }
    else b.walkTo(x, z, { tol: 0.3, max: 700 });
    b.step(5);
    if (b.g.body.y > 0.3) { b.walkTo(x, z + 3.2, { max: 200 }); }
    return { taken: gem.taken, collected: st.collected, task: st.taskIndex };
  }, i);
  for (let t = 0; t < 3; t++) {
    const info = await ev(() => { const st = window.bot.g.stage; const task = st.tasks[st.taskIndex]; return { index: st.taskIndex, kind: task.kind, prompt: task.prompt, need: task.need, gems: st.gems.map((gm, i) => ({ i, match: task.matches(gm), h: gm.baseY - 0.75 })) }; });
    check(`task ${t + 1} (${info.kind}) is offered: "${info.prompt}"`, info.index === t && info.gems.filter((x) => x.match).length >= info.need, `gems=${info.gems.length}`);
    s = await state(page);
    check(`task ${t + 1}: panel shows the task and progress`, s.question.includes('Kumpul') && s.question.includes(`0 / ${info.need}`), s.question);
    if (t === 0) {
      const wrong = info.gems.find((x) => !x.match && x.h === 0);
      const r = await goGem(wrong.i);
      s = await state(page);
      check('wrong gem: not collected, no heart lost', !r.taken && r.collected === 0 && s.hearts === 3);
    }
    let guard = 0;
    while (guard++ < 12) {
      const cur = await ev(() => { const st = window.bot.g.stage; const task = st.tasks[st.taskIndex]; return { t: st.taskIndex, between: st.between, collected: st.collected, need: task.need, next: st.gems.map((gm, i) => ({ i, ok: !gm.taken && task.matches(gm), h: gm.baseY - 0.75 })).filter((x) => x.ok).sort((a, b) => a.h - b.h)[0] }; });
      if (cur.t !== t || cur.between > 0 || cur.collected >= cur.need || !cur.next) break;
      await goGem(cur.next.i);
      if (t === 0 && guard === 1) await shot(page, 's3_collect.png');
    }
    s = await state(page);
    check(`task ${t + 1}: collecting the right items completes it and awards a star`, s.stars === t + 1, `stars=${s.stars} q=${s.question}`);
    await ev(() => window.bot.until(() => window.bot.g.stage.between <= 0, 200));
    await ev(() => window.bot.step(10));
  }
  check('chest becomes ready after the three tasks', await ev(() => window.bot.g.stage.chestState === 'ready'));
  await ev(() => window.bot.walkTo(0, -6.8, { max: 900 }));
  s = await state(page);
  check('walking to the chest opens the quiz', await page.isVisible('#quiz.visible'), `z=${s.z.toFixed(2)}`);
  const quiz = await ev(() => { const q = window.bot.g.hud.quizQuestion; return { answer: q.answer, options: q.options, detail: q.detail }; });
  check('quiz: counting question with matching picture count', quiz.detail.split(' ').length === quiz.answer, `${quiz.detail} -> ${quiz.answer}`);
  await page.screenshot({ path: path.join(OUT, 's3_quiz.png') });
  const wrongIdx = quiz.options.findIndex((o) => o !== quiz.answer);
  await page.click(`#quiz-options .quiz-option:nth-child(${wrongIdx + 1})`);
  check('quiz wrong answer (tap/click): button set aside, quiz stays open, no heart lost', await page.isDisabled(`#quiz-options .quiz-option:nth-child(${wrongIdx + 1})`) && await page.isVisible('#quiz.visible') && (await state(page)).hearts === 3);
  await page.keyboard.press(`Digit${quiz.options.indexOf(quiz.answer) + 1}`);
  await page.waitForTimeout(1100);
  check('quiz correct answer (keyboard number key) closes the quiz', !(await page.isVisible('#quiz.visible')));
  await page.waitForTimeout(1600);
  s = await state(page);
  check('chest opens and the stage completes', s.mode === 'complete' && await ev(() => window.bot.g.stage.chestState === 'open'), s.mode);
  await ev(() => window.bot.step(200));
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, 's3_badge.png') });
  check('world complete screen shows the Jungle Explorer badge', (await page.textContent('#badge-name')).includes('Peneroka Hutan') && await page.isVisible('#complete-badge'));
  const save3 = await ev(() => JSON.parse(localStorage.getItem('curious-affan-save-v1')));
  check('badge saved and World 2 unlocked', save3.badges.includes('jungle-explorer') && save3.unlockedWorld === 1 && save3.stagesDone.jungle === 3, JSON.stringify({ b: save3.badges, u: save3.unlockedWorld }));
  check('achievement sound played', await ev(() => window.bot.g.audio.log.includes('sfx:achievement')));
  await page.click('#btn-complete-menu');
  const cards2 = await page.$$eval('.world-card', (els) => els.map((e) => e.className));
  check('world map: World 2 no longer locked, Worlds 3-5 still locked', !cards2[1].includes('locked') && cards2.slice(2).every((c) => c.includes('locked')));
  await page.screenshot({ path: path.join(OUT, 'worlds_after.png') });

  // ---------- Persistence across reload ----------
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.frames > 10);
  check('after reload: progress kept, Play says "Sambung"', (await page.textContent('#btn-play')).includes('Sambung') && (await ev(() => window.__game.debugState().save.badges.length)) === 1);

  check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' ; '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(path.join(OUT, 'play_results.json'), JSON.stringify(results, null, 1));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
