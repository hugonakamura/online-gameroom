import { useState, useEffect, useRef } from 'react';
import { RPSChoice, RPSState, GamePhase } from '../../../types';
import { GameViewProps } from '../types';
import { gameConfigs } from '../config';
import './RPS.css';

const OPTIONS: { choice: RPSChoice; emoji: string; label: string }[] = [
  { choice: 'rock', emoji: '🪨', label: 'Rock' },
  { choice: 'paper', emoji: '📄', label: 'Paper' },
  { choice: 'scissors', emoji: '✂️', label: 'Scissors' },
];

export default function RPS({ roomState, socketId, emit }: GameViewProps) {
  const [myLocalChoice, setMyLocalChoice] = useState<RPSChoice | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const prevPhaseRef = useRef<GamePhase>(roomState.gamePhase);

  useEffect(() => {
    if (roomState.gamePhase === 'result' && prevPhaseRef.current !== 'result') {
      setIsRevealing(true);
      const t = setTimeout(() => setIsRevealing(false), gameConfigs.rps.revealDelayMs);
      prevPhaseRef.current = roomState.gamePhase;
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = roomState.gamePhase;
  }, [roomState.gamePhase]);

  const state = roomState.gameState as RPSState | undefined;
  const myIndex = roomState.players.findIndex((p) => p.id === socketId);
  const me = roomState.players[myIndex];
  const opponent = roomState.players[myIndex === 0 ? 1 : 0];

  const myChoice = state?.choices[myIndex] ?? null;
  const oppChoice = state?.choices[myIndex === 0 ? 1 : 0] ?? null;

  const iWon = typeof state?.winner === 'number' && state.winner === myIndex;
  const isDraw = state?.winner === 'draw';

  const choiceEmoji = (c: RPSChoice | null) => {
    if (roomState.gamePhase === 'result' && isRevealing) return '✊';
    if (c === 'hidden') return '✅';
    return OPTIONS.find((o) => o.choice === c)?.emoji ?? '❓';
  };

  const handleChoice = (choice: RPSChoice) => {
    if (myLocalChoice) return; // already sent
    emit('game_input', { choice });
    setMyLocalChoice(choice);
  };

  // Reset local choice when a new round starts
  useEffect(() => {
    if (roomState.gamePhase === 'choosing') {
      setMyLocalChoice(null);
    }
  }, [roomState.gamePhase]);

  const statusMessage = () => {
    if (roomState.gamePhase === 'waiting') return 'Waiting for opponent to join…';
    if (roomState.gamePhase === 'result') return isRevealing ? 'Rock... Paper... Scissors...' : '';
    if (myLocalChoice) return 'Waiting for opponent…';
    if (oppChoice === 'hidden') return 'Opponent is ready — make your move!';
    return 'Choose your weapon!';
  };

  return (
    <>
      {/* Choice buttons */}
      <div className="rps-section">
        <p className="rps-status">{statusMessage()}</p>
        {roomState.gamePhase !== 'result' && roomState.gamePhase === 'choosing' && (
          <div className="rps-choices">
            {OPTIONS.map(({ choice, emoji, label }) => (
              <button
                key={choice}
                className={`rps-btn${myLocalChoice === choice ? ' selected' : ''}`}
                disabled={!!myLocalChoice}
                onClick={() => handleChoice(choice)}
              >
                {emoji}
                <span className="rps-label">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Result reveal */}
        {roomState.gamePhase === 'result' && state && (
          <div className={`rps-reveal ${isRevealing ? 'revealing' : ''}`}>
            <div className="rps-reveal-player">
              <span className="rps-reveal-choice">{choiceEmoji(myChoice)}</span>
              <span className="rps-reveal-name">{me?.nickname ?? 'You'}</span>
            </div>
            <span className="rps-reveal-vs">vs</span>
            <div className="rps-reveal-player">
              <span className="rps-reveal-choice">{choiceEmoji(oppChoice)}</span>
              <span className="rps-reveal-name">{opponent?.nickname ?? 'Opponent'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Result actions */}
      <div className="rps-actions">
        {roomState.gamePhase === 'result' && !isRevealing && (
          <>
            <div className={`result-banner ${isDraw ? 'draw' : iWon ? 'win' : 'lose'}`}>
              {isDraw ? "It's a draw!" : iWon ? '🎉 You Win!' : '😔 Better luck next time!'}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                setMyLocalChoice(null);
                emit('play_again');
              }}
            >
              Play Again
            </button>
          </>
        )}
      </div>
    </>
  );
}
