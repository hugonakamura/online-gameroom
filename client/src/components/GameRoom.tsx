import { useState, useEffect, useRef } from 'react';
import { RoomState, CoinSide, GamePhase, PlayerState } from '../types';

interface Props {
  roomId: string;
  socketId: string;
  roomState: RoomState;
  myLocalChoice: CoinSide | null;
  onChoice: (choice: CoinSide) => void;
  onFlip: () => void;
  onPlayAgain: () => void;
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
    if (gamePhase === 'result') {
      const c = player.choice;
      return c ? c.charAt(0).toUpperCase() + c.slice(1) : '—';
    }
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

export default function GameRoom({
  roomId,
  socketId,
  roomState,
  myLocalChoice,
  onChoice,
  onFlip,
  onPlayAgain,
  onLeave,
}: Props) {
  const [isFlipping, setIsFlipping] = useState(false);
  const prevPhaseRef = useRef<GamePhase>(roomState.gamePhase);

  // Trigger the coin animation exactly once when the phase transitions to 'result'
  useEffect(() => {
    if (roomState.gamePhase === 'result' && prevPhaseRef.current !== 'result') {
      setIsFlipping(true);
      const t = setTimeout(() => setIsFlipping(false), 1200);
      prevPhaseRef.current = roomState.gamePhase;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = roomState.gamePhase;
  }, [roomState.gamePhase]);

  const me = roomState.players.find((p) => p.id === socketId);
  const opponents = roomState.players.filter((p) => p.id !== socketId);

  // A player wins if their choice matches the flip result
  const iWon =
    roomState.gamePhase === 'result' &&
    roomState.flipResult != null &&
    me?.choice === roomState.flipResult;

  const coinEmoji = () => {
    if (roomState.gamePhase !== 'result') return '🪙';
    return roomState.flipResult === 'heads' ? '👑' : '🦅';
  };

  const phaseMessage = () => {
    switch (roomState.gamePhase) {
      case 'waiting':  return 'Waiting for more players to join…';
      case 'choosing': return me?.hasChosen ? 'Waiting for others…' : 'Pick your side!';
      case 'ready':    return 'Everyone\'s ready — flip the coin!';
      case 'result':   return `The coin landed on ${roomState.flipResult}!`;
    }
  };

  const coinClass = [
    'coin-display',
    roomState.gamePhase === 'result' ? roomState.flipResult : '',
    isFlipping ? 'flipping' : '',
  ]
    .filter(Boolean)
    .join(' ');

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

        {/* Coin */}
        <div className="coin-section">
          <div className={coinClass}>
            <span className="coin-inner">{coinEmoji()}</span>
          </div>
          <p className="phase-message">{phaseMessage()}</p>
        </div>

        {/* Actions */}
        <div className="actions-section">
          {roomState.gamePhase === 'choosing' && (
            <div className="choice-buttons">
              <button
                className={`btn btn-choice btn-heads${myLocalChoice === 'heads' ? ' selected' : ''}`}
                onClick={() => onChoice('heads')}
              >
                👑 Heads
              </button>
              <button
                className={`btn btn-choice btn-tails${myLocalChoice === 'tails' ? ' selected' : ''}`}
                onClick={() => onChoice('tails')}
              >
                🦅 Tails
              </button>
            </div>
          )}

          {roomState.gamePhase === 'ready' && (
            <button className="btn btn-flip" onClick={onFlip}>
              Flip!
            </button>
          )}

          {roomState.gamePhase === 'result' && (
            <div className="result-section">
              <div className={`result-banner ${iWon ? 'win' : 'lose'}`}>
                {iWon ? '🎉 You Win!' : '😔 Better luck next time!'}
              </div>
              {me?.choice && (
                <p className="result-detail">
                  You chose <strong>{me.choice}</strong> · Coin:{' '}
                  <strong>{roomState.flipResult}</strong>
                  {opponents.filter((p) => p.choice).map((p) => (
                    <span key={p.id}> · {p.nickname}: <strong>{p.choice}</strong></span>
                  ))}
                </p>
              )}
              <button className="btn btn-primary" onClick={onPlayAgain}>
                Play Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
