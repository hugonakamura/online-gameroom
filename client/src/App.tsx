import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import JoinRoom from './components/JoinRoom';
import GameRoom from './components/GameRoom';
import { RoomState, LobbyRoom, GameType, GameOption } from './types';

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

function clearSession() {
  localStorage.removeItem('flip_socket_room');
  localStorage.removeItem('flip_socket_role');
  // Nickname is intentionally kept so the user doesn't have to re-type it.
}

// ── Component ──────────────────────────────────────────────────────────────────
function App() {
  const [socket, setSocket]           = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [inRoom, setInRoom]           = useState(false);
  const [roomId, setRoomId]           = useState('');
  const [roomState, setRoomState]     = useState<RoomState | null>(null);
  const [joinError, setJoinError]     = useState<string | null>(null);
  const [lobbyRooms, setLobbyRooms]   = useState<LobbyRoom[]>([]);
  const [gameOptions, setGameOptions] = useState<GameOption[]>([]);

  // True while localStorage has session data and we're waiting for room_update.
  // Prevents a flash of the lobby during reconnection after a page refresh.
  const [isRejoining, setIsRejoining] = useState(() =>
    !!(localStorage.getItem('flip_socket_room') && localStorage.getItem('flip_socket_nickname'))
  );

  const navigate = useNavigate();
  const location = useLocation();

  // Ref so socket event callbacks can read the latest "in room" state without
  // needing to be re-registered when it changes.
  const inRoomRef = useRef(false);

  // Ref so the socket effect (runs once) can always read the current pathname.
  const pathnameRef = useRef(location.pathname);
  useEffect(() => { pathnameRef.current = location.pathname; }, [location.pathname]);

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
        const savedRole     = localStorage.getItem('flip_socket_role') as 'spectator' | null;
        if (savedRoom && savedNickname) {
          setRoomId(savedRoom);
          s.emit('join_room', { roomId: savedRoom, nickname: savedNickname, sessionId, ...(savedRole ? { role: savedRole } : {}) });
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
      setRoomId(state.roomId);
      localStorage.setItem('flip_socket_room', state.roomId);
      setInRoom(true);
      inRoomRef.current = true;
      setJoinError(null);
      setIsRejoining(false);
      // Navigate to the room URL; only push a new history entry if we're not
      // already there (i.e. avoid a duplicate entry on reconnect/refresh).
      const target = `/room/${state.roomId}`;
      if (pathnameRef.current !== target) navigate(target);
    });

    s.on('game_options', (options: GameOption[]) => {
      setGameOptions(options);
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
      setIsRejoining(false);
    });

    return () => { s.disconnect(); };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Back-button detection: if the URL becomes '/' while we're still in a room,
  // clean up socket state so the lobby renders correctly.
  useEffect(() => {
    if (location.pathname === '/' && inRoom) {
      socket?.emit('leave_room');
      clearSession();
      setInRoom(false);
      inRoomRef.current = false;
      setRoomState(null);
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoin = useCallback(
    (rid: string, nick: string, gameType: GameType) => {
      if (!socket) return;
      localStorage.setItem('flip_socket_nickname', nick);
      socket.emit('join_room', { roomId: rid, nickname: nick, sessionId: getSessionId(), gameType });
    },
    [socket],
  );

  const handleCreate = useCallback(
    (nick: string, gameType: GameType) => {
      if (!socket) return;
      localStorage.setItem('flip_socket_nickname', nick);
      socket.emit('create_room', { nickname: nick, sessionId: getSessionId(), gameType });
    },
    [socket],
  );

  const handleSpectate = useCallback(
    (rid: string, nick: string) => {
      if (!socket) return;
      localStorage.setItem('flip_socket_nickname', nick);
      localStorage.setItem('flip_socket_role', 'spectator');
      socket.emit('join_room', { roomId: rid, nickname: nick, sessionId: getSessionId(), role: 'spectator' });
    },
    [socket],
  );

  const handleLeave = useCallback(() => {
    socket?.emit('leave_room');
    clearSession();
    setInRoom(false);
    inRoomRef.current = false;
    setRoomState(null);
    navigate('/');
  }, [socket, navigate]);

  if (!isConnected || isRejoining) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>{inRoom || isRejoining ? 'Reconnecting…' : 'Connecting to server…'}</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={
        <JoinRoom
          onJoin={handleJoin}
          onCreate={handleCreate}
          onSpectate={handleSpectate}
          error={joinError}
          lobbyRooms={lobbyRooms}
          gameOptions={gameOptions}
          initialNickname={localStorage.getItem('flip_socket_nickname') ?? ''}
        />
      } />
      <Route path="/room/:roomId" element={
        inRoom && roomState
          ? <GameRoom
              roomId={roomId}
              socketId={socket?.id ?? ''}
              roomState={roomState}
              gameOptions={gameOptions}
              emit={(event, payload) => socket?.emit(event, payload)}
              onLeave={handleLeave}
            />
          : <Navigate to="/" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
