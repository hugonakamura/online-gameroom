import { RPSChoice, RPSState } from '../../shared/types';
import { Player, Room } from '../types';
import type { GameHandler } from './index';

const BEATS: Record<RPSChoice, RPSChoice> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
};

export const rpsHandler: GameHandler = {
  roomIdPrefix: 'RPS',
  maxPlayers: 2,

  onGameStart(room: Room): void {
    room.players.forEach((p) => { p.hasActed = false; });
    room.gameState = {
      choices: Array(room.players.length).fill(null),
      winner: null,
    } satisfies RPSState;
  },

  onGameInput(room: Room, player: Player, payload: unknown): void {
    const state = room.gameState as RPSState;
    const { choice } = payload as { choice: RPSChoice };
    if (!Object.keys(BEATS).includes(choice)) return;

    const idx = room.players.findIndex((p) => p.id === player.id);
    if (state.choices[idx] !== null) return; // already locked in

    state.choices[idx] = choice;
    player.hasActed = true;

    // Reveal immediately once both players have chosen
    if (state.choices.every((c) => c !== null)) {
      const [c0, c1] = state.choices as [RPSChoice, RPSChoice];
      if (c0 === c1) {
        state.winner = 'draw';
      } else if (BEATS[c0] === c1) {
        state.winner = 0;
        room.players[0].score += 1;
      } else {
        state.winner = 1;
        room.players[1].score += 1;
      }
      room.gamePhase = 'result';
    }
  },

  onGameAction(_room: Room): void {
    // Unused — RPS resolves automatically when both players choose
  },

  onPlayAgain(room: Room): void {
    rpsHandler.onGameStart!(room);
    room.gamePhase = 'choosing';
  },
};
