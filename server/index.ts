import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

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

// ── Types ──────────────────────────────────────────────────────────────────────
type CoinSide = 'heads' | 'tails';
type GamePhase = 'waiting' | 'choosing' | 'ready' | 'result';

interface Player {
  id: string;
  nickname: string;
  choice?: CoinSide;
}

interface Room {
  id: string;
  players: Player[];
  gamePhase: GamePhase;
  flipResult?: CoinSide;
}

// ── State ──────────────────────────────────────────────────────────────────────
const rooms = new Map<string, Room>();
const socketRooms = new Map<string, string>(); // socketId -> roomId

// ── Helpers ────────────────────────────────────────────────────────────────────
function getRoomState(room: Room) {
  return {
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      hasChosen: !!p.choice,
      // Choices are hidden until result to prevent cheating
      choice: room.gamePhase === 'result' ? p.choice : undefined,
    })),
    gamePhase: room.gamePhase,
    flipResult: room.flipResult,
    playerCount: room.players.length,
  };
}

// ── Socket handlers ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('join_room', ({ roomId, nickname }: { roomId: string; nickname: string }) => {
    if (!roomId?.trim() || !nickname?.trim()) {
      socket.emit('join_error', { message: 'Room ID and nickname are required.' });
      return;
    }

    const cleanRoomId = roomId.trim().toUpperCase().slice(0, 20);
    const cleanNickname = nickname.trim().slice(0, 20);

    let room = rooms.get(cleanRoomId);
    if (!room) {
      room = { id: cleanRoomId, players: [], gamePhase: 'waiting' };
      rooms.set(cleanRoomId, room);
    }

    if (room.players.length >= 2) {
      socket.emit('join_error', { message: 'Room is full (2/2).' });
      return;
    }

    socket.join(cleanRoomId);
    socketRooms.set(socket.id, cleanRoomId);
    room.players.push({ id: socket.id, nickname: cleanNickname });

    if (room.players.length === 2) {
      room.gamePhase = 'choosing';
    }

    io.to(cleanRoomId).emit('room_update', getRoomState(room));
    console.log(`[+] ${cleanNickname} joined ${cleanRoomId} (${room.players.length}/2)`);
  });

  socket.on('make_choice', ({ choice }: { choice: CoinSide }) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || (room.gamePhase !== 'choosing' && room.gamePhase !== 'ready')) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    if (choice !== 'heads' && choice !== 'tails') return;

    player.choice = choice;

    const allChosen = room.players.length === 2 && room.players.every((p) => p.choice);
    room.gamePhase = allChosen ? 'ready' : 'choosing';

    io.to(roomId).emit('room_update', getRoomState(room));
  });

  socket.on('flip_request', () => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.gamePhase !== 'ready') return;

    room.flipResult = Math.random() < 0.5 ? 'heads' : 'tails';
    room.gamePhase = 'result';

    io.to(roomId).emit('room_update', getRoomState(room));
    console.log(`[~] Room ${roomId}: flipped → ${room.flipResult}`);
  });

  socket.on('play_again', () => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room || room.gamePhase !== 'result') return;

    room.players.forEach((p) => { delete p.choice; });
    room.flipResult = undefined;
    room.gamePhase = 'choosing';

    io.to(roomId).emit('room_update', getRoomState(room));
  });

  socket.on('disconnect', () => {
    const roomId = socketRooms.get(socket.id);
    socketRooms.delete(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const leaving = room.players.find((p) => p.id === socket.id);
    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(roomId);
      console.log(`[-] Room ${roomId} deleted (empty)`);
    } else {
      // Reset game — the remaining player waits for a new opponent
      room.players.forEach((p) => { delete p.choice; });
      room.flipResult = undefined;
      room.gamePhase = 'waiting';
      io.to(roomId).emit('room_update', getRoomState(room));
      console.log(`[-] ${leaving?.nickname ?? socket.id} left ${roomId}`);
    }
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`🎮 Flip-Socket running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
});
