const { chromium } = require('playwright');
exports.open = async (viewport = { width: 1280, height: 720 }, opts = {}) => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(process.env.GAME_URL || 'http://localhost:4173/');
  await page.waitForFunction(() => window.__game && window.__game.frames > 10, null, { timeout: 30000 });
  return { browser, page, errors };
};
exports.state = (page) => page.evaluate(() => { const s = window.__game.debugState(); delete s.save; return s; });
// Freeze the render loop and render one frame from a custom camera.
exports.shotFrom = async (page, pos, look, file) => {
  await page.evaluate(([p, l]) => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);
    g.camera.position.set(p[0], p[1], p[2]);
    g.camera.lookAt(l[0], l[1], l[2]);
    g.renderer.render(g.scene, g.camera);
  }, [pos, look]);
  await page.screenshot({ path: path.join(OUT, file) });
};
