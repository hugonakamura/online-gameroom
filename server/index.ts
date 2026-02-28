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
      maxPlayers: gameHandlers[r.gameType].maxPlayers,
      spectatorCount: r.spectators.length,
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
  const hostPerson =
    room.players.find((p) => p.sessionId === room.hostSessionId) ??
    room.spectators.find((s) => s.sessionId === room.hostSessionId);
  return {
    roomId: room.id,
    hostId: hostPerson?.id ?? '',
    maxPlayers: handler.maxPlayers,
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      hasChosen: !!p.hasActed,
      score: p.score,
    })),
    spectators: room.spectators.map((s) => ({ id: s.id, nickname: s.nickname })),
    spectatorCount: room.spectators.length,
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
    // Spectators get the same sanitized view as a non-participant (all choices hidden)
    const spectatorState = getRoomState(room, '');
    room.spectators.forEach((s) => io.to(s.id).emit('room_update', spectatorState));
  } else {
    const state = getRoomState(room);
    room.players.forEach((p) => io.to(p.id).emit('room_update', state));
    room.spectators.forEach((s) => io.to(s.id).emit('room_update', state));
  }
}

/**
 * Start the game if the room is in 'waiting' and has enough players.
 * Also handles the edge case where a new player joins while others are in 'ready'.
 */
function tryStartGame(room: Room): void {
  const handler = gameHandlers[room.gameType];
  const minPlayers = handler.minPlayers ?? 2;
  if (room.gamePhase === 'waiting' && room.players.length >= minPlayers) {
    handler.onGameStart?.(room);
    room.gamePhase = 'choosing';
  } else if (room.gamePhase === 'ready') {
    // A new player joined while everyone else was ready — they still need to choose.
    room.gamePhase = 'choosing';
  }
}

/**
 * Recalculate game phase after a player leaves or steps down to spectator.
 * Calls onGameStart to reset round state whenever the room is not empty.
 */
function afterPlayerRemoved(room: Room): void {
  const handler = gameHandlers[room.gameType];
  const minPlayers = handler.minPlayers ?? 2;
  if (room.players.length === 0) {
    room.gamePhase = 'waiting';
    return;
  }
  handler.onGameStart?.(room);
  room.gamePhase = room.players.length >= minPlayers ? 'choosing' : 'waiting';
}

/**
 * Transfer host to the next oldest person in the room when the host permanently leaves.
 * Players take priority over spectators (oldest by position in array).
 * Only called on leave_room and disconnect timeout — NOT on become_spectator.
 */
