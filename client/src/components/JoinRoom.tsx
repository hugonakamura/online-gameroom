import { useState, FormEvent } from 'react';

interface Props {
  onJoin: (roomId: string, nickname: string) => void;
  error: string | null;
}

export default function JoinRoom({ onJoin, error }: Props) {
  const [roomId, setRoomId] = useState('');
  const [nickname, setNickname] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!roomId.trim() || !nickname.trim()) return;
    onJoin(roomId.trim(), nickname.trim());
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

        <p className="join-hint">
          Share the Room ID with a friend — the first two players to join will play together.
        </p>
      </div>
    </div>
  );
}
