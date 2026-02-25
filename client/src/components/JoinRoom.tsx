import { useState, FormEvent, useRef } from 'react';
import { LobbyRoom } from '../types';

interface Props {
  onJoin: (roomId: string, nickname: string) => void;
  error: string | null;
  lobbyRooms: LobbyRoom[];
}

export default function JoinRoom({ onJoin, error, lobbyRooms }: Props) {
  const [roomId, setRoomId] = useState('');
  const [nickname, setNickname] = useState('');
  const nicknameRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!roomId.trim() || !nickname.trim()) return;
    onJoin(roomId.trim(), nickname.trim());
  };

  const handleQuickJoin = (id: string) => {
    setRoomId(id);
    if (nickname.trim()) {
      onJoin(id, nickname.trim());
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

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!roomId.trim() || !nickname.trim()}
          >
            Join Room →
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
