# Flip-Socket

A real-time multiplayer game platform built with a full-stack WebSocket architecture — from local development to live production. Currently ships with a **Heads or Tails** coin-flip game, with the codebase structured to make adding new game types straightforward.

## How it works

Players create a room, others join from the lobby, and everyone plays together in real time. The server owns all game state and broadcasts updates to the room after every action.

```
Player A ──┐
Player B ──┼──► Server (Socket.io) ──► game logic ──► broadcasts to room
Player C ──┘
```

## Features

- **Multiplayer rooms** — any number of players can join the same room
- **Auto-generated room IDs** — create a room with one click; no manual ID needed
- **Open rooms lobby** — the join screen lists all active rooms in real time; click Join to enter
- **Game type selection** — the room creator picks the game mode; joiners use the host's setting
- **Score tracking** — points accumulate across rounds; the room keeps score for the session
- **Persistent nickname** — your display name is remembered when you leave and rejoin
- **Reconnection handling** — a 10-second grace period restores your slot if you lose connection
- **Anti-cheat** — player choices are hidden from opponents until the result is revealed

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite (TypeScript) |
| Backend | Node.js + Express (TypeScript) |
| Real-time | Socket.io (WebSockets) |
| Deployment | Render.com |

## Project structure

Both the server and client are organized around a **game handler registry** — a pattern that lets new game types be added by dropping in one new file on each side.

```
flip-socket/
├── shared/
│   └── types.ts                  # Wire types shared by server and client
│                                 #   (CoinSide, GamePhase, GameType, PlayerState, RoomState, LobbyRoom)
│
├── server/
│   ├── index.ts                  # Express + Socket.io, room management, lobby
│   ├── types.ts                  # Server-internal Player and Room interfaces
│   └── games/
│       ├── index.ts              # GameHandler interface + registry (Record<GameType, GameHandler>)
│       └── coinFlip.ts           # Coin flip: onMakeChoice, onPrimaryAction, onPlayAgain
│
└── client/
    ├── src/
    │   ├── App.tsx               # Socket connection, session persistence, room state
    │   ├── types.ts              # Re-exports from ../../shared/types
    │   ├── index.css             # Generic styles (layout, players, lobby, buttons)
    │   └── components/
    │       ├── JoinRoom.tsx      # Create room + lobby list
    │       ├── GameRoom.tsx      # Generic shell: header, player cards, game component router
    │       └── games/
    │           ├── types.ts      # GameViewProps interface
    │           ├── index.ts      # gameViews registry (Record<GameType, ComponentType>)
    │           └── CoinFlip/
    │               ├── index.tsx # Coin flip UI: choice buttons, coin animation, result
    │               └── CoinFlip.css  # Coin flip styles (isolated from generic styles)
    └── vite.config.ts
```

## Adding a new game

Both sides follow the same registry pattern. To add, say, a dice game:

**Server** — implement `GameHandler` and register it:
```
server/games/dice.ts        ← onMakeChoice, onPrimaryAction, onPlayAgain
server/games/index.ts       ← add:  dice: diceHandler
```

**Client** — implement a React component and register it:
```
client/src/components/games/Dice/index.tsx   ← GameViewProps component
client/src/components/games/Dice/Dice.css    ← game-specific styles
client/src/components/games/index.ts         ← add:  dice: Dice
```

`server/index.ts`, `GameRoom.tsx`, and `App.tsx` need **zero changes**.

Also add the new value to `GameType` in `shared/types.ts` and to the `GAME_OPTIONS` list in `JoinRoom.tsx`.

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

## Game flow (coin flip)

```
waiting ──► choosing ──► ready ──► result
            (pick H/T)   (flip!)   (play again?)
```

1. **Waiting** — room created; fewer than 2 players inside
2. **Choosing** — 2+ players joined; everyone picks Heads or Tails (choices hidden until reveal)
3. **Ready** — all players have chosen; anyone can click Flip
4. **Result** — server reveals the coin and all choices; correct guessers earn a point; Play Again resets to Choosing

## Socket events

| Direction | Event | Payload |
|---|---|---|
| C→S | `create_room` | `{ nickname, sessionId, gameType }` |
| C→S | `join_room` | `{ roomId, nickname, sessionId, gameType }` |
| C→S | `make_choice` | `{ choice: 'heads' \| 'tails' }` |
| C→S | `flip_request` | — |
| C→S | `play_again` | — |
| C→S | `leave_room` | — |
| S→C | `room_update` | `RoomState` (includes `roomId`) |
| S→C | `room_list` | `LobbyRoom[]` |
| S→C | `join_error` | `{ message }` |
