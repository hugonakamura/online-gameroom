import { RoomState } from '../../types';

export interface GameViewProps {
  roomState: RoomState;
  socketId: string;
  emit: (event: string, payload?: unknown) => void;
}
