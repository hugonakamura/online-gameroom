import { ComponentType } from 'react';
import { GameType } from '../../types';
import { GameViewProps } from './types';
import CoinFlip from './CoinFlip';
import TicTacToe from './TicTacToe';
import RPS from './RPS';

export const gameViews: Record<GameType, ComponentType<GameViewProps>> = {
  coin_flip: CoinFlip,
  tictactoe: TicTacToe,
  rps: RPS,
};
