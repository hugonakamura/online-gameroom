import { GameType, GameOption } from '../../shared/types';
import { Player, Room } from '../types';
import { coinFlipHandler } from './coinFlip';
import { ticTacToeHandler } from './ticTacToe';
import { rpsHandler } from './rps';
import { highLowHandler } from './highLow';

export interface GameHandler {
  /** Prefix used when auto-generating room IDs (e.g. 'FLIP' → 'FLIP-A3K9M') */
  roomIdPrefix: string;
  /** Human-readable label shown in the lobby and in-room game switcher */
  label: string;
  /** Maximum number of players allowed in the room (undefined = no limit) */
  maxPlayers?: number;
  /** Minimum number of players required before a round starts (defaults to 2) */
  minPlayers?: number;
  /** Called when a game round starts or resets (join triggers start, leave triggers reset) */
  onGameStart?(room: Room): void;
  /** Called when a player submits their input for the round (choice, bet, move, etc.) */
  onGameInput(room: Room, player: Player, payload: unknown): void;
  /** Called when a player triggers the primary game action (flip, roll, reveal, etc.) */
  onGameAction(room: Room, player: Player): void;
  /** Called when a player signals they are ready for the next round */
  onPlayAgain(room: Room, player: Player): void;
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
  highlow: highLowHandler,
};

/** Returns the ordered list of available games for the client UI. */
export function getGameOptions(): GameOption[] {
  return (Object.entries(gameHandlers) as [GameType, GameHandler][]).map(([value, handler]) => ({
    value,
    label: handler.label,
    ...(handler.maxPlayers !== undefined ? { maxPlayers: handler.maxPlayers } : {}),
  }));
}
