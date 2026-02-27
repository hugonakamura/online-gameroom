# Flip-Socket

A real-time multiplayer game platform built with a full-stack WebSocket architecture — from local development to live production. Currently ships with **Coin Flip** and **Tic-Tac-Toe**, with the codebase structured so that adding a new game type requires touching only the game files themselves.

## How it works

Players create a room, others join from the lobby, and everyone plays together in real time. The server owns all game state and broadcasts updates to the room after every action.

```
Player A ──┐
Player B ──┼──► Server (Socket.io) ──► game logic ──► broadcasts to room
Player C ──┘
```

## Features

- **Multiple games** — Coin Flip (any number of players) and Tic-Tac-Toe (2 players)
- **Auto-generated room IDs** — create a room with one click; no manual ID needed
- **Open rooms lobby** — the join screen lists all active rooms in real time; click Join to enter
- **Game type selection** — the room creator picks the game mode; joiners use the host's setting
- **Score tracking** — points accumulate across rounds; the room keeps score for the session
- **Persistent nickname** — your display name is remembered when you leave and rejoin
- **Reconnection handling** — a 10-second grace period restores your slot if you lose connection

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite (TypeScript) |
| Backend | Node.js + Express (TypeScript) |
| Real-time | Socket.io (WebSockets) |
| Deployment | Render.com |

## Project structure

Both the server and client are organized around a **game handler registry** — a pattern that lets new game types be added by dropping in one new file on each side, with zero changes to the platform code.

```
flip-socket/
├── shared/
│   └── types.ts                  # Wire types shared by server and client
│                                 #   (GameType, GamePhase, CoinFlipState, TicTacToeState,
│                                 #    PlayerState, RoomState, LobbyRoom)
│
├── server/
│   ├── index.ts                  # Express + Socket.io, room management, lobby (platform only)
│   ├── types.ts                  # Server-internal Player and Room interfaces
│   └── games/
│       ├── index.ts              # GameHandler interface + registry (Record<GameType, GameHandler>)
│       ├── coinFlip.ts           # Coin flip: roomIdPrefix, onGameStart, onGameInput, onGameAction, onPlayAgain
│       └── ticTacToe.ts          # Tic-tac-toe: roomIdPrefix, maxPlayers, onGameStart, onGameInput, onPlayAgain
│
└── client/
    ├── src/
    │   ├── App.tsx               # Socket connection, session persistence, room state
    │   ├── types.ts              # Re-exports from ../../shared/types
    │   ├── index.css             # Generic styles (layout, players, lobby, buttons)
    │   └── components/
    │       ├── JoinRoom.tsx      # Create room + lobby list + GAME_OPTIONS
    │       ├── GameRoom.tsx      # Generic shell: header, player cards, game component router
    │       └── games/
    │           ├── types.ts      # GameViewProps interface
    │           ├── index.ts      # gameViews registry (Record<GameType, ComponentType>)
    │           ├── CoinFlip/
    │           │   ├── index.tsx # Coin flip UI: choice buttons, coin animation, result
    │           │   └── CoinFlip.css
    │           └── TicTacToe/
    │               ├── index.tsx # Tic-tac-toe UI: 3×3 board, turn indicator, result
    │               └── TicTacToe.css
    └── vite.config.ts
```

## Adding a new game

Both sides follow the same registry pattern. To add a dice game, for example:

**1. Shared types** — add the game variant and its state shape:
```typescript
// shared/types.ts
export type GameType = 'coin_flip' | 'tictactoe' | 'dice';

export interface DiceState {
  // whatever the game needs
}
```

**2. Server** — implement `GameHandler` and register it:
```
server/games/dice.ts        ← roomIdPrefix, onGameStart?, onGameInput, onGameAction, onPlayAgain
server/games/index.ts       ← add:  dice: diceHandler
```

The `roomIdPrefix` on the handler (e.g. `'DICE'`) drives room ID generation (`DICE-XXXXX`). Valid game types are derived directly from the registry — no edits to `server/index.ts` needed.

