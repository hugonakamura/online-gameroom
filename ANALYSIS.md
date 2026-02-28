# Codebase Analysis — Flip-Socket

An honest review of where the codebase stands today: what's broken, what's fragile, and what will cause pain if the project keeps growing. Issues are grouped by category and ranked within each section (most severe first).

Priority labels used throughout: **P1** — fix now (correctness / security / crash risk) · **P2** — address soon (reliability / developer safety) · **P3** — polish / deferred (optimization / UX convenience, safe to defer).

---

## 1. Bugs & Correctness

### Race conditions in game state transitions
> **Priority: P1**

Every game handler is vulnerable to concurrent socket events being processed against the same room object. Node.js is single-threaded but socket.io callbacks execute between I/O ticks, so two clients firing events within the same event-loop cycle will both read stale state before either write is applied.

**Specific cases:**
- **CoinFlip** — two players submitting their choice at the same moment can both see `allChosen = false`, both attempt the `waiting → ready` transition, and the phase flips twice.
- **RPS / HighLow** — winner/score calculation runs on the first "all-chosen" signal. Two concurrent submissions can both satisfy the `allChosen` check and award points twice.
- **Tic-Tac-Toe** — `currentTurn` is read before being written, so two concurrent move events can place two pieces on the same turn.
- **HighLow deck** — the `deck.pop()!` call is not guarded against a concurrent reshuffle. Two events can both observe an empty deck, both trigger a reshuffle, and leave the deck in an inconsistent state.

None of these will reproduce reliably in manual testing (where events are naturally serialized by human timing), but they are real at scale or under load.

### `findIndex` returning `-1` used directly as an array index
> **Priority: P1**

Every game handler uses the pattern:

```typescript
const idx = room.players.findIndex(p => p.id === player.id);
state.choices[idx] = choice; // idx could be -1
```

`array[-1]` in JavaScript silently creates a property on the array object without throwing — the choice is "written" to a phantom key and never read back. The bug is invisible until you're trying to debug why a player's action had no effect.

### Disconnect timer leaks when a room is deleted
> **Priority: P2**

When the last player disconnects, the room is deleted immediately. But the `disconnectTimer` that was already running for that player still holds a reference to the now-deleted room. Ten seconds later, the callback fires, calls `room.players.filter(...)` on a dead object, and—because of the `if (player.id !== socket.id) return` guard—does nothing visible. No crash, no error, but the timer and its closure are held in memory until it fires, and the pattern scales to a leak if rooms turn over quickly.

### `isRejoining` can hang forever on the client
> **Priority: P2**

`isRejoining` is initialised from `localStorage` (if the user has a saved room ID and nickname) and is only ever cleared when a `room_update` event arrives. If the server rejects the rejoin or the room no longer exists, the server sends `join_error` — but `setIsRejoining(false)` is only called in the `join_error` handler after clearing session state. If the error handler is hit before `isRejoining` is cleared, the app escapes the spinner. If it is not (e.g., a different code path), the loading screen is permanent until a hard reload.

### Game type default in JoinRoom is hardcoded
> **Priority: P3**

`JoinRoom` initialises its `gameType` state to `'coin_flip'` regardless of what `gameOptions` the server sends. If a future server ships with a different first game or removes coin flip entirely, the form silently pre-selects an invalid value and the `create_room` event will fail or be rejected.

---

## 2. Architecture Issues

### No error boundaries around game views
> **Priority: P1**

`GameRoom.tsx` renders the active game inside a `<Suspense>` fallback but has no React error boundary. If a game component throws during render (bad `gameState` shape, null access, unexpected phase value), the entire room screen unmounts and the user sees a blank page or the app-level crash UI. An error boundary would contain the crash to the game area and allow recovery without losing the header, player list, or room state.

### No error handling on game handler calls
> **Priority: P1**

In `server/index.ts`, all calls into game handlers are unguarded:

```typescript
gameHandlers[room.gameType].onGameInput(room, player, payload);
broadcastRoomUpdate(room);
```

If `onGameInput` throws — malformed gameState, a null dereference, anything — the exception propagates up to the socket.io event loop, the socket crashes without sending a response to the client, and the room state may be left half-mutated. The client has no idea what happened and will never receive a `room_update`. Wrapping handler calls in `try/catch` and emitting a `room_error` event on failure would make failures observable.

