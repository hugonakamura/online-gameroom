import { GameType } from '../../shared/types';
import { Player, Room } from '../types';
import { coinFlipHandler } from './coinFlip';

export interface GameHandler {
  onMakeChoice(room: Room, player: Player, payload: unknown): void;
  onPrimaryAction(room: Room, player: Player): void;
  onPlayAgain(room: Room): void;
}

export const gameHandlers: Record<GameType, GameHandler> = {
  coin_flip: coinFlipHandler,
};
