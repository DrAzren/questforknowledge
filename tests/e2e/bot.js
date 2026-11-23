// Injected into the page: drives the real game through its real input layer,
// stepping the simulation deterministically (no dependence on render speed).
window.bot = (() => {
  const g = window.__game;
  const KEYS = ['up', 'down', 'left', 'right', 'run', 'jump'];
  const release = () => KEYS.forEach((k) => g.input.setKey(k, false));
  const step = (n = 1) => { for (let i = 0; i < n; i++) g.update(1 / 60); };
  const steer = (tx, tz) => {
    const dx = tx - g.body.x, dz = tz - g.body.z;
    g.input.setKey('left', dx < -0.1); g.input.setKey('right', dx > 0.1);
    g.input.setKey('up', dz < -0.1); g.input.setKey('down', dz > 0.1);
    return Math.hypot(dx, dz);
  };
  const walkTo = (tx, tz, o = {}) => {
    const tol = o.tol ?? 0.22, max = o.max ?? 900;
    g.input.setKey('run', !!o.run);
    let i = 0, d, last = 1e9, stuck = 0;
    while ((d = steer(tx, tz)) > tol && i++ < max) {
      step();
      if (g.mode !== 'play' || g._busy) break;
      // Hop if something low is in the way.
      if (o.hop !== false) {
        if (last - d < 0.004) stuck++; else stuck = 0;
        if (stuck > 20 && g.body.grounded) { g.input.setKey('jump', true); step(2); stuck = 0; }
        if (g.body.grounded && stuck === 0) g.input.setKey('jump', false);
      }
      last = d;
    }
    release(); step(3);
    return d <= tol;
  };
  const jumpTo = (tx, tz) => {
    steer(tx, tz);
    g.input.setKey('jump', true);
    step(2);
    let i = 0;
    while (i++ < 150) { steer(tx, tz); step(); if (g.body.grounded && i > 6) break; if (g.mode !== 'play' || g._busy) break; }
    release(); step(2);
    if (g.mode === 'play' && !g._busy) walkTo(tx, tz, { max: 90, hop: false });
    return g.debugState();
  };
  const untilMode = (mode, max = 1200) => { let i = 0; while (g.mode !== mode && i++ < max) step(); return g.mode === mode; };
  const until = (fn, max = 600) => { let i = 0; while (!fn() && i++ < max) step(); return !!fn(); };
  const render = () => g.renderer.render(g.scene, g.camera);
  const freeze = () => g.renderer.setAnimationLoop(null);
  return { g, step, walkTo, jumpTo, untilMode, until, release, render, freeze };
})();
