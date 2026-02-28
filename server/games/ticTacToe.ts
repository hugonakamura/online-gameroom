import { TicTacToeState } from '../../shared/types';
import { Player, Room } from '../types';
import type { GameHandler } from './index';

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],             // diagonals
];

function checkResult(board: (1 | 2 | null)[]): { winner: 1 | 2 | 'draw' | null, winningLine?: number[] } {
  const winningIndices = new Set<number>();
  let winner: 1 | 2 | null = null;

  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      winner = board[a] as 1 | 2;
      winningIndices.add(a);
      winningIndices.add(b);
      winningIndices.add(c);
    }
  }

  if (winner) {
    return { winner, winningLine: Array.from(winningIndices) };
  }

  return { winner: board.every((cell) => cell !== null) ? 'draw' : null };
}

export const ticTacToeHandler: GameHandler = {
  roomIdPrefix: 'TTT',
  label: '✕ Tic-Tac-Toe',
  maxPlayers: 2,

  onGameStart(room: Room): void {
    room.gameState = {
      board: Array(9).fill(null),
      currentTurn: Math.random() < 0.5 ? 0 : 1,
      winner: null,
    } satisfies TicTacToeState;
  },

  onGameInput(room: Room, player: Player, payload: unknown): void {
    const state = room.gameState as TicTacToeState;
    if (!state) return;

    if (typeof payload !== 'object' || payload === null) return;
    const { cellIndex } = payload as { cellIndex: number };
    if (typeof cellIndex !== 'number') return;
    const playerIndex = room.players.findIndex((p) => p.id === player.id);
    if (playerIndex === -1) return;

    if (playerIndex !== state.currentTurn) return;           // not your turn
    if (cellIndex < 0 || cellIndex > 8) return;
    if (state.board[cellIndex] !== null) return;              // cell already taken

    state.board[cellIndex] = (playerIndex + 1) as 1 | 2;

    const result = checkResult(state.board);
    if (result.winner) {
      state.winner = result.winner;
      state.winningLine = result.winningLine;
      if (result.winner !== 'draw') room.players[playerIndex].score += 1;
      room.gamePhase = 'result';
    } else {
      state.currentTurn = state.currentTurn === 0 ? 1 : 0;
    }
  },

  onGameAction(_room: Room): void {
    // Unused — tic-tac-toe never reaches the 'ready' phase
  },

  onPlayAgain(room: Room, _player: Player): void {
    ticTacToeHandler.onGameStart!(room);
    room.gamePhase = 'choosing';
  },
};
