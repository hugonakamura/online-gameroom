import { useState } from 'react';
import { RPSChoice, RPSState } from '../../../types';
import { GameViewProps } from '../types';
import './RPS.css';

const OPTIONS: { choice: RPSChoice; emoji: string; label: string }[] = [
  { choice: 'rock',     emoji: '🪨', label: 'Rock'     },
  { choice: 'paper',    emoji: '📄', label: 'Paper'    },
  { choice: 'scissors', emoji: '✂️', label: 'Scissors' },
];

export default function RPS({ roomState, socketId, emit }: GameViewProps) {
  const [myLocalChoice, setMyLocalChoice] = useState<RPSChoice | null>(null);

  const state = roomState.gameState as RPSState | undefined;
  const myIndex = roomState.players.findIndex((p) => p.id === socketId);
  const me = roomState.players[myIndex];
  const opponent = roomState.players[myIndex === 0 ? 1 : 0];

  const myChoice = state?.choices[myIndex] ?? null;
  const oppChoice = state?.choices[myIndex === 0 ? 1 : 0] ?? null;

  const iWon  = typeof state?.winner === 'number' && state.winner === myIndex;
  const isDraw = state?.winner === 'draw';

  const choiceEmoji = (c: RPSChoice | null) =>
    OPTIONS.find((o) => o.choice === c)?.emoji ?? '❓';

  const handleChoice = (choice: RPSChoice) => {
    if (myLocalChoice) return; // already sent
    emit('game_input', { choice });
    setMyLocalChoice(choice);
  };

  // Reset local choice when a new round starts
  if (roomState.gamePhase === 'choosing' && myLocalChoice && !myChoice) {
    setMyLocalChoice(null);
  }

  const statusMessage = () => {
    if (roomState.gamePhase === 'waiting') return 'Waiting for opponent to join…';
    if (roomState.gamePhase === 'result') return '';
    return myLocalChoice ? 'Waiting for opponent…' : 'Choose your weapon!';
  };

  return (
    <>
      {/* Choice buttons */}
      <div className="rps-section">
        {roomState.gamePhase !== 'result' && (
          <>
            <p className="rps-status">{statusMessage()}</p>
            {roomState.gamePhase === 'choosing' && (
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
          </>
        )}

        {/* Result reveal */}
        {roomState.gamePhase === 'result' && state && (
          <div className="rps-reveal">
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
      {roomState.gamePhase === 'result' && (
        <div className="rps-actions">
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
        </div>
      )}
    </>
  );
}
