import { useState } from 'react';
import { Card, CardRank, HighLowChoice, HighLowState, Suit } from '../../../types';
import { GameViewProps } from '../types';
import './HighLow.css';

function rankLabel(rank: CardRank): string {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 'hearts':   return '♥';
    case 'diamonds': return '♦';
    case 'clubs':    return '♣';
    case 'spades':   return '♠';
  }
}

function suitColor(suit: Suit): 'red' | 'black' {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

function PlayingCard({ card }: { card: Card }) {
  const rank = rankLabel(card.rank);
  const suit = suitSymbol(card.suit);
  const color = suitColor(card.suit);
  return (
    <div className={`hl-card ${color}`}>
      <span className="hl-card-corner top">{rank}<br />{suit}</span>
      <span className="hl-card-suit">{suit}</span>
      <span className="hl-card-corner bottom">{rank}<br />{suit}</span>
    </div>
  );
}

export default function HighLow({ roomState, socketId, emit }: GameViewProps) {
  const [myLocalChoice, setMyLocalChoice] = useState<HighLowChoice | null>(null);
  const [myReady, setMyReady] = useState(false);

  const state = roomState.gameState as HighLowState | undefined;
  const myIndex = roomState.players.findIndex((p) => p.id === socketId);

  const myChoice = state?.choices[myIndex] ?? null;
  const oppChoice = state?.choices[myIndex === 0 ? 1 : 0] ?? null;

  const outcome = state?.outcome ?? null;
  const isPush = outcome === 'equal';

  // Reset local state when entering a new round
  if (roomState.gamePhase === 'choosing' && myLocalChoice) setMyLocalChoice(null);
  if (roomState.gamePhase === 'choosing' && myReady) setMyReady(false);

  const handleChoice = (choice: 'higher' | 'lower') => {
    if (myLocalChoice) return;
    emit('game_input', { choice });
    setMyLocalChoice(choice);
  };

  const handleReady = () => {
    if (myReady) return;
    emit('play_again');
    setMyReady(true);
  };

  const statusMessage = () => {
    if (roomState.gamePhase === 'waiting') return 'Waiting for opponent to join…';
    if (myLocalChoice) return 'Waiting for opponent…';
    if (oppChoice === 'hidden') return 'Opponent is ready — make your move!';
    return 'Choose: Higher or Lower?';
  };

  const outcomeArrowClass = outcome === 'higher' ? 'higher' : outcome === 'lower' ? 'lower' : 'equal';
  const outcomeArrowChar = outcome === 'higher' ? '↑' : outcome === 'lower' ? '↓' : '=';

  const resultBannerClass = () => {
    if (isPush) return 'draw';
    const iWon = myChoice === outcome;
    return iWon ? 'win' : 'lose';
  };

  const resultBannerText = () => {
    const pts = state!.multiplier;
    const ptStr = `${pts} pt${pts !== 1 ? 's' : ''}`;
    if (isPush) return `Push — next round worth ${state!.multiplier}×!`;
    const myActualChoice = state!.choices[myIndex];
    const iWon = myActualChoice === outcome;
    const oppActualChoice = state!.choices[myIndex === 0 ? 1 : 0];
    const oppWon = oppActualChoice === outcome;
    if (iWon && oppWon) return `🤝 Both correct! (+${ptStr} each)`;
    if (iWon) return `🎉 You Win! (+${ptStr})`;
    return '😔 Better luck next time!';
  };

  const readyLabel = () => {
    if (!myReady) return 'Ready ✓';
    const waiting = roomState.players.length - (state?.readyCount ?? 0);
    return waiting > 0 ? 'Waiting for opponent…' : 'Ready ✓';
  };

  return (
    <>
      <div className="hl-section">
        {/* Choosing phase */}
        {roomState.gamePhase !== 'result' && (
          <>
            {state && state.multiplier > 1 && (
              <div className="hl-multiplier">⚡ {state.multiplier}× Round!</div>
            )}
            <p className="hl-status">{statusMessage()}</p>
            {state && (
              <>
                <PlayingCard card={state.currentCard} />
                <span className="hl-cards-left">{state.cardsRemaining} cards left in deck</span>
              </>
            )}
            {roomState.gamePhase === 'choosing' && (
              <div className="hl-choices">
                <button
                  className={`hl-btn${myLocalChoice === 'higher' ? ' selected' : ''}`}
                  disabled={!!myLocalChoice}
                  onClick={() => handleChoice('higher')}
                >
                  <span className="hl-btn-arrow">↑</span>
                  <span className="hl-btn-label">Higher</span>
                </button>
                <button
                  className={`hl-btn${myLocalChoice === 'lower' ? ' selected' : ''}`}
                  disabled={!!myLocalChoice}
                  onClick={() => handleChoice('lower')}
                >
                  <span className="hl-btn-arrow">↓</span>
                  <span className="hl-btn-label">Lower</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* Result phase: card pair */}
        {roomState.gamePhase === 'result' && state && state.nextCard && (
          <>
            <div className="hl-reveal">
              <div className="hl-reveal-card">
                <span className="hl-reveal-label">Was</span>
                <PlayingCard card={state.currentCard} />
              </div>
              <div className={`hl-reveal-arrow ${outcomeArrowClass}`}>{outcomeArrowChar}</div>
              <div className="hl-reveal-card">
                <span className="hl-reveal-label">Drawn</span>
                <PlayingCard card={state.nextCard} />
              </div>
            </div>

            {/* Player guesses */}
            <div className="hl-guesses">
              {roomState.players.map((player, i) => {
                const choice = state.choices[i];
                const isCorrect = !isPush && choice !== null && choice === outcome;
                const isWrong = !isPush && choice !== null && choice !== outcome;
                const isMe = player.id === socketId;
                return (
                  <div key={player.id} className={`hl-guess-item${isMe ? ' me' : ''}`}>
                    <span className="hl-guess-name">{player.nickname}{isMe ? ' (you)' : ''}</span>
                    <span className="hl-guess-choice">
                      {choice === 'higher' ? '↑ Higher' : choice === 'lower' ? '↓ Lower' : '—'}
                    </span>
                    {!isPush && (
                      <span className={`hl-guess-mark ${isCorrect ? 'correct' : isWrong ? 'wrong' : ''}`}>
                        {isCorrect ? '✓' : isWrong ? '✗' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Result actions */}
      {roomState.gamePhase === 'result' && state && (
        <div className="hl-actions">
          {isPush && (
            <div className="hl-multiplier">⚡ Next round worth {state.multiplier}×!</div>
          )}
          <div className={`result-banner ${resultBannerClass()}`}>
            {resultBannerText()}
          </div>
          <button
            className={`btn btn-primary${myReady ? ' ready-waiting' : ''}`}
            disabled={myReady}
            onClick={handleReady}
          >
            {readyLabel()}
          </button>
        </div>
      )}
    </>
  );
}
