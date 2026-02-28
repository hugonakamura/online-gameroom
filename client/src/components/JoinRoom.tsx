import { useState, FormEvent, useRef } from 'react';
import { LobbyRoom, GameType, GameOption } from '../types';

interface Props {
  onJoin: (roomId: string, nickname: string, gameType: GameType) => void;
  onCreate: (nickname: string, gameType: GameType) => void;
  onSpectate: (roomId: string, nickname: string) => void;
  error: string | null;
  lobbyRooms: LobbyRoom[];
  gameOptions: GameOption[];
  initialNickname: string;
}

export default function JoinRoom({ onJoin, onCreate, onSpectate, error, lobbyRooms, gameOptions, initialNickname }: Props) {
  const [nickname, setNickname] = useState(initialNickname);
  const [gameType, setGameType] = useState<GameType>('coin_flip');
  const nicknameRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    onCreate(nickname.trim(), gameType);
  };

  const handleQuickJoin = (room: LobbyRoom) => {
    if (nickname.trim()) {
      onJoin(room.id, nickname.trim(), room.gameType);
    } else {
      nicknameRef.current?.focus();
    }
  };

  const handleQuickSpectate = (room: LobbyRoom) => {
    if (nickname.trim()) {
      onSpectate(room.id, nickname.trim());
    } else {
      nicknameRef.current?.focus();
    }
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-header">
          <span className="coin-logo">🪙</span>
          <h1>Game Room</h1>
          <p>Real-time multiplayer games</p>
        </div>

        <form onSubmit={handleSubmit} className="join-form">
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
            <label htmlFor="gameType">Game</label>
            <select
              id="gameType"
              className="game-select"
              value={gameType}
              onChange={(e) => setGameType(e.target.value as GameType)}
            >
              {gameOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!nickname.trim()}
          >
            Create Room →
          </button>
        </form>

        {lobbyRooms.length > 0 && (
          <div className="lobby-rooms">
            <p className="lobby-label">Open Rooms</p>
            {lobbyRooms.map((room) => (
              <div key={room.id} className="lobby-room-item">
                <div className="lobby-room-info">
                  <span className="lobby-room-id">
                    {room.id}
                    <span className="lobby-room-game">{gameOptions.find((o) => o.value === room.gameType)?.label}</span>
                    {room.spectatorCount > 0 && (
                      <span className="lobby-spectator-count">👁 {room.spectatorCount}</span>
                    )}
                  </span>
                  <span className="lobby-room-host">
                    {room.playerCount} {room.playerCount === 1 ? 'player' : 'players'} ·{' '}
                    {room.gamePhase === 'waiting' ? `${room.host} is waiting` : 'In progress'}
                  </span>
                </div>
                <div className="lobby-room-actions">
                  {room.maxPlayers === undefined || room.playerCount < room.maxPlayers ? (
                    <button
                      type="button"
                      className="btn-join-lobby"
                      onClick={() => handleQuickJoin(room)}
                    >
                      Join
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-spectate-lobby"
                      onClick={() => handleQuickSpectate(room)}
                    >
                      Spectate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="join-hint">
          Create a room and share the room code — or join an existing room from the list above.
        </p>
      </div>
    </div>
  );
}
