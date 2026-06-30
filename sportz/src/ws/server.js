import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../../arcjet.js";

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
function broadcast(wss, payload) {
  for (const client of wss.clients) {
    // Only send to clients with an active, open connection
    if (client.readyState === WebSocket.OPEN) {
      if (client.readyState !== WebSocket.OPEN) continue;

      client.send(JSON.stringify(payload));
    }
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
   server.on('upgrade', async (req, socket, head) => {
        const { pathname } = new URL(req.url, `http://${req.headers.host}`);

        if (pathname !== '/ws') {
            return;
        }

        if (wsArcjet) {
            try {
                const decision = await wsArcjet.protect(req);

                if (decision.isDenied()) {
                    if (decision.reason.isRateLimit()) {
                        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
                    } else {
                        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                    }
                    socket.destroy();
                    return;
                }
            } catch (e) {
                console.error('WS upgrade protection error', e);
                socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
                socket.destroy();
                return;
            }
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    // Listen for "pong" frames sent by the client in response to our "ping"
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    // Send an initial welcome message to the newly connected client
    sendJSON(socket, { type: "welcome" });

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
    broadcast(wss, { type: "match_created", data: match });
  }

  return { broadcastMatchCreated };
}
