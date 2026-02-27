import { CoinFlipState, CoinSide } from '../../shared/types';
import { Player, Room } from '../types';
import type { GameHandler } from './index';

export const coinFlipHandler: GameHandler = {
  roomIdPrefix: 'FLIP',
  minPlayers: 2,

  onGameStart(room: Room): void {
    room.players.forEach((p) => { p.hasActed = false; });
    room.gameState = {
      choices: Array(room.players.length).fill(null),
    } satisfies CoinFlipState;
  },

  onGameInput(room: Room, player: Player, payload: unknown): void {
    const state = room.gameState as CoinFlipState;
    const { choice } = payload as { choice: CoinSide };
    if (choice !== 'heads' && choice !== 'tails') return;

    const idx = room.players.findIndex((p) => p.id === player.id);
    state.choices[idx] = choice;
    player.hasActed = true;

    const allChosen = state.choices.every((c) => c !== null);
    room.gamePhase = allChosen ? 'ready' : 'choosing';
  },

  onGameAction(room: Room): void {
    const state = room.gameState as CoinFlipState;
    state.flipResult = Math.random() < 0.5 ? 'heads' : 'tails';
    room.gamePhase = 'result';

    room.players.forEach((p, i) => {
      if (state.choices[i] === state.flipResult) p.score += 1;
    });
  },

  onPlayAgain(room: Room, _player: Player): void {
    coinFlipHandler.onGameStart!(room);
    room.gamePhase = 'choosing';
  },
};
