// Shared wire-format types used by both server and client.
// The server's internal Player/Room interfaces (which include sessionId,
// disconnectTimer, etc.) are NOT here — only the shape that travels over
// the socket belongs in this file.

export type CoinSide = 'heads' | 'tails';
export type GamePhase = 'waiting' | 'choosing' | 'ready' | 'result';
export type GameType = 'coin_flip' | 'tictactoe' | 'rps' | 'highlow';

export interface CoinFlipState {
  /** Indexed by player position in room.players (same order as RoomState.players) */
  choices: (CoinSide | null)[];
  flipResult?: CoinSide;
}

/** 'hidden' is a server-side sentinel: the opponent has locked in but their choice is not revealed yet */
export type RPSChoice = 'rock' | 'paper' | 'scissors' | 'hidden';

export interface RPSState {
  /** Indexed by player position in room.players */
  choices: (RPSChoice | null)[];
  /** 0 = player at index 0 won, 1 = player at index 1 won, 'draw', null = in progress */
  winner: 0 | 1 | 'draw' | null;
}

export interface TicTacToeState {
  board: (1 | 2 | null)[];  // 9 cells; 1 = player index 0 (X), 2 = player index 1 (O)
  currentTurn: 0 | 1;        // index into roomState.players
  winner: 1 | 2 | 'draw' | null;
}

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type CardRank = 2|3|4|5|6|7|8|9|10|11|12|13|14;
export interface Card { suit: Suit; rank: CardRank; }

/** 'hidden' = opponent has locked in but their choice is not revealed yet */
export type HighLowChoice = 'higher' | 'lower' | 'hidden';

export interface HighLowState {
  currentCard: Card;
  nextCard: Card | null;             // null during choosing; revealed in result
  choices: (HighLowChoice | null)[]; // opponent masked as 'hidden' in choosing phase
  outcome: 'higher' | 'lower' | 'equal' | null;
  multiplier: number;                // 1 normally; doubles on push; resets after scoring
  cardsRemaining: number;            // sanitized deck.length sent to clients
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
