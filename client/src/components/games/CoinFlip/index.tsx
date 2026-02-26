import { useState, useEffect, useRef } from 'react';
import { CoinSide, GamePhase } from '../../../types';
import { GameViewProps } from '../types';
import './CoinFlip.css';

export default function CoinFlip({ roomState, socketId, emit }: GameViewProps) {
  const [myLocalChoice, setMyLocalChoice] = useState<CoinSide | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const prevPhaseRef = useRef<GamePhase>(roomState.gamePhase);

  // Reset local choice when a new round starts
  useEffect(() => {
    if (roomState.gamePhase === 'choosing') setMyLocalChoice(null);
  }, [roomState.gamePhase]);

  // Trigger coin animation exactly once when phase transitions to 'result'
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

  const handleChoice = (choice: CoinSide) => {
    emit('make_choice', { choice });
    setMyLocalChoice(choice);
  };

  return (
    <>
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
              onClick={() => handleChoice('heads')}
            >
              👑 Heads
            </button>
            <button
              className={`btn btn-choice btn-tails${myLocalChoice === 'tails' ? ' selected' : ''}`}
              onClick={() => handleChoice('tails')}
            >
              🦅 Tails
            </button>
          </div>
        )}

        {roomState.gamePhase === 'ready' && (
          <button className="btn btn-flip" onClick={() => emit('flip_request')}>
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
            <button className="btn btn-primary" onClick={() => emit('play_again')}>
              Play Again
            </button>
          </div>
        )}
      </div>
    </>
  );
}