### No payload validation on the server
> **Priority: P1**

Every `game_input` payload is typed as `unknown` and immediately cast to the expected shape inside the handler:

```typescript
const { choice } = payload as { choice: CoinSide };
```

There is no runtime check that the payload is an object, has the expected key, or that the value is in the allowed set before the cast. A malicious or buggy client can send `null`, an empty object, or a string and trigger a null-dereference in the handler. Basic Zod schemas (or even manual `typeof` guards) at the entry point would fix this.

### Socket events are stringly typed on both ends
> **Priority: P2**

Every `emit` and `socket.on` call uses a plain string as the event name with no shared contract. The client's `emit` function is typed as `(event: string, payload?: unknown) => void`, which means a game component can call `emit('game_innput', ...)` (typo) or send the wrong payload shape and TypeScript will not complain. Socket.io supports a typed event map — a shared `ServerToClientEvents` / `ClientToServerEvents` interface in `shared/types.ts` would make every event call type-safe at compile time.

### State redundancy in `App.tsx`
> **Priority: P3**

`App.tsx` maintains `inRoom: boolean`, `inRoomRef: RefObject<boolean>`, and `roomId: string` as separate state, but all three can be derived from whether `roomState !== null`. The ref exists to avoid re-registering socket listeners when `inRoom` changes, which is a workaround for the event setup living inside a single `useEffect`. Moving socket setup into a custom hook (e.g., `useGameSocket`) would eliminate the ref, reduce the state count, and make the reconnection logic independently testable.

### `maxPlayers` has two sources of truth
> **Priority: P3**

`RoomState.maxPlayers` (sent on every `room_update`) and `GameOption.maxPlayers` (sent once on connect) both carry the same value for the current game. The client uses `GameOption.maxPlayers` for the overflow warning in the game switcher and `RoomState.maxPlayers` is currently unused on the client. Keeping both in sync is fine today (they come from the same handler field), but it's easy to forget to expose one when adding a new game and end up with inconsistencies.

---

## 3. Scalability Concerns

### `getLobbyRooms()` runs on every room change
> **Priority: P3**

`getLobbyRooms()` creates a new array, filters empty rooms, and maps every room to a `LobbyRoom` object. It is called from `broadcastLobby()`, which is called on every join, leave, become-spectator, sit-in, disconnect, and game change. With many concurrent rooms this is an O(n) full scan triggered by every single game action. A lobby-specific index (a `Map<roomId, LobbyRoom>` kept in sync) would reduce this to O(1) reads.

### `broadcastRoomUpdate` loops per-player instead of using socket.io rooms
> **Priority: P3**

For games without `sanitizeGameState`, all players receive the same payload. Currently the code loops over `room.players` and emits individually:

```typescript
room.players.forEach(p => io.to(p.id).emit('room_update', state));
```

