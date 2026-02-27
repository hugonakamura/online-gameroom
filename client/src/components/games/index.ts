import { ComponentType, lazy } from 'react';
import { GameType } from '../../types';
import { GameViewProps } from './types';

export const gameViews: Record<GameType, ComponentType<GameViewProps>> = {
  coin_flip: lazy(() => import('./CoinFlip')),
  tictactoe: lazy(() => import('./TicTacToe')),
  rps:       lazy(() => import('./RPS')),
  highlow:   lazy(() => import('./HighLow')),
};
