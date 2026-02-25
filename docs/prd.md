PRD: Project "Flip-Socket"
Objective: To build a functional, real-time, full-stack multiplayer "Heads or Tails" game that demonstrates the full development cycle from local code to live production.

1. Problem Statement & Goals
The Problem: Traditional REST APIs are insufficient for real-time multiplayer states. Learning to deploy a persistent, "always-on" server is a hurdle for frontend-leaning developers.
The Goal: * Create a "zero-latency" feel using WebSockets.
Establish a "Server-as-Source-of-Truth" architecture.
Deploy the system to a public URL with $0 upfront cost.

2. User Stories
As a Player, I want to enter a unique Room ID so I can play with a specific friend.
As a Player, I want to see when my friend joins the room so I know we are ready.
As a Player, I want the result of the coin flip to be identical for both of us at the same time.
As a Developer, I want to see the system running on a public URL to prove the architecture works "in the wild."

3. Functional Requirements
3.1 Room Management
Join/Create: Users enter a alphanumeric string (Room ID) and a Nickname.
Capacity: Each room is capped at 2 players.
Presence: The UI must display the number of players currently in the room (e.g., "1/2" or "2/2").
3.2 Game Logic (The "Heads or Tails" Loop)
Readiness: The "Flip" button is disabled until 2 players are in the room.
The Trigger: Either player can click "Flip."
The Server Logic: * Receive the "FLIP_REQUEST".
Generate a random boolean.
Calculate winners/losers.
Broadcast "FLIP_RESULT" to the room.
The Reset: A "Play Again" button resets the local UI state but keeps players in the same room.

4. Technical Architecture (Monolithic Deployment)
Layer
Technology
Responsibility
Frontend
React + Vite (TS)
UI State and socket-client. It is built into static files (/dist) and served by the Backend.
Communication
Socket.io
Persistent WebSocket connection established via the same origin (no extra URLs needed).
Backend
Node.js + Express (TS)
Dual Role: 1. Acts as a Web Server to deliver the React app. 2. Acts as a Socket Server for game logic.
Persistence
In-Memory (Server RAM)
Stores active rooms and coin-flip states during the session. (Volatile: resets on deploy).
Deployment
Render.com (Web Service)
A single "Web Service" instance that builds the frontend and runs the Node.js process.

5. Non-Functional Requirements
Consistency: The server must generate the result. If Player A sees "Heads," Player B must see "Heads."
Latency: The round-trip time for a flip should feel instantaneous (under 200ms).
Scalability: For this "Hello World," the server only needs to handle ~10 concurrent rooms in memory (no persistent DB required for V1).

6. Success Metrics
Deployment: The app is accessible via a .vercel.app or .railway.app URL.
The "Friend Test": You can send a link to a friend in another city, join the same room, and see the same result in real-time.

7. Future Scope (V2)
Database Integration: Use Supabase to track a "Global Leaderboard."
Authentication: Add "Login with Google" to track user stats.
Matchmaking: Replace Room IDs with a "Find Match" queue.

