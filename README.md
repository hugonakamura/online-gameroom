# Flip-Socket

A real-time multiplayer coin-flip game built with a full-stack WebSocket architecture — from local development to live production.

## How it works

Players join a shared Room ID, each picks a side (Heads or Tails), and once everyone has chosen, any player can flip the coin. The server generates the result and broadcasts it to all players simultaneously. Correct guessers earn a point — scores persist for the duration of the session.

```
Player A ──┐
Player B ──┼──► Server (Socket.io) ──► generates result ──► broadcasts to room
Player C ──┘
```

## Features

- **Multiplayer rooms** — any number of players can join the same room
- **Score tracking** — points accumulate across rounds; the room keeps score for the session
- **Open rooms lobby** — the join screen shows all active rooms in real time; click Join to enter instantly
- **Game type selection** — the room creator picks the game mode; joiners use the host's setting
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

```
flip-socket/
├── shared/               # Shared TypeScript types (single source of truth)
│   └── types.ts          #   CoinSide, GamePhase, GameType, PlayerState, RoomState, LobbyRoom
├── server/               # Node.js + Express + Socket.io
│   └── index.ts          #   game logic, room state, lobby broadcasts
├── client/               # React + Vite app
│   ├── src/
│   │   ├── App.tsx        #   socket connection, session persistence
│   │   ├── types.ts       #   re-exports from ../../shared/types
│   │   ├── index.css
│   │   └── components/
│   │       ├── JoinRoom.tsx   # join/create screen + lobby list
│   │       └── GameRoom.tsx   # in-game UI
│   └── vite.config.ts
├── tsconfig.json         # Server TypeScript config (rootDir: ".")
├── package.json          # Server deps + build scripts
└── render.yaml           # Render.com deployment config
```

## Running locally

### Prerequisites

- Node.js 18+
- npm

### 1. Install dependencies

```bash
# Server dependencies (root)
npm install

# Client dependencies
cd client && npm install && cd ..
```

### 2. Start development servers

```bash
npm run dev
```

This runs both servers concurrently:
- **Backend** → `http://localhost:3001` (Express + Socket.io, via `tsx`)
- **Frontend** → `http://localhost:5173` (Vite dev server)

> The Vite dev server proxies all `/socket.io` traffic to the backend, so no CORS configuration is needed and the client code works identically in dev and production.

### 3. Open the app

Go to `http://localhost:5173`. To play with others, share the **Room ID** — anyone who types the same ID joins your room. Vite also prints a LAN address on startup for playing across devices on the same network.

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
2. Runs `npm start` — serves the React static files **and** handles WebSocket connections from the same Node.js process (using `tsx` — no server compilation step required)

Steps:
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repository — Render will detect `render.yaml` automatically
4. Deploy

## Game flow

```
waiting ──► choosing ──► ready ──► result
            (pick H/T)   (flip!)   (play again?)
```

1. **Waiting** — room is open, fewer than 2 players inside
2. **Choosing** — 2+ players are in; everyone picks Heads or Tails (choices hidden from opponents)
3. **Ready** — everyone has chosen; any player can click Flip
4. **Result** — server reveals the coin and all choices; correct guessers earn a point; Play Again resets to Choosing

## Socket events

| Direction | Event | Payload |
|---|---|---|
| C→S | `join_room` | `{ roomId, nickname, sessionId, gameType }` |
| C→S | `make_choice` | `{ choice: 'heads' \| 'tails' }` |
| C→S | `flip_request` | — |
| C→S | `play_again` | — |
| C→S | `leave_room` | — |
| S→C | `room_update` | `RoomState` |
| S→C | `room_list` | `LobbyRoom[]` |
| S→C | `join_error` | `{ message }` |
