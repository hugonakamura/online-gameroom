import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { CoinSide, GamePhase, GameType, RoomState, LobbyRoom } from '../shared/types';

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
interface Player {
  id: string;       // current socket.id — changes on reconnect
  sessionId: string; // persistent client identity (stored in localStorage)
  nickname: string;
  score: number;
  choice?: CoinSide;
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

interface Room {
  id: string;
  players: Player[];
  gamePhase: GamePhase;
  gameType: GameType;
  flipResult?: CoinSide;
}

// ── State ──────────────────────────────────────────────────────────────────────
const rooms = new Map<string, Room>();
const socketRooms = new Map<string, string>(); // socketId  → roomId
const sessions   = new Map<string, string>(); // sessionId → roomId

const RECONNECT_GRACE_MS = 10_000; // 10 s to come back before being removed

// ── Helpers ────────────────────────────────────────────────────────────────────
function getLobbyRooms(): LobbyRoom[] {
  return Array.from(rooms.values())
    .filter((r) => r.gamePhase === 'waiting' && r.players.length === 1)
    .map((r) => ({ id: r.id, host: r.players[0].nickname, gameType: r.gameType }));
}

function broadcastLobby() {
  io.to('lobby').emit('room_list', getLobbyRooms());
}

function getRoomState(room: Room): RoomState {
  return {
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      hasChosen: !!p.choice,
      score: p.score,
      // Choices are hidden until result to prevent cheating
      choice: room.gamePhase === 'result' ? p.choice : undefined,
    })),
    gamePhase: room.gamePhase,
    gameType: room.gameType,
    flipResult: room.flipResult,
    playerCount: room.players.length,
  };
}

// ── Socket handlers ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // New connections go to the lobby and immediately get the current room list.
  socket.join('lobby');
  socket.emit('room_list', getLobbyRooms());

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

            io.to(existingRoomId).emit('room_update', getRoomState(existingRoom));
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
        const validGameTypes: GameType[] = ['coin_flip'];
        const safeGameType: GameType = validGameTypes.includes(gameType) ? gameType : 'coin_flip';
        room = { id: cleanRoomId, players: [], gamePhase: 'waiting', gameType: safeGameType };
        rooms.set(cleanRoomId, room);
      }

      if (room.players.length >= 2) {
        socket.emit('join_error', { message: 'Room is full (2/2).' });
        return;
      }

      socket.leave('lobby');
      socket.join(cleanRoomId);
      socketRooms.set(socket.id, cleanRoomId);
      sessions.set(sessionId, cleanRoomId);
      room.players.push({ id: socket.id, sessionId, nickname: cleanNickname, score: 0 });

      if (room.players.length === 2) {
        room.gamePhase = 'choosing';
      }

      io.to(cleanRoomId).emit('room_update', getRoomState(room));
      broadcastLobby();
      console.log(`[+] ${cleanNickname} joined ${cleanRoomId} (${room.players.length}/2)`);
    },
  );

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

    room.players
      .filter((p) => p.choice === room.flipResult)
      .forEach((p) => { p.score += 1; });

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
      room.players.forEach((p) => { delete p.choice; });
      room.flipResult = undefined;
      room.gamePhase = 'waiting';
      io.to(roomId).emit('room_update', getRoomState(room));
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
        room.players.forEach((p) => { delete p.choice; });
        room.flipResult = undefined;
        room.gamePhase = 'waiting';
        io.to(roomId).emit('room_update', getRoomState(room));
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
