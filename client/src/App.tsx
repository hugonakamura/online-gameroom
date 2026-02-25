import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import JoinRoom from './components/JoinRoom';
import GameRoom from './components/GameRoom';
import { RoomState, CoinSide, LobbyRoom, GameType } from './types';

// ── Persistent session identity ────────────────────────────────────────────────
// A UUID stored in localStorage that survives page refreshes and socket
// reconnects. The server uses it to restore a player's slot after a flicker.
function getSessionId(): string {
  const KEY = 'flip_socket_session';
  let id = localStorage.getItem(KEY);
  if (!id) {
    // crypto.randomUUID() requires HTTPS — use a fallback that works over HTTP too
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    localStorage.setItem(KEY, id);
  }
  return id;
}

function saveSession(roomId: string, nickname: string) {
  localStorage.setItem('flip_socket_room', roomId);
  localStorage.setItem('flip_socket_nickname', nickname);
}

function clearSession() {
  localStorage.removeItem('flip_socket_room');
  // Nickname is intentionally kept so the user doesn't have to re-type it.
}

// ── Component ──────────────────────────────────────────────────────────────────
function App() {
  const [socket, setSocket]         = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [inRoom, setInRoom]         = useState(false);
  const [roomId, setRoomId]         = useState('');
  const [roomState, setRoomState]   = useState<RoomState | null>(null);
  const [joinError, setJoinError]   = useState<string | null>(null);
  const [myLocalChoice, setMyLocalChoice] = useState<CoinSide | null>(null);
  const [lobbyRooms, setLobbyRooms]       = useState<LobbyRoom[]>([]);

  // Ref so socket event callbacks can read the latest "in room" state without
  // needing to be re-registered when it changes.
  const inRoomRef = useRef(false);

  useEffect(() => {
    const sessionId = getSessionId();
    const s = io();
    setSocket(s);

    s.on('connect', () => {
      setIsConnected(true);

      // Auto-rejoin if localStorage has saved session data (handles reconnects
      // and page refreshes — the server restores the slot via sessionId).
      if (!inRoomRef.current) {
        const savedRoom     = localStorage.getItem('flip_socket_room');
        const savedNickname = localStorage.getItem('flip_socket_nickname');
        if (savedRoom && savedNickname) {
          setRoomId(savedRoom);
          s.emit('join_room', { roomId: savedRoom, nickname: savedNickname, sessionId });
        }
      }
    });

    s.on('disconnect', () => {
      setIsConnected(false);
      // Keep inRoom + roomState so the UI doesn't flash back to the join screen
      // while Socket.io is trying to reconnect.
      inRoomRef.current = false;
    });

    s.on('room_update', (state: RoomState) => {
      setRoomState(state);
      setInRoom(true);
      inRoomRef.current = true;
      setJoinError(null);
    });

    s.on('room_list', (rooms: LobbyRoom[]) => {
      setLobbyRooms(rooms);
    });

    s.on('join_error', ({ message }: { message: string }) => {
      setJoinError(message);
      // If the server rejected us (room full, gone, etc.) clear the saved
      // session so we don't keep retrying automatically.
      clearSession();
      setInRoom(false);
      inRoomRef.current = false;
      setRoomState(null);
    });

    return () => { s.disconnect(); };
  }, []);

  const handleJoin = useCallback(
    (rid: string, nick: string, gameType: GameType) => {
      if (!socket) return;
      saveSession(rid, nick);
      setRoomId(rid);
      socket.emit('join_room', { roomId: rid, nickname: nick, sessionId: getSessionId(), gameType });
    },
    [socket],
  );

  // Reset local choice whenever a new round starts (phase → 'choosing'),
  // regardless of which player triggered play_again.
  useEffect(() => {
    if (roomState?.gamePhase === 'choosing') {
      setMyLocalChoice(null);
    }
  }, [roomState?.gamePhase]);

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
    setMyLocalChoice(null);
  }, [socket]);

  const handleLeave = useCallback(() => {
    socket?.emit('leave_room');
    clearSession();
    setInRoom(false);
    inRoomRef.current = false;
    setRoomState(null);
    setMyLocalChoice(null);
  }, [socket]);

  if (!isConnected) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>{inRoom ? 'Reconnecting…' : 'Connecting to server…'}</p>
      </div>
    );
  }

  if (!inRoom || !roomState) {
    return (
      <JoinRoom
        onJoin={handleJoin}
        error={joinError}
        lobbyRooms={lobbyRooms}
        initialNickname={localStorage.getItem('flip_socket_nickname') ?? ''}
      />
    );
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
      onLeave={handleLeave}
    />
  );
}

export default App;
