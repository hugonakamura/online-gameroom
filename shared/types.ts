// Shared wire-format types used by both server and client.
// The server's internal Player/Room interfaces (which include sessionId,
// disconnectTimer, etc.) are NOT here — only the shape that travels over
// the socket belongs in this file.

export type CoinSide = 'heads' | 'tails';
export type GamePhase = 'waiting' | 'choosing' | 'ready' | 'result';
export type GameType = 'coin_flip';

export interface PlayerState {
  id: string;
  nickname: string;
  hasChosen: boolean;
  score: number;
  /** Only populated in the 'result' phase; hidden before then to prevent cheating */
  choice?: CoinSide;
}

export interface RoomState {
  roomId: string;
  players: PlayerState[];
  gamePhase: GamePhase;
  gameType: GameType;
  flipResult?: CoinSide;
  playerCount: number;
}

export interface LobbyRoom {
  id: string;
  host: string; // nickname of the first player
  gameType: GameType;
  playerCount: number;
  gamePhase: GamePhase;
}
