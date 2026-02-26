import { GameType } from '../../shared/types';
import { Player, Room } from '../types';
import { coinFlipHandler } from './coinFlip';

export interface GameHandler {
  /** Called when a player submits their input for the round (choice, bet, etc.) */
  onGameInput(room: Room, player: Player, payload: unknown): void;
  /** Called when a player triggers the primary game action (flip, roll, reveal, etc.) */
  onGameAction(room: Room, player: Player): void;
  /** Called when all players want to play another round */
  onPlayAgain(room: Room): void;
}

export const gameHandlers: Record<GameType, GameHandler> = {
  coin_flip: coinFlipHandler,
};
