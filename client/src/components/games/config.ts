import { GameType } from '../../types';

export const gameConfigs: Record<GameType, { revealDelayMs: number }> = {
  coin_flip: { revealDelayMs: 3000 },
  tictactoe: { revealDelayMs: 0 },
  rps: { revealDelayMs: 1800 },
  highlow: { revealDelayMs: 1500 },
};