Socket.io has a built-in room concept (not the same as the game room — it's a socket.io channel). All players in the same socket.io room receive a single `io.to(roomId).emit(...)` call. For games with sanitized state this isn't possible (each player needs a different payload), but for the majority of phases it would reduce the emit count from O(players) to O(1).

### All state is in-memory with no persistence
> **Priority: P2**

Rooms, sessions, and socket mappings live in `Map` objects on the server process. A server restart (deploy, crash, scaling event) wipes all active rooms. This is fine for a prototype but becomes a problem when:
- You want zero-downtime deploys
- Render.com recycles the container (which it does periodically)
- You want to run more than one server instance

A Redis store for session/room state (or even periodic serialisation to disk) would allow restarts without dropping active games.

### No connection or room limits
> **Priority: P1**

There is no cap on the number of simultaneous socket connections, rooms, or spectators per room. A single script could open thousands of connections and fill memory. Render.com's free tier will run out of RAM before socket.io refuses a connection.

### No rate limiting on socket events
> **Priority: P1**

A client can fire `game_input` at 1000 events per second. Every event triggers state mutation, a `broadcastRoomUpdate`, and a `broadcastLobby`. There is no debouncing, throttling, or per-connection rate limiting.

---

## 4. Testing & Reliability

### Zero automated tests
> **Priority: P2**

There are no test files anywhere in the project — no unit tests, no integration tests, no end-to-end tests. The entire behaviour of every game handler, every state transition, and every socket event is validated only by manual play.

The game logic is the most testable part of the codebase — `coinFlipHandler.onGameInput(room, player, payload)` takes plain objects and returns nothing (mutates in place). A test suite could create a mock `Room`, call handler functions directly, and assert on `room.gameState` and `room.gamePhase`. This doesn't require a real socket or a running server. The barrier to starting is low.

### No CI/CD validation
> **Priority: P2**

The deploy pipeline (`render.yaml`) runs `npm run build:client` and then starts the server. There is no `tsc --noEmit` typecheck, no lint step, and no test run before deployment. A broken TypeScript file or a runtime crash in a handler will only be discovered after the broken version is live.

---

## 5. Client UX Gaps

### Actions are fire-and-forget with no pending state
> **Priority: P3**

When a user clicks "Spectate", "Sit In", "Leave", or "Change" (game switch), the client emits a socket event and immediately re-enables the button. There is no disabled state while waiting for the server's `room_update` response. Rapid double-clicking sends the event twice — the server handles this gracefully in most cases (idempotent operations), but it is not guaranteed, and the UX is misleading.

### No copy-to-clipboard for room code
> **Priority: P3**

The room ID displayed in the header is the only way to invite someone to a room. There is no button to copy it to the clipboard. Users must manually select the text and copy it, which is error-prone on mobile.

### Error messages do not auto-clear or dismiss
> **Priority: P3**

`joinError` in `App.tsx` is only cleared when a successful `room_update` or `join_error` arrives. If a user gets "Room not found", the message stays on screen until they attempt another action. There is no dismiss button. If they switch to entering a different room ID, the old error is still visible.

### No feedback on socket connection failure
> **Priority: P2**

If `io()` fails to connect (server is down, network error), `isConnected` stays `false` and the user sees "Connecting to server…" indefinitely. There is no timeout, no retry count display, and no actionable error message.

### No error recovery in the game view
> **Priority: P1**

As noted above, a runtime error inside a game component renders the room unusable. The user cannot leave, switch games, or take any action because the component tree is dead. An error boundary with a "Something went wrong — leave room" fallback would be sufficient.

---

## 6. Expansion Recommendations

If the project grows — more games, more players, or multiple developers — these are the highest-leverage changes:

### Extract game logic into pure functions
> **Priority: P2** — prerequisite for meaningful unit tests

Instead of handlers mutating the `room` object directly, extract the core logic into pure functions:

```typescript
// Before (in handler)
state.choices[idx] = choice;
if (state.choices.every(c => c !== null)) { room.gamePhase = 'ready'; }

// After (pure)
function applyChoice(state: CoinFlipState, idx: number, choice: CoinSide): CoinFlipState { ... }
function isRoundComplete(state: CoinFlipState): boolean { ... }
```

Pure functions are trivially unit-testable, have no side effects, and are easy to reason about. The handler becomes a thin orchestration layer.

### Add typed socket event contracts
> **Priority: P2** — eliminates the stringly-typed event problem permanently

In `shared/types.ts`, define the full event map:

```typescript
export interface ClientToServerEvents {
  create_room: (payload: { nickname: string; sessionId: string; gameType: GameType }) => void;
  game_input:  (payload: unknown) => void;
  change_game: (payload: { gameType: GameType }) => void;
  // ...
}
export interface ServerToClientEvents {
  room_update:   (state: RoomState) => void;
  room_list:     (rooms: LobbyRoom[]) => void;
  game_options:  (options: GameOption[]) => void;
  join_error:    (error: { message: string }) => void;
}
```

Pass these to `new Server<ClientToServerEvents, ServerToClientEvents>()` and `io<ServerToClientEvents, ClientToServerEvents>()`. Every `emit` and `socket.on` call becomes compile-time verified.

### Add an error boundary around game views
> **Priority: P1** — directly fixes §2 "No error boundaries" and §5 "No error recovery"

A single `<ErrorBoundary>` component wrapping `<GameView>` in `GameRoom.tsx` prevents game crashes from propagating. The fallback can show the room ID and a Leave button so the user is never truly stuck.

### Move socket setup to a custom hook
> **Priority: P3** — code organisation, not a bug

A `useGameSocket()` hook in `client/src/hooks/useGameSocket.ts` encapsulates the socket instance, all event listeners, the `emit` wrapper, and the reconnection logic. `App.tsx` becomes a pure routing shell. The hook is independently testable with mock socket factories.

### Add input validation with a schema library
> **Priority: P1** — directly fixes §2 "No payload validation"

Adding Zod (or a lightweight equivalent) to the server lets you validate every inbound payload in one line:

```typescript
const schema = z.object({ choice: z.enum(['heads', 'tails']) });
const result = schema.safeParse(payload);
if (!result.success) return; // or emit an error
```

This eliminates the unsafe cast pattern across all handlers and gives clear error messages if a client sends malformed data.

### Consider persistence if multi-instance or zero-downtime matters
> **Priority: P3** — only relevant when scaling beyond a single process

If the deployment ever needs more than one process, or if Render.com container recycling during deploys is causing users to lose rooms, a Redis store for the `rooms` and `sessions` maps is the minimal addition. The existing `Map` operations map directly to Redis hash/set commands with no architectural change required.

### Add a Vitest suite for game handlers
> **Priority: P2** — directly addresses §4 "Zero automated tests"

Start with the simplest game — CoinFlip — and write tests against its handler functions. This immediately reveals the `-1` index bug and the race condition and gives you a template to follow for all other games:

```typescript
// Example
it('records a player choice', () => {
  const room = makeRoom('coin_flip', 2);
  coinFlipHandler.onGameInput(room, room.players[0], { choice: 'heads' });
  expect((room.gameState as CoinFlipState).choices[0]).toBe('heads');
});
```

No servers, no sockets, no mocking frameworks needed.

---

## 7. Priority Summary

A consolidated view of every issue ranked by tier, in suggested fix order within each tier.

### P1 — Fix immediately

These have correctness, security, or crash impact that affects users right now.

| # | Issue | Section |
|---|---|---|
| 1 | No error boundaries around game views / No error recovery | §2, §5 |
| 2 | No error handling on game handler calls | §2 |
| 3 | No payload validation on the server | §2 |
| 4 | `findIndex` returning `-1` used directly as array index | §1 |
| 5 | Race conditions in game state transitions | §1 |
| 6 | No rate limiting on socket events | §3 |
| 7 | No connection or room limits | §3 |

### P2 — Address soon

These are reliability or developer-safety issues that compound over time or will cause pain as the project grows.

| # | Issue | Section |
|---|---|---|
| 1 | Zero automated tests | §4 |
| 2 | No CI/CD validation | §4 |
| 3 | Socket events are stringly typed on both ends | §2 |
| 4 | Extract game logic into pure functions (enables testing) | §6 |
| 5 | Add typed socket event contracts | §6 |
| 6 | Add a Vitest suite for game handlers | §6 |
| 7 | `isRejoining` can hang forever on the client | §1 |
| 8 | No feedback on socket connection failure | §5 |
| 9 | Disconnect timer leaks when a room is deleted | §1 |
| 10 | All state is in-memory with no persistence | §3 |

### P3 — Polish / deferred

Safe to defer; only become pressing at scale or with more developers.

| # | Issue | Section |
|---|---|---|
| 1 | State redundancy in `App.tsx` (custom hook refactor) | §2 |
| 2 | `maxPlayers` has two sources of truth | §2 |
| 3 | Game type default in JoinRoom is hardcoded | §1 |
| 4 | `getLobbyRooms()` O(n) scan on every room change | §3 |
| 5 | `broadcastRoomUpdate` loops per-player instead of socket.io rooms | §3 |
| 6 | Actions are fire-and-forget with no pending state | §5 |
| 7 | No copy-to-clipboard for room code | §5 |
| 8 | Error messages do not auto-clear or dismiss | §5 |
| 9 | Move socket setup to a custom hook | §6 |
| 10 | Consider Redis persistence for multi-instance / zero-downtime | §6 |
