import { Card, HighLowChoice, HighLowState } from '../../shared/types';
import { Player, Room } from '../types';
import type { GameHandler } from './index';

type RealHighLowChoice = Exclude<HighLowChoice, 'hidden'>;

/** Server-internal state — extends the shared wire-format with the full deck */
interface InternalState extends HighLowState {
  deck: Card[];
  readyVotes: string[]; // player IDs that have clicked Ready; advance when all have voted
}

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const highLowHandler: GameHandler = {
  roomIdPrefix: 'HL',
  maxPlayers: 8,

  onGameStart(room: Room): void {
    room.players.forEach((p) => { p.hasActed = false; });
    const deck = shuffle(createDeck());
    const currentCard = deck.pop()!;
    room.gameState = {
      deck,
      currentCard,
      nextCard: null,
      choices: Array(room.players.length).fill(null),
      outcome: null,
      multiplier: 1,
      cardsRemaining: deck.length,
      readyCount: 0,
      readyVotes: [],
    } satisfies InternalState;
  },

  onGameInput(room: Room, player: Player, payload: unknown): void {
    const state = room.gameState as InternalState;
    const { choice } = payload as { choice: HighLowChoice };
    if (choice !== 'higher' && choice !== 'lower') return; // reject 'hidden'

    const idx = room.players.findIndex((p) => p.id === player.id);
    if (state.choices[idx] !== null) return; // already chosen

    state.choices[idx] = choice;
    player.hasActed = true;

    // Auto-resolve when both players have chosen
    if (state.choices.every((c) => c !== null)) {
      // Reshuffle if deck is empty (excluding current card)
      if (state.deck.length === 0) {
        state.deck = shuffle(
          createDeck().filter(
            (c) => !(c.suit === state.currentCard.suit && c.rank === state.currentCard.rank)
          )
        );
      }

      const nextCard = state.deck.pop()!;
      state.nextCard = nextCard;
      state.cardsRemaining = state.deck.length;

      if (nextCard.rank > state.currentCard.rank) state.outcome = 'higher';
      else if (nextCard.rank < state.currentCard.rank) state.outcome = 'lower';
      else state.outcome = 'equal';

      if (state.outcome === 'equal') {
        state.multiplier *= 2; // double stakes on push
      } else {
        // Award points using current multiplier; multiplier resets in onPlayAgain
        (state.choices as RealHighLowChoice[]).forEach((c, i) => {
          if (c === state.outcome) room.players[i].score += state.multiplier;
        });
      }

      room.gamePhase = 'result';
    }
  },

  onGameAction(_room: Room): void {
    // Unused — High/Low resolves automatically when both players choose
  },

  onPlayAgain(room: Room, player: Player): void {
    const state = room.gameState as InternalState;

    // Record this player's ready vote (deduplicate)
    if (!state.readyVotes.includes(player.id)) {
      state.readyVotes.push(player.id);
      state.readyCount = state.readyVotes.length;
    }

    // Only advance when every player has voted ready
    if (state.readyVotes.length < room.players.length) return;

    const currentCard = state.nextCard!;
    // Carry over multiplier only after a push; reset to 1 after a scoring round
    const multiplier = state.outcome === 'equal' ? state.multiplier : 1;

    room.players.forEach((p) => { p.hasActed = false; });

    let deck = state.deck;
    if (deck.length < 2) {
      deck = shuffle(
        createDeck().filter(
          (c) => !(c.suit === currentCard.suit && c.rank === currentCard.rank)
        )
      );
    }

    room.gameState = {
      deck,
      currentCard,
      nextCard: null,
      choices: Array(room.players.length).fill(null),
      outcome: null,
      multiplier,
      cardsRemaining: deck.length,
      readyCount: 0,
      readyVotes: [],
    } satisfies InternalState;

    room.gamePhase = 'choosing';
  },

  sanitizeGameState(room: Room, playerId: string): unknown {
    const state = room.gameState as InternalState | undefined;
    if (!state) return undefined;
    const playerIndex = room.players.findIndex((p) => p.id === playerId);
    const inResult = room.gamePhase === 'result';
    return {
      currentCard: state.currentCard,
      nextCard: state.nextCard,
      choices: state.choices.map((c, i) =>
        i === playerIndex ? c : c !== null && !inResult ? 'hidden' : c
      ),
      outcome: state.outcome,
      multiplier: state.multiplier,
      cardsRemaining: state.cardsRemaining,
      readyCount: state.readyVotes.length,
    } satisfies HighLowState;
  },
};
