# Flip-Socket

A real-time multiplayer **Heads or Tails** game that demonstrates a full-stack WebSocket architecture — from local development to live production.

## How it works

Two players join the same Room ID, each pick a side (Heads or Tails), then either player flips the coin. The server generates the result and broadcasts it to both players simultaneously.

```
Player A ──┐
           ├──► Server (Socket.io) ──► generates result ──► broadcasts to room
Player B ──┘
```

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
│   └── types.ts          #   CoinSide, GamePhase, PlayerState, RoomState
├── server/               # Node.js + Express + Socket.io
│   └── index.ts          #   imports from ../shared/types
├── client/               # React + Vite app
│   ├── src/
│   │   ├── App.tsx
│   │   ├── types.ts      #   re-exports from ../../shared/types
│   │   ├── index.css
│   │   └── components/
│   │       ├── JoinRoom.tsx
│   │       └── GameRoom.tsx
│   └── vite.config.ts
├── dist/                 # Compiled server output (git-ignored)
│   └── server/
│       └── index.js      #   entry point (rootDir "." mirrors src layout)
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
- **Backend** → `http://localhost:3001` (Express + Socket.io)
- **Frontend** → `http://localhost:5173` (Vite dev server)

> The Vite dev server proxies all `/socket.io` traffic to the backend, so no CORS configuration is needed and the client code works identically in dev and production.

### 3. Open the app

Go to `http://localhost:5173` in two different browser tabs (or share the LAN address with another device on the same network — Vite prints the network URL on startup).

Enter the **same Room ID** in both tabs, pick your sides, and flip!

### Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start both server and client in watch mode |
| `npm run dev:server` | Start only the backend |
| `npm run dev:client` | Start only the frontend |
| `npm run build` | Build client (to `client/dist/`) then compile server (to `dist/server/`) |
| `npm start` | Run the compiled production server |

## Deploying to Render.com

The included [render.yaml](render.yaml) configures a single **Web Service** that:
1. Runs `npm install && npm run build` — installs deps, builds the React app, compiles the server
2. Runs `npm start` — serves the React static files **and** handles WebSocket connections from the same Node.js process

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

1. **Waiting** — room is open, 1 player inside
2. **Choosing** — both players pick Heads or Tails (choices are hidden from the opponent until the result)
3. **Ready** — both have chosen; either player can click Flip
4. **Result** — server reveals the coin and both choices; Play Again resets to Choosing
