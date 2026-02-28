import { Suspense, useState, useEffect } from 'react';
import { RoomState, GamePhase, GameType, GameOption, PlayerState, SpectatorState } from '../types';
import { gameViews, gameConfigs } from './games';

interface Props {
  roomId: string;
  socketId: string;
  roomState: RoomState;
  gameOptions: GameOption[];
  emit: (event: string, payload?: unknown) => void;
  onLeave: () => void;
  roomError: string | null;
  onClearRoomError: () => void;
}

function PlayerCard({
  player,
  isMe,
  isHost,
  gamePhase,
  scoreDelayMs,
}: {
  player: PlayerState;
  isMe: boolean;
  isHost: boolean;
  gamePhase: GamePhase;
  scoreDelayMs: number;
}) {
  const [displayedScore, setDisplayedScore] = useState(player.score);

  useEffect(() => {
    if (player.score > displayedScore) {
      if (gamePhase === 'result' && scoreDelayMs > 0) {
        const t = setTimeout(() => setDisplayedScore(player.score), scoreDelayMs);
        return () => clearTimeout(t);
      } else {
        setDisplayedScore(player.score);
      }
    } else if (player.score !== displayedScore) {
      setDisplayedScore(player.score);
    }
  }, [player.score, displayedScore, gamePhase, scoreDelayMs]);
  const statusText = () => {
    if (gamePhase === 'waiting') return 'In room';
    if (gamePhase === 'result') return player.hasChosen ? '✓ Done' : '—';
    return player.hasChosen ? '✓ Ready' : 'Choosing…';
  };

  return (
    <div className={`player-card${isMe ? ' player-me' : ''}`}>
      <div className="player-avatar">{player.nickname[0]?.toUpperCase() ?? '?'}</div>
      <div className="player-info">
        <span className="player-name">
          {player.nickname}
          {isMe && <span className="you-badge"> (you)</span>}
          {isHost && <span className="host-badge">👑</span>}
        </span>
        <span className={`player-status${player.hasChosen ? ' status-ready' : ''}`}>
          {statusText()}
        </span>
      </div>
      <div className="player-score">
        <span className="score-value">{displayedScore}</span>
        <span className="score-label">pts</span>
      </div>
    </div>
  );
}

function SpectatorStrip({ spectators, socketId, hostId }: { spectators: SpectatorState[]; socketId: string; hostId: string }) {
  if (spectators.length === 0) return null;
  return (
    <div className="spectators-strip">
      <span className="spectators-icon">👁</span>
      <span className="spectators-label">Watching:</span>
      {spectators.map((s, i) => (
        <span key={s.id} className={`spectator-name${s.id === socketId ? ' spectator-me' : ''}`}>
          {s.id === hostId && <span className="host-badge">👑</span>}
          {s.nickname}{s.id === socketId ? ' (you)' : ''}{i < spectators.length - 1 ? ',' : ''}
        </span>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function GameRoom({ roomId, socketId, roomState, gameOptions, emit, onLeave, roomError, onClearRoomError }: Props) {
  const GameView = gameViews[roomState.gameType];
  const isSpectator = roomState.spectators.some((s) => s.id === socketId);
  const isHost = roomState.hostId === socketId;

  const [pendingGame, setPendingGame] = useState<GameType | null>(null);
  useEffect(() => { setPendingGame(null); }, [roomState.gameType]);

  return (
    <div className="game-screen">
      {/* Header */}
      <header className="game-header">
        <div className="game-header-row">
          <div className="room-info">
            <span className="room-label">Room</span>
            <span className="room-id">{roomId}</span>
          </div>
          <div className={`player-count${roomState.playerCount >= 2 ? ' full' : ''}`}>
            {roomState.playerCount} {roomState.playerCount === 1 ? 'player' : 'players'}
          </div>
          <div className="header-actions">
            {isHost && (
              <div className="game-switcher">
                <select
                  value={pendingGame ?? roomState.gameType}
                  onChange={(e) => {
                    const g = e.target.value as GameType;
                    setPendingGame(g === roomState.gameType ? null : g);
                  }}
                >
                  {gameOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {pendingGame && (
                  <>
                    {(() => {
                      const opt = gameOptions.find((o) => o.value === pendingGame);
                      const overflow = opt?.maxPlayers !== undefined
                        ? Math.max(0, roomState.playerCount - opt.maxPlayers)
                        : 0;
                      return overflow > 0
                        ? <span className="game-switch-warning">⚠ {overflow} player{overflow > 1 ? 's' : ''} will become spectator{overflow > 1 ? 's' : ''}</span>
                        : null;
                    })()}
                    <button
                      className="btn-change-game"
                      onClick={() => { emit('change_game', { gameType: pendingGame }); setPendingGame(null); }}
                    >
                      Change
                    </button>
                  </>
                )}
              </div>
            )}
            {!isSpectator && (
              <button className="btn-spectate" onClick={() => emit('become_spectator')}>
                Spectate
              </button>
            )}
            {isSpectator && (
              <button className="btn-sit-in" onClick={() => emit('sit_in')}>
                Sit In
              </button>
            )}
            <button className="btn-leave" onClick={onLeave}>Leave</button>
          </div>
        </div>
        <SpectatorStrip spectators={roomState.spectators} socketId={socketId} hostId={roomState.hostId} />
      </header>

      {roomError && (
        <div className="room-error-banner">
          <span>{roomError}</span>
          <button className="room-error-dismiss" onClick={onClearRoomError}>✕</button>
        </div>
      )}

      <div className="game-content">
        {/* Players */}
        <div className="players-section">
          {roomState.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isMe={player.id === socketId}
              isHost={player.id === roomState.hostId}
              gamePhase={roomState.gamePhase}
              scoreDelayMs={gameConfigs[roomState.gameType]?.revealDelayMs ?? 0}
            />
          ))}
        </div>

        {/* Game-specific UI — no-op emit for spectators so they can't interact */}
        <Suspense fallback={<div className="loading-screen"><div className="spinner" /></div>}>
          <GameView
            roomState={roomState}
            socketId={socketId}
            emit={isSpectator ? () => { } : emit}
          />
        </Suspense>
      </div>
    </div>
  );
}