**3. Client** — implement a React component and register it:
```
client/src/components/games/Dice/index.tsx   ← GameViewProps component (reads roomState.gameState)
client/src/components/games/Dice/Dice.css    ← game-specific styles
client/src/components/games/index.ts         ← add:  dice: Dice
```

**4. Lobby option**:
```typescript
// JoinRoom.tsx — GAME_OPTIONS
{ value: 'dice', label: '🎲 Dice' }
```

`server/index.ts`, `GameRoom.tsx`, and `App.tsx` need **zero changes**.

### GameHandler interface

```typescript
interface GameHandler {
  roomIdPrefix: string;           // e.g. 'FLIP', 'TTT' — drives room ID generation
  maxPlayers?: number;            // enforced on join; undefined = no limit
  onGameStart?(room: Room): void; // called on first join and after every player leave/disconnect
  onGameInput(room, player, payload): void; // player submitted a move/choice
  onGameAction(room, player): void;         // player triggered the primary action (flip, etc.)
  onPlayAgain(room): void;                  // all players want another round
}
```

All game-specific state (board, choices, results, etc.) is stored in `room.gameState` and sent to the client as `roomState.gameState`. Each game casts it to its own type.

## Running locally

### Prerequisites

- Node.js 18+
- npm

### 1. Install dependencies

```bash
npm install
cd client && npm install && cd ..
```

### 2. Start development servers

```bash
npm run dev
```

This runs both concurrently:
- **Backend** → `http://localhost:3001` (Express + Socket.io, via `tsx`)
- **Frontend** → `http://localhost:5173` (Vite dev server)

> The Vite dev server proxies all `/socket.io` traffic to the backend — no CORS config needed, and the client code works identically in dev and production.

### 3. Open the app

Go to `http://localhost:5173`. Enter a nickname, pick a game, and click **Create Room**. Share the generated room code (shown in the game header) so friends can find your room in the lobby.

Vite also prints a LAN address on startup for playing across devices on the same network.

### Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start both server and client in watch mode |
| `npm run dev:server` | Start only the backend |
| `npm run dev:client` | Start only the frontend |
| `npm run build:client` | Build React app to `client/dist/` |
| `npm start` | Run the production server via `tsx` |

## Deploying to Render.com

The included [render.yaml](render.yaml) configures a single **Web Service** that:
1. Runs `npm install && npm run build:client` — installs deps and builds the React app
2. Runs `npm start` — serves the React static files **and** handles WebSocket connections from the same process (`tsx`, no server compilation step required)

Steps:
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repository — Render will detect `render.yaml` automatically
4. Deploy

## Game flows

**Coin Flip** (any number of players):
```
waiting ──► choosing ──► ready ──► result
            (pick H/T)   (flip!)   (play again?)
```
1. **Waiting** — room created; fewer than 2 players
2. **Choosing** — 2+ players joined; everyone picks Heads or Tails
3. **Ready** — all players chose; anyone can click Flip
4. **Result** — coin revealed; correct guessers earn a point; Play Again resets to Choosing

**Tic-Tac-Toe** (exactly 2 players):
```
waiting ──► choosing ──► result
            (take turns)  (play again?)
```
1. **Waiting** — room created; waiting for second player
2. **Choosing** — players alternate placing X and O
3. **Result** — win or draw detected; winner earns a point; Play Again resets the board

## Socket events

| Direction | Event | Payload |
|---|---|---|
| C→S | `create_room` | `{ nickname, sessionId, gameType }` |
| C→S | `join_room` | `{ roomId, nickname, sessionId, gameType }` |
| C→S | `game_input` | game-specific (e.g. `{ choice }` or `{ cellIndex }`) |
| C→S | `game_action` | — |
| C→S | `play_again` | — |
| C→S | `leave_room` | — |
| S→C | `room_update` | `RoomState` (includes `roomId`, `gameState`) |
| S→C | `room_list` | `LobbyRoom[]` |
| S→C | `join_error` | `{ message }` |