function transferHostIfNeeded(room: Room, removedSessionId: string): void {
  if (removedSessionId !== room.hostSessionId) return;
  const next = room.players[0] ?? room.spectators[0];
  if (next) room.hostSessionId = next.sessionId;
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

      const room: Room = { id: roomId, players: [], spectators: [], gamePhase: 'waiting', gameType: safeGameType, hostSessionId: sessionId };
      rooms.set(roomId, room);

      socket.leave('lobby');
      socket.join(roomId);
      socketRooms.set(socket.id, roomId);
      sessions.set(sessionId, roomId);
      room.players.push({ id: socket.id, sessionId, nickname: cleanNickname, score: 0 });

      tryStartGame(room);
      broadcastRoomUpdate(room);
      broadcastLobby();
      console.log(`[+] ${cleanNickname} created ${roomId} (${safeGameType})`);
    },
  );

  socket.on(
    'join_room',
    ({ roomId, nickname, sessionId, gameType, role }: { roomId: string; nickname: string; sessionId: string; gameType: GameType; role?: 'player' | 'spectator' }) => {
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
          // Check active players first
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

          // Check spectators
          const existingSpectator = existingRoom.spectators.find((s) => s.sessionId === sessionId);
          if (existingSpectator) {
            socketRooms.delete(existingSpectator.id);
            existingSpectator.id = socket.id;
            socketRooms.set(socket.id, existingRoomId);
            socket.leave('lobby');
            const handler = gameHandlers[existingRoom.gameType];
            const spectatorState = handler.sanitizeGameState
              ? getRoomState(existingRoom, '')
              : getRoomState(existingRoom);
            socket.emit('room_update', spectatorState);
            console.log(`[~] ${existingSpectator.nickname} reconnected as spectator to ${existingRoomId}`);
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
        if (role === 'spectator') {
          socket.emit('join_error', { message: 'Room not found.' });
          return;
        }
        // Only the first player (creator) sets the game type.
        const validGameTypes = Object.keys(gameHandlers) as GameType[];
        const safeGameType: GameType = validGameTypes.includes(gameType) ? gameType : 'coin_flip';
        room = { id: cleanRoomId, players: [], spectators: [], gamePhase: 'waiting', gameType: safeGameType };
        rooms.set(cleanRoomId, room);
      }

      // ── Spectator join ─────────────────────────────────────────────────────
      if (role === 'spectator') {
        socketRooms.set(socket.id, cleanRoomId);
        sessions.set(sessionId, cleanRoomId);
        room.spectators.push({ id: socket.id, sessionId, nickname: cleanNickname, score: 0 });
        socket.leave('lobby');
        const handler = gameHandlers[room.gameType];
        const spectatorState = handler.sanitizeGameState
          ? getRoomState(room, '')
          : getRoomState(room);
        socket.emit('room_update', spectatorState);
        // Notify all players/spectators that spectator count changed
        broadcastRoomUpdate(room);
        broadcastLobby();
        console.log(`[👁] ${cleanNickname} joined ${cleanRoomId} as spectator`);
        return;
      }

      // ── Player join ────────────────────────────────────────────────────────
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

      tryStartGame(room);

      broadcastRoomUpdate(room);
      broadcastLobby();
      console.log(`[+] ${cleanNickname} joined ${cleanRoomId} (${room.players.length}/${handler.maxPlayers ?? '∞'})`);
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

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    gameHandlers[room.gameType].onPlayAgain(room, player);
    broadcastRoomUpdate(room);
  });

  socket.on('become_spectator', () => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);

    // Remove from players (same teardown as a player leaving)
    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0 && room.spectators.length === 0) {
      // Nobody left at all — just delete the room
      rooms.delete(roomId);
      broadcastLobby();
      console.log(`[-] Room ${roomId} deleted (empty after become_spectator)`);
      return;
    }

    // Add to spectators (keep same socket, sessionId, nickname; reset score context)
    room.spectators.push({ id: socket.id, sessionId: player.sessionId, nickname: player.nickname, score: 0 });

    // Reset the game for remaining players (same as a player leaving)
    afterPlayerRemoved(room);

    broadcastRoomUpdate(room);
    broadcastLobby();
    console.log(`[👁] ${player.nickname} became a spectator in ${roomId}`);
  });

  socket.on('sit_in', () => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const spectator = room.spectators.find((s) => s.id === socket.id);
    if (!spectator) return;

    const handler = gameHandlers[room.gameType];
    if (handler.maxPlayers && room.players.length >= handler.maxPlayers) {
      socket.emit('join_error', { message: 'Room is full.' });
      return;
    }

    // Remove from spectators, add to players
    room.spectators = room.spectators.filter((s) => s.id !== socket.id);
    room.players.push({ id: socket.id, sessionId: spectator.sessionId, nickname: spectator.nickname, score: spectator.score });
    socket.join(roomId); // join the Socket.io room for player broadcasts

    tryStartGame(room);

    broadcastRoomUpdate(room);
    broadcastLobby();
    console.log(`[+] ${spectator.nickname} sat in as player in ${roomId}`);
  });

  socket.on('leave_room', () => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;
    socketRooms.delete(socket.id);

    const room = rooms.get(roomId);
    if (!room) return;

    // ── Spectator leaving ──────────────────────────────────────────────────
    const spectatorIdx = room.spectators.findIndex((s) => s.id === socket.id);
    if (spectatorIdx !== -1) {
      const spectator = room.spectators[spectatorIdx];
      room.spectators = room.spectators.filter((s) => s.id !== socket.id);
      transferHostIfNeeded(room, spectator.sessionId);
      sessions.delete(spectator.sessionId);
      socket.join('lobby');
      if (room.players.length >= 1) broadcastRoomUpdate(room);
      broadcastLobby();
      console.log(`[-] Spectator ${spectator.nickname} left ${roomId}`);
      return;
    }

    // ── Player leaving ─────────────────────────────────────────────────────
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);

    room.players = room.players.filter((p) => p.id !== socket.id);
    transferHostIfNeeded(room, player.sessionId);
    sessions.delete(player.sessionId);
    socket.leave(roomId);

    socket.join('lobby');

    if (room.players.length === 0 && room.spectators.length === 0) {
      rooms.delete(roomId);
      console.log(`[-] Room ${roomId} deleted (empty)`);
    } else {
      afterPlayerRemoved(room);
      broadcastRoomUpdate(room);
      console.log(`[-] ${player.nickname} left ${roomId}`);
    }

    broadcastLobby();
  });

  socket.on('change_game', ({ gameType }: { gameType: GameType }) => {
    const roomId = socketRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Validate game type
    const validGameTypes = Object.keys(gameHandlers) as GameType[];
    if (!validGameTypes.includes(gameType)) return;

    // Only host can change game (host may be a player or spectator)
    const person = [...room.players, ...room.spectators].find((p) => p.id === socket.id);
    if (!person || person.sessionId !== room.hostSessionId) return;

    // Move excess players (newest first) to spectators if the new game has a lower cap
    const newHandler = gameHandlers[gameType];
    if (newHandler.maxPlayers !== undefined) {
      while (room.players.length > newHandler.maxPlayers) {
        const excess = room.players.pop()!;
        room.spectators.push({ id: excess.id, sessionId: excess.sessionId, nickname: excess.nickname, score: excess.score });
      }
    }

    // Reset game state; clear acted flags on remaining players
    room.players.forEach((p) => { delete p.hasActed; });
    room.gameType = gameType;
    room.gameState = undefined;
    room.gamePhase = 'waiting';
    tryStartGame(room);

    broadcastRoomUpdate(room);
    broadcastLobby();
    console.log(`[~] Room ${roomId}: game changed to ${gameType} by ${person.nickname}`);
  });

  socket.on('disconnect', () => {
    const roomId = socketRooms.get(socket.id);
    socketRooms.delete(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // ── Spectator disconnecting ────────────────────────────────────────────
    const spectatorIdx = room.spectators.findIndex((s) => s.id === socket.id);
    if (spectatorIdx !== -1) {
      const spectator = room.spectators[spectatorIdx];
      room.spectators = room.spectators.filter((s) => s.id !== socket.id);
      transferHostIfNeeded(room, spectator.sessionId);
      sessions.delete(spectator.sessionId);
      if (room.players.length >= 1) broadcastRoomUpdate(room);
      if (room.players.length === 0 && room.spectators.length === 0) rooms.delete(roomId);
      broadcastLobby();
      console.log(`[!] Spectator ${spectator.nickname} disconnected from ${roomId}`);
      return;
    }

    // ── Player disconnecting ───────────────────────────────────────────────
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
      transferHostIfNeeded(room, player.sessionId);
      sessions.delete(player.sessionId);

      if (room.players.length === 0 && room.spectators.length === 0) {
        rooms.delete(roomId);
        console.log(`[-] Room ${roomId} deleted (empty)`);
      } else {
        afterPlayerRemoved(room);
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
