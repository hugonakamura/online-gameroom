import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { GameType, RoomState, LobbyRoom } from '../shared/types';
import { Room } from './types';
import { gameHandlers } from './games/index';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3001;

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── State ──────────────────────────────────────────────────────────────────────
const rooms = new Map<string, Room>();
const socketRooms = new Map<string, string>(); // socketId  → roomId
const sessions   = new Map<string, string>(); // sessionId → roomId

const RECONNECT_GRACE_MS = 10_000; // 10 s to come back before being removed

// ── Helpers ────────────────────────────────────────────────────────────────────
function generateRoomId(gameType: GameType): string {
  const prefix = gameHandlers[gameType].roomIdPrefix;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes O, 0, 1, I to avoid confusion
  const rand = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${rand}`;
}

function getLobbyRooms(): LobbyRoom[] {
  return Array.from(rooms.values())
    .filter((r) => r.players.length >= 1)
    .map((r) => ({
      id: r.id,
      host: r.players[0].nickname,
      gameType: r.gameType,
      playerCount: r.players.length,
      gamePhase: r.gamePhase,
    }));
}

function broadcastLobby() {
  io.to('lobby').emit('room_list', getLobbyRooms());
}

function getRoomState(room: Room, playerId?: string): RoomState {
  const handler = gameHandlers[room.gameType];
  const gameState =
    playerId !== undefined && handler.sanitizeGameState
      ? handler.sanitizeGameState(room, playerId)
      : room.gameState;
  return {
    roomId: room.id,
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      hasChosen: !!p.hasActed,
      score: p.score,
    })),
    gamePhase: room.gamePhase,
    gameType: room.gameType,
    gameState,
    playerCount: room.players.length,
  };
}

function broadcastRoomUpdate(room: Room): void {
  const handler = gameHandlers[room.gameType];
  if (handler.sanitizeGameState) {
    // Send each player a personalized view with opponent choices hidden
    room.players.forEach((p) => {
      io.to(p.id).emit('room_update', getRoomState(room, p.id));
    });
  } else {
    io.to(room.id).emit('room_update', getRoomState(room));
  }
}

// ── Socket handlers ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // New connections go to the lobby and immediately get the current room list.
  socket.join('lobby');
  socket.emit('room_list', getLobbyRooms());

  socket.on(
    'create_room',
    ({ nickname, sessionId, gameType }: { nickname: string; sessionId: string; gameType: GameType }) => {
      if (!nickname?.trim()) {
        socket.emit('join_error', { message: 'Nickname is required.' });
        return;
      }

      const cleanNickname = nickname.trim().slice(0, 20);
      const validGameTypes = Object.keys(gameHandlers) as GameType[];
      const safeGameType: GameType = validGameTypes.includes(gameType) ? gameType : 'coin_flip';

      // Generate a collision-free room ID
      let roomId = generateRoomId(safeGameType);
      while (rooms.has(roomId)) roomId = generateRoomId(safeGameType);

      const room: Room = { id: roomId, players: [], gamePhase: 'waiting', gameType: safeGameType };
      rooms.set(roomId, room);

      socket.leave('lobby');
      socket.join(roomId);
      socketRooms.set(socket.id, roomId);
      sessions.set(sessionId, roomId);
      room.players.push({ id: socket.id, sessionId, nickname: cleanNickname, score: 0 });

      broadcastRoomUpdate(room);
      broadcastLobby();
      console.log(`[+] ${cleanNickname} created ${roomId} (${safeGameType})`);
    },
  );

  socket.on(
    'join_room',
    ({ roomId, nickname, sessionId, gameType }: { roomId: string; nickname: string; sessionId: string; gameType: GameType }) => {
      if (!roomId?.trim() || !nickname?.trim()) {
        socket.emit('join_error', { message: 'Room ID and nickname are required.' });
        return;
      }

      // ── Reconnection path ──────────────────────────────────────────────────
      // If this sessionId already has a slot in a room, restore it instead of
      // creating a new player entry (handles network flickers / page refreshes).
      const existingRoomId = sessions.get(sessionId);
      if (existingRoomId) {
        const existingRoom = rooms.get(existingRoomId);
        if (existingRoom) {
          const existingPlayer = existingRoom.players.find((p) => p.sessionId === sessionId);
          if (existingPlayer) {
            // Cancel pending removal timer
            if (existingPlayer.disconnectTimer) {
              clearTimeout(existingPlayer.disconnectTimer);
              delete existingPlayer.disconnectTimer;
            }

            // Swap the old socket.id for the new one
            socketRooms.delete(existingPlayer.id);
            existingPlayer.id = socket.id;
            socketRooms.set(socket.id, existingRoomId);
            socket.leave('lobby');
            socket.join(existingRoomId);

            broadcastRoomUpdate(existingRoom);
            console.log(`[~] ${existingPlayer.nickname} reconnected to ${existingRoomId}`);
            return;
          }
        }
        // Room is gone — let the session fall through to a normal join
        sessions.delete(sessionId);
      }

      // ── Normal join path ───────────────────────────────────────────────────
      const cleanRoomId   = roomId.trim().toUpperCase().slice(0, 20);
      const cleanNickname = nickname.trim().slice(0, 20);

      let room = rooms.get(cleanRoomId);
      if (!room) {
        // Only the first player (creator) sets the game type.
        const validGameTypes = Object.keys(gameHandlers) as GameType[];
        const safeGameType: GameType = validGameTypes.includes(gameType) ? gameType : 'coin_flip';
        room = { id: cleanRoomId, players: [], gamePhase: 'waiting', gameType: safeGameType };
        rooms.set(cleanRoomId, room);
      }

      const handler = gameHandlers[room.gameType];
      if (handler.maxPlayers && room.players.length >= handler.maxPlayers) {
        socket.emit('join_error', { message: 'Room is full.' });
        return;
      }

      socket.leave('lobby');
      socket.join(cleanRoomId);
      socketRooms.set(socket.id, cleanRoomId);
      sessions.set(sessionId, cleanRoomId);
      room.players.push({ id: socket.id, sessionId, nickname: cleanNickname, score: 0 });

      if (room.gamePhase === 'waiting' && room.players.length >= 2) {
        handler.onGameStart?.(room);
        room.gamePhase = 'choosing';
      } else if (room.gamePhase === 'ready') {
        // New player joined while everyone else was ready — they still need to choose.
        room.gamePhase = 'choosing';
      }

      broadcastRoomUpdate(room);
      broadcastLobby();
      console.log(`[+] ${cleanNickname} joined ${cleanRoomId} (${room.players.length}/2)`);
    },
  );

  socket.on('game_input', (payload: unknown) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || (room.gamePhase !== 'choosing' && room.gamePhase !== 'ready')) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    gameHandlers[room.gameType].onGameInput(room, player, payload);
    broadcastRoomUpdate(room);
  });

  socket.on('game_action', () => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.gamePhase !== 'ready') return;

    const player = room.players.find((p) => p.id === socket.id)!;
    gameHandlers[room.gameType].onGameAction(room, player);
    broadcastRoomUpdate(room);
    console.log(`[~] Room ${roomId}: game_action by ${player.nickname}`);
  });

  socket.on('play_again', () => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.gamePhase !== 'result') return;

    gameHandlers[room.gameType].onPlayAgain(room);
    broadcastRoomUpdate(room);
  });

  socket.on('leave_room', () => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;
    socketRooms.delete(socket.id);

    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);

    room.players = room.players.filter((p) => p.id !== socket.id);
    sessions.delete(player.sessionId);
    socket.leave(roomId);

    socket.join('lobby');

    if (room.players.length === 0) {
      rooms.delete(roomId);
      console.log(`[-] Room ${roomId} deleted (empty)`);
    } else {
      gameHandlers[room.gameType].onGameStart?.(room);
      room.gamePhase = room.players.length >= 2 ? 'choosing' : 'waiting';
      broadcastRoomUpdate(room);
      console.log(`[-] ${player.nickname} left ${roomId}`);
    }

    broadcastLobby();
  });

  socket.on('disconnect', () => {
    const roomId = socketRooms.get(socket.id);
    socketRooms.delete(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    console.log(`[!] ${player.nickname} disconnected from ${roomId} — waiting ${RECONNECT_GRACE_MS / 1000}s`);

    // Don't remove immediately. Give the client time to reconnect.
    // If join_room arrives with the same sessionId within the window, the
    // timer is cancelled and the slot is restored. Otherwise, they are removed.
    player.disconnectTimer = setTimeout(() => {
      // If player.id changed it means they already reconnected — do nothing.
      if (player.id !== socket.id) return;

      room.players = room.players.filter((p) => p.sessionId !== player.sessionId);
      sessions.delete(player.sessionId);

      if (room.players.length === 0) {
        rooms.delete(roomId);
        console.log(`[-] Room ${roomId} deleted (empty)`);
      } else {
        gameHandlers[room.gameType].onGameStart?.(room);
        room.gamePhase = room.players.length >= 2 ? 'choosing' : 'waiting';
        broadcastRoomUpdate(room);
        console.log(`[-] ${player.nickname} timed out, removed from ${roomId}`);
      }

      broadcastLobby();
    }, RECONNECT_GRACE_MS);
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`🎮 Flip-Socket running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
});
