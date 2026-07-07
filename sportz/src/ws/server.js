/**
 * @fileoverview WebSocket Server implementation for real-time match updates.
 * 
 * This module handles client connections, message routing, and a publish/subscribe 
 * pattern for specific matches. It also integrates Arcjet for security/rate-limiting 
 * during the HTTP upgrade phase and implements a heartbeat mechanism to clean up dead connections.
 */

import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../../arcjet.js";

/**
 * In-memory store for match subscriptions.
 * Structure: Map<matchId (number), Set<WebSocket>>
 * Using a Set ensures a client can't accidentally subscribe to the same match twice.
 */

const matchSubscribers = new Map();

/**
 * Adds a socket to the subscriber list for a specific match.
 */

function subscribe(matchId, socket) {
  if (!matchSubscribers.has(matchId)) {
    matchSubscribers.set(matchId, new Set());
  }

  matchSubscribers.get(matchId).add(socket);
}

/**
 * Removes a socket from the subscriber list for a specific match.
 * Cleans up the Map entry if no subscribers remain to prevent memory leaks.
 */

function unsubscribe(matchId, socket) {
  const subscribers = matchSubscribers.get(matchId);

  if (!subscribers) return;

  subscribers.delete(socket);

  if (subscribers.size === 0) {
    matchSubscribers.delete(matchId);
  }
}

/**
 * Iterates through all matches a socket was subscribed to and removes it.
 * Called automatically when a socket closes or errors out.
 */

function cleanupSubscription(socket) {
  for (const matchId of socket.subscription) {
    unsubscribe(matchId, socket);
  }
}

/**
 * Safely sends a JSON payload to a specific WebSocket client.
 * Execution Flow:
 * 1. Checks if the socket is actually open (readyState === 1).
 * 2. If closed/closing, it aborts to prevent crashes.
 * 3. Stringifies the payload and sends it.
 */
function sendJSON(socket, payload) {
  // Guard clause: Only proceed if the socket connection is actively open
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload));
}

/**
 * Broadcasts a JSON payload to ALL connected WebSocket clients.
 * Execution Flow:
 * 1. Iterates through every client connected to the WebSocketServer (wss).
 * 2. Checks if each individual client's connection is open.
 * 3. If open, stringifies and sends the payload.
 */
function broadcastToAll(wss, payload) {
  for (const client of wss.clients) {
    // Only send to clients with an active, open connection
    if (client.readyState === WebSocket.OPEN) {
      if (client.readyState !== WebSocket.OPEN) continue;

      client.send(JSON.stringify(payload));
    }
  }
}

/**
 * Broadcasts a JSON payload only to clients subscribed to a specific match.
 * Used for granular events like live "commentary".
 */

function broadcastToMatch(matchId, payload) {
  const subscribers = matchSubscribers.get(matchId);

  if (!subscribers || subscribers.size === 0) return;
  const message = JSON.stringify(payload);

  for (const client of subscribers) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Parses incoming raw data and routes it to the appropriate handler.
 * Currently supports "subscribe" and "unsubscribe" actions.
 */

function handleMessage(socket, data) {
  let message;

  try {
    message = JSON.parse(data.toString());
  } catch (error) {
    sendJSON(socket, { type: "error", message: "Invalid JSON format" });
  }

  if (message?.type === "subscribe" && Number.isInteger(message.matchId)) {
    subscribe(message.matchId, socket);
    socket.subscriptions.add(message.matchId);
    sendJSON(socket, { type: "subscribed", matchId: message.matchId });
    return; // Abort execution if JSON is invalid
  }

  // Handle Match Subscription
  if (message?.type === "unsubscribe" && Number.isInteger(message.matchId)) {
    unsubscribe(message.matchId, socket);
    socket.subscriptions.delete(message.matchId);
    sendJSON(socket, { type: "unsubscribed", matchId: message.matchId });
    return;
  }
}

/**
 * Attaches a WebSocket server to an existing HTTP server.
 * Execution Flow:
 * 1. Creates a WebSocketServer bound to the HTTP server on the "/ws" path.
 * 2. Sets up a "connection" listener for new clients (sends welcome, sets up heartbeat).
 * 3. Starts a 30-second interval to ping clients and terminate dead connections.
 * 4. Returns a function to broadcast "match_created" events to all clients.
 */
export function attachWebSocketServer(server) {
  // Initialize WebSocketServer
  const wss = new WebSocketServer({
    server, // Bind to the existing HTTP server to share the same port
    path: "/ws", // Only upgrade HTTP requests that target the /ws path
    maxPayload: 1024 * 1024, // Security: Limit payload size to 1MB to prevent memory exhaustion
  });

  // Handle new client connections
  wss.on("connection", async (socket) => {
    server.on("upgrade", async (req, socket, head) => {
      const { pathname } = new URL(req.url, `http://${req.headers.host}`);

      if (pathname !== "/ws") {
        return;
      }

      if (wsArcjet) {
        try {
          const decision = await wsArcjet.protect(req);

          if (decision.isDenied()) {
            if (decision.reason.isRateLimit()) {
              socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
            } else {
              socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            }
            socket.destroy();
            return;
          }
        } catch (e) {
          console.error("WS upgrade protection error", e);
          socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
          socket.destroy();
          return;
        }
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });

    // Listen for "pong" frames sent by the client in response to our "ping"
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.subscriptions = new Set(); // Track which matches this socket is subscribed to

    // Send an initial welcome message to the newly connected client
    sendJSON(socket, { type: "welcome" });

    socket.on("message", (data) => handleMessage(socket, data));

    socket.on("error", () => socket.terminate());

    socket.on("close", () => {
      cleanupSubscription(socket);
    });

    socket.on("error", console.error);
  });

  // Implement Heartbeat Mechanism (Ping/Pong)
  // Runs every 30 seconds to detect and clean up dead/zombie connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      // If the client didn't respond to the previous ping, terminate the connection
      if (ws.isAlive === false) return ws.terminate();

      // Assume dead for the next check, until they respond with a "pong"
      ws.isAlive = false;

      // Send a ping frame to the client to trigger a "pong" response
      ws.ping();
    });
  }, 30000);

  // Cleanup
  // If the WebSocket server itself closes, clear the heartbeat interval to prevent memory leaks
  wss.on("close", () => clearInterval(interval));

  // Define and return the specific broadcast function for match creation
  function broadcastMatchCreated(match) {
    // Use the generic broadcast function to send a typed event to all connected clients
    broadcastToAll(wss, { type: "match_created", data: match });
  }

  function broadcastCommentary(matchId, comment) {
    broadcastToMatch(matchId, { type: "commentary", data: comment });
  }

  return { broadcastMatchCreated, broadcastCommentary };
}
