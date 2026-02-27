// Shared wire-format types used by both server and client.
// The server's internal Player/Room interfaces (which include sessionId,
// disconnectTimer, etc.) are NOT here — only the shape that travels over
// the socket belongs in this file.

export type CoinSide = 'heads' | 'tails';
export type GamePhase = 'waiting' | 'choosing' | 'ready' | 'result';
export type GameType = 'coin_flip' | 'tictactoe';

export interface CoinFlipState {
  /** Indexed by player position in room.players (same order as RoomState.players) */
  choices: (CoinSide | null)[];
  flipResult?: CoinSide;
}

export interface TicTacToeState {
  board: (1 | 2 | null)[];  // 9 cells; 1 = player index 0 (X), 2 = player index 1 (O)
  currentTurn: 0 | 1;        // index into roomState.players
  winner: 1 | 2 | 'draw' | null;
}

export interface PlayerState {
  id: string;
  nickname: string;
  hasChosen: boolean;
  score: number;
}

export interface RoomState {
  roomId: string;
  players: PlayerState[];
  gamePhase: GamePhase;
  gameType: GameType;
  gameState?: unknown;
  playerCount: number;
}

export interface LobbyRoom {
  id: string;
  host: string; // nickname of the first player
  gameType: GameType;
  playerCount: number;
  gamePhase: GamePhase;
}
