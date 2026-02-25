import { useState, FormEvent, useRef } from 'react';
import { LobbyRoom, GameType } from '../types';

interface Props {
  onJoin: (roomId: string, nickname: string, gameType: GameType) => void;
  error: string | null;
  lobbyRooms: LobbyRoom[];
  initialNickname: string;
}

const GAME_OPTIONS: { value: GameType; label: string }[] = [
  { value: 'coin_flip', label: '🪙 Coin Flip' },
];

export default function JoinRoom({ onJoin, error, lobbyRooms, initialNickname }: Props) {
  const [roomId, setRoomId]     = useState('');
  const [nickname, setNickname] = useState(initialNickname);
  const [gameType, setGameType] = useState<GameType>('coin_flip');
  const nicknameRef = useRef<HTMLInputElement>(null);

  // If the typed room ID matches an open lobby room, lock the game type to that room's.
  const matchedRoom = lobbyRooms.find((r) => r.id === roomId.trim().toUpperCase());
  const effectiveGameType: GameType = matchedRoom ? matchedRoom.gameType : gameType;
  const isJoining = !!matchedRoom;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!roomId.trim() || !nickname.trim()) return;
    onJoin(roomId.trim(), nickname.trim(), effectiveGameType);
  };

  const handleQuickJoin = (id: string) => {
    setRoomId(id);
    if (nickname.trim()) {
      const room = lobbyRooms.find((r) => r.id === id);
      onJoin(id, nickname.trim(), room?.gameType ?? gameType);
    } else {
      nicknameRef.current?.focus();
    }
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-header">
          <span className="coin-logo">🪙</span>
          <h1>Flip-Socket</h1>
          <p>Real-time multiplayer coin flip</p>
        </div>

        <form onSubmit={handleSubmit} className="join-form">
          <div className="form-group">
            <label htmlFor="roomId">Room ID</label>
            <input
              id="roomId"
              type="text"
              placeholder="e.g. GAME1"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="form-group">
            <label htmlFor="nickname">Nickname</label>
            <input
              ref={nicknameRef}
              id="nickname"
              type="text"
              placeholder="Your display name"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="gameType">
              Game
              {isJoining && <span className="game-locked-badge"> · set by host</span>}
            </label>
            <select
              id="gameType"
              className="game-select"
              value={effectiveGameType}
              onChange={(e) => setGameType(e.target.value as GameType)}
              disabled={isJoining}
            >
              {GAME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!roomId.trim() || !nickname.trim()}
          >
            {isJoining ? 'Join Room →' : 'Create & Join →'}
          </button>
        </form>

        {lobbyRooms.length > 0 && (
          <div className="lobby-rooms">
            <p className="lobby-label">Open Rooms</p>
            {lobbyRooms.map((room) => (
              <div key={room.id} className="lobby-room-item">
                <div className="lobby-room-info">
                  <span className="lobby-room-id">{room.id}</span>
                  <span className="lobby-room-host">{room.host} is waiting</span>
                </div>
                <button
                  type="button"
                  className="btn-join-lobby"
                  onClick={() => handleQuickJoin(room.id)}
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="join-hint">
          Share the Room ID with a friend — the first two players to join will play together.
        </p>
      </div>
    </div>
  );
}
