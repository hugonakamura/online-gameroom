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

function PlayingCard({ card, label }: { card: Card; label?: string }) {
  const rank = rankLabel(card.rank);
  const suit = suitSymbol(card.suit);
  const color = suitColor(card.suit);
  return (
    <div className={`hl-card ${color}`}>
      {label && <span className="hl-card-label">{label}</span>}
      <span className="hl-card-corner top">{rank}<br />{suit}</span>
      <span className="hl-card-suit">{suit}</span>
      <span className="hl-card-corner bottom">{rank}<br />{suit}</span>
    </div>
  );
}

export default function HighLow({ roomState, socketId, emit }: GameViewProps) {
  const [myLocalChoice, setMyLocalChoice] = useState<HighLowChoice | null>(null);

  const state = roomState.gameState as HighLowState | undefined;
  const myIndex = roomState.players.findIndex((p) => p.id === socketId);
  const me = roomState.players[myIndex];
  const opponent = roomState.players[myIndex === 0 ? 1 : 0];

  const myChoice = state?.choices[myIndex] ?? null;
  const oppChoice = state?.choices[myIndex === 0 ? 1 : 0] ?? null;

  const iWon =
    !!state &&
    state.outcome !== null &&
    state.outcome !== 'equal' &&
    myChoice === state.outcome;
  const oppWon =
    !!state &&
    state.outcome !== null &&
    state.outcome !== 'equal' &&
    (oppChoice === state.outcome || (myIndex === 0 ? state.choices[1] : state.choices[0]) === state.outcome);
  const bothWon = iWon && oppWon;
  const isPush = state?.outcome === 'equal';

  // Reset local choice when a new round starts
  if (roomState.gamePhase === 'choosing' && myLocalChoice && !myChoice) {
    setMyLocalChoice(null);
  }

  const handleChoice = (choice: 'higher' | 'lower') => {
    if (myLocalChoice) return;
    emit('game_input', { choice });
    setMyLocalChoice(choice);
  };

  const statusMessage = () => {
    if (roomState.gamePhase === 'waiting') return 'Waiting for opponent to join…';
    if (myLocalChoice) return 'Waiting for opponent…';
    if (oppChoice === 'hidden') return 'Opponent is ready — make your move!';
    return 'Choose: Higher or Lower?';
  };

  const outcomeArrow = () => {
    if (state?.outcome === 'higher') return '↑';
    if (state?.outcome === 'lower') return '↓';
    return '=';
  };

  const resultBannerClass = isPush ? 'draw' : bothWon ? 'win' : iWon ? 'win' : 'lose';
  const resultBannerText = () => {
    const pts = state!.multiplier;
    const ptStr = `${pts} pt${pts !== 1 ? 's' : ''}`;
    if (isPush) return `Push — next round worth ${state!.multiplier}×!`;
    if (bothWon) return `🤝 Both correct! (+${ptStr} each)`;
    if (iWon) return `🎉 You Win! (+${ptStr})`;
    return '😔 Better luck next time!';
  };

  return (
    <>
      <div className="hl-section">
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

        {roomState.gamePhase === 'result' && state && state.nextCard && (
          <div className="hl-reveal">
            <div className="hl-reveal-slot">
              <PlayingCard card={state.currentCard} label={me?.nickname ?? 'You'} />
              <span className="hl-reveal-guess">
                {myChoice === 'higher' ? '↑ Higher' : myChoice === 'lower' ? '↓ Lower' : '—'}
              </span>
            </div>

            <div className={`hl-reveal-arrow ${state.outcome ?? ''}`}>{outcomeArrow()}</div>

            <div className="hl-reveal-slot">
              <PlayingCard card={state.nextCard} label={opponent?.nickname ?? 'Opponent'} />
              <span className="hl-reveal-guess">
                {(() => {
                  const oppActualChoice = state.choices[myIndex === 0 ? 1 : 0];
                  return oppActualChoice === 'higher' ? '↑ Higher' : oppActualChoice === 'lower' ? '↓ Lower' : '—';
                })()}
              </span>
            </div>
          </div>
        )}
      </div>

      {roomState.gamePhase === 'result' && state && (
        <div className="hl-actions">
          {isPush && (
            <div className="hl-multiplier">⚡ Next round worth {state.multiplier}×!</div>
          )}
          <div className={`result-banner ${resultBannerClass}`}>
            {resultBannerText()}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              setMyLocalChoice(null);
              emit('play_again');
            }}
          >
            Play Next Card
          </button>
        </div>
      )}
    </>
  );
}
