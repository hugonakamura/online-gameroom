import { ComponentType } from 'react';
import { GameType } from '../../types';
import { GameViewProps } from './types';
import CoinFlip from './CoinFlip';

export const gameViews: Record<GameType, ComponentType<GameViewProps>> = {
  coin_flip: CoinFlip,
};
