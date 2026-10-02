import Phaser from 'phaser';
import type { GameState } from '../state/game-state';
import { FactoryScene } from './factory-scene';
export function createGame(host: HTMLElement, state: GameState): { game: Phaser.Game; scene: FactoryScene } {
  const scene = new FactoryScene(state, host);
  const game = new Phaser.Game({ type: Phaser.AUTO, parent: host, width: host.clientWidth || 640, height: host.clientHeight || 480, backgroundColor: '#10191f', antialias: true, scene: [scene], input: { mouse: { preventDefaultWheel: true } }, audio: { noAudio: true }, banner: false });
  return { game, scene };
}
