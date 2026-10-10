import './ui/fonts.css';
import './ui/style.css';
import { Game } from './game';

const game = new Game();
(window as unknown as { __arena: Game }).__arena = game;
game.boot().catch((e) => {
  console.error(e);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#fff;padding:20px;white-space:pre-wrap';
  pre.textContent = `시작할 수 없습니다\n${e instanceof Error ? e.message : String(e)}`;
  document.body.append(pre);
});
