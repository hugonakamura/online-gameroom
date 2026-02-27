import { useState, useEffect, useRef } from 'react';
import { CoinFlipState, CoinSide, GamePhase } from '../../../types';
import { GameViewProps } from '../types';
import './CoinFlip.css';

export default function CoinFlip({ roomState, socketId, emit }: GameViewProps) {
  const [myLocalChoice, setMyLocalChoice] = useState<CoinSide | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const prevPhaseRef = useRef<GamePhase>(roomState.gamePhase);

  const state = roomState.gameState as CoinFlipState | undefined;
  const myIndex = roomState.players.findIndex((p) => p.id === socketId);
  const me = roomState.players[myIndex];
  const myChoice = state?.choices[myIndex] ?? null;

  // Reset local choice when a new round starts
  useEffect(() => {
    if (roomState.gamePhase === 'choosing') setMyLocalChoice(null);
  }, [roomState.gamePhase]);

  // Trigger coin animation exactly once when phase transitions to 'result'
  useEffect(() => {
    if (roomState.gamePhase === 'result' && prevPhaseRef.current !== 'result') {
      setIsFlipping(true);
      const t = setTimeout(() => setIsFlipping(false), 3000);
      prevPhaseRef.current = roomState.gamePhase;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = roomState.gamePhase;
  }, [roomState.gamePhase]);

  const iWon =
    roomState.gamePhase === 'result' &&
    state?.flipResult != null &&
    myChoice === state.flipResult;

  const coinEmoji = () => {
    if (roomState.gamePhase !== 'result' || isFlipping) return '🪙';
    return state?.flipResult === 'heads' ? '👑' : '🦅';
  };

  const phaseMessage = () => {
    switch (roomState.gamePhase) {
      case 'waiting': return 'Waiting for more players to join…';
      case 'choosing': return me?.hasChosen ? 'Waiting for others…' : 'Pick your side!';
      case 'ready': return 'Everyone\'s ready — flip the coin!';
      case 'result': return isFlipping ? 'The coin is in the air...' : `The coin landed on ${state?.flipResult}!`;
    }
  };

  const coinClass = [
    'coin-display',
    (roomState.gamePhase === 'result' && !isFlipping) ? state?.flipResult : '',
    isFlipping ? 'flipping' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleChoice = (choice: CoinSide) => {
    emit('game_input', { choice });
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
          <button className="btn btn-flip" onClick={() => emit('game_action')}>
            Flip!
          </button>
        )}

        {roomState.gamePhase === 'result' && !isFlipping && (
          <div className="result-section">
            <div className={`result-banner ${iWon ? 'win' : 'lose'}`}>
              {iWon ? '🎉 You Win!' : '😔 Better luck next time!'}
            </div>
            {myChoice && (
              <p className="result-detail">
                You chose <strong>{myChoice}</strong> · Coin:{' '}
                <strong>{state?.flipResult}</strong>
                {roomState.players.map((p, i) => {
                  if (p.id === socketId) return null;
                  const oppChoice = state?.choices[i];
                  return oppChoice ? (
                    <span key={p.id}> · {p.nickname}: <strong>{oppChoice}</strong></span>
                  ) : null;
                })}
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
