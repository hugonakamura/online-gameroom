export type GamePhase = 'waiting' | 'choosing' | 'ready' | 'result';
export type CoinSide = 'heads' | 'tails';

export interface PlayerState {
  id: string;
  nickname: string;
  hasChosen: boolean;
  /** Only populated in the 'result' phase; hidden before then to prevent cheating */
  choice?: CoinSide;
}

export interface RoomState {
  players: PlayerState[];
  gamePhase: GamePhase;
  flipResult?: CoinSide;
  playerCount: number;
}
