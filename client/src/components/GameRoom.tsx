import { Suspense } from 'react';
import { RoomState, GamePhase, PlayerState } from '../types';
import { gameViews } from './games';

interface Props {
  roomId: string;
  socketId: string;
  roomState: RoomState;
  emit: (event: string, payload?: unknown) => void;
  onLeave: () => void;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  isMe,
  gamePhase,
}: {
  player: PlayerState;
  isMe: boolean;
  gamePhase: GamePhase;
}) {
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
        </span>
        <span className={`player-status${player.hasChosen ? ' status-ready' : ''}`}>
          {statusText()}
        </span>
      </div>
      <div className="player-score">
        <span className="score-value">{player.score}</span>
        <span className="score-label">pts</span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function GameRoom({ roomId, socketId, roomState, emit, onLeave }: Props) {
  const GameView = gameViews[roomState.gameType];

  return (
    <div className="game-screen">
      {/* Header */}
      <header className="game-header">
        <div className="room-info">
          <span className="room-label">Room</span>
          <span className="room-id">{roomId}</span>
        </div>
        <div className={`player-count${roomState.playerCount >= 2 ? ' full' : ''}`}>
          {roomState.playerCount} {roomState.playerCount === 1 ? 'player' : 'players'}
        </div>
        <button className="btn-leave" onClick={onLeave}>Leave</button>
      </header>

      <div className="game-content">
        {/* Players */}
        <div className="players-section">
          {roomState.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isMe={player.id === socketId}
              gamePhase={roomState.gamePhase}
            />
          ))}
        </div>

        {/* Game-specific UI — resolved from the registry by game type */}
        <Suspense fallback={<div className="loading-screen"><div className="spinner" /></div>}>
          <GameView roomState={roomState} socketId={socketId} emit={emit} />
        </Suspense>
      </div>
    </div>
  );
}
