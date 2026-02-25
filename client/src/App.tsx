import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import JoinRoom from './components/JoinRoom';
import GameRoom from './components/GameRoom';
import { RoomState, CoinSide } from './types';

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Local choice tracked client-side so the UI can highlight the selected button
  // without revealing the choice to the opponent via the server state.
  const [myLocalChoice, setMyLocalChoice] = useState<CoinSide | null>(null);

  useEffect(() => {
    // In dev, Vite proxies /socket.io → localhost:3001 (see vite.config.ts).
    // In production, the server serves the client at the same origin.
    const s = io();
    setSocket(s);

    s.on('connect', () => setIsConnected(true));

    s.on('disconnect', () => {
      setIsConnected(false);
      setInRoom(false);
      setRoomState(null);
      setMyLocalChoice(null);
    });

    s.on('room_update', (state: RoomState) => {
      setRoomState(state);
      setInRoom(true);
      setJoinError(null);
    });

    s.on('join_error', ({ message }: { message: string }) => {
      setJoinError(message);
    });

    return () => { s.disconnect(); };
  }, []);

  const handleJoin = useCallback(
    (rid: string, nick: string) => {
      if (!socket) return;
      setRoomId(rid);
      socket.emit('join_room', { roomId: rid, nickname: nick });
    },
    [socket],
  );

  const handleChoice = useCallback(
    (choice: CoinSide) => {
      socket?.emit('make_choice', { choice });
      setMyLocalChoice(choice);
    },
    [socket],
  );

  const handleFlip = useCallback(() => {
    socket?.emit('flip_request');
  }, [socket]);

  const handlePlayAgain = useCallback(() => {
    socket?.emit('play_again');
    setMyLocalChoice(null); // Reset local highlight immediately
  }, [socket]);

  if (!isConnected) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Connecting to server…</p>
      </div>
    );
  }

  if (!inRoom || !roomState) {
    return <JoinRoom onJoin={handleJoin} error={joinError} />;
  }

  return (
    <GameRoom
      roomId={roomId}
      socketId={socket?.id ?? ''}
      roomState={roomState}
      myLocalChoice={myLocalChoice}
      onChoice={handleChoice}
      onFlip={handleFlip}
      onPlayAgain={handlePlayAgain}
    />
  );
}

export default App;
