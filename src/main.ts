import './style.css';
import { Game } from './engine/Game';

const mount = document.getElementById('app')!;

async function boot(): Promise<void> {
  // In-world labels are drawn to canvases, so the rounded font must be ready first.
  try {
    await Promise.race([
      document.fonts.load('800 48px "Baloo 2"'),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* fall back to the system rounded font */
  }
  const game = new Game(mount);
  (window as unknown as { __game: Game }).__game = game;
  game.start();
}

void boot();
