import { GameType } from '../../shared/types';
import { Player, Room } from '../types';
import { coinFlipHandler } from './coinFlip';
import { ticTacToeHandler } from './ticTacToe';
import { rpsHandler } from './rps';

export interface GameHandler {
  /** Prefix used when auto-generating room IDs (e.g. 'FLIP' → 'FLIP-A3K9M') */
  roomIdPrefix: string;
  /** Maximum number of players allowed in the room (undefined = no limit) */
  maxPlayers?: number;
  /** Called when a game round starts or resets (join triggers start, leave triggers reset) */
  onGameStart?(room: Room): void;
  /** Called when a player submits their input for the round (choice, bet, move, etc.) */
  onGameInput(room: Room, player: Player, payload: unknown): void;
  /** Called when a player triggers the primary game action (flip, roll, reveal, etc.) */
  onGameAction(room: Room, player: Player): void;
  /** Called when all players want to play another round */
  onPlayAgain(room: Room): void;
  /**
   * Optional: return a sanitized copy of gameState for a specific player.
   * Implement this for games where players must not see each other's choices
   * before the result is revealed (e.g. RPS). If omitted, the full gameState
   * is broadcast to all players.
   */
  sanitizeGameState?(room: Room, playerId: string): unknown;
}

export const gameHandlers: Record<GameType, GameHandler> = {
  coin_flip: coinFlipHandler,
  tictactoe: ticTacToeHandler,
  rps: rpsHandler,
};
