import { GamePhase, GameType } from '../shared/types';

export interface Player {
  id: string;       // current socket.id — changes on reconnect
  sessionId: string; // persistent client identity (stored in localStorage)
  nickname: string;
  score: number;
  hasActed?: boolean; // set by game handler in onGameInput; cleared in onGameStart
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

export interface Room {
  id: string;
  players: Player[];
  gamePhase: GamePhase;
  gameType: GameType;
  gameState?: unknown;
}
