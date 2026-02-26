import { CoinSide } from '../../shared/types';
import { Player, Room } from '../types';
import type { GameHandler } from './index';

export const coinFlipHandler: GameHandler = {
  onGameInput(room: Room, player: Player, payload: unknown): void {
    const { choice } = payload as { choice: CoinSide };
    if (choice !== 'heads' && choice !== 'tails') return;

    player.choice = choice;

    const allChosen = room.players.length >= 2 && room.players.every((p) => p.choice);
    room.gamePhase = allChosen ? 'ready' : 'choosing';
  },

  onGameAction(room: Room): void {
    room.flipResult = Math.random() < 0.5 ? 'heads' : 'tails';
    room.gamePhase = 'result';

    room.players
      .filter((p) => p.choice === room.flipResult)
      .forEach((p) => { p.score += 1; });
  },

  onPlayAgain(room: Room): void {
    room.players.forEach((p) => { delete p.choice; });
    room.flipResult = undefined;
    room.gamePhase = 'choosing';
  },
};
