import { WebSocketServer, WebSocket } from "ws";

// ============================================================================
// STEP 1: CREATE THE WEBSOCKET SERVER INSTANCE
// ============================================================================
// This creates an HTTP server that ONLY handles WebSocket connections
const wss = new WebSocketServer({ port: 8080 });
// - Listens on port 8080 for incoming WebSocket handshake requests
// - Automatically handles the HTTP Upgrade negotiation

// ============================================================================
// STEP 2: HANDLE INCOMING CLIENT CONNECTIONS
// ============================================================================
// The 'connection' event fires for EACH new client that successfully
// completes the WebSocket handshake (sends valid Upgrade request).
wss.on("connection", (socket, request) => {
  // Extract client IP for logging/debugging
  const ip = request.socket.remoteAddress;

  // ========================================================================
  // STEP 3: HANDLE INCOMING MESSAGES FROM THIS CLIENT
  // ========================================================================
  // The 'message' event fires whenever this specific client sends data.
  socket.on("message", (rawData) => {
    const message = rawData.toString();
    console.log({ rawData });

    // ====================================================================
    // STEP 4: BROADCAST TO ALL CONNECTED CLIENTS
    // ====================================================================
    // wss.clients is a Set containing ALL connected WebSocket instances
    // We iterate and send the message to each OPEN client (including sender)
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN)
        client.send(`Server Broadcast: ${message}`);
    });
  });

  // ========================================================================
  // STEP 5: HANDLE CONNECTION ERRORS
  // ========================================================================
  // Fires if the connection encounters a protocol error, network issue, etc.
  socket.on("error", (err) => {
    console.error(`Error: ${err.message}: ${ip}`);
  });

  // ========================================================================
  // STEP 6: HANDLE CLIENT DISCONNECTION
  // ========================================================================
  // Fires when the client closes the connection gracefully or drops unexpectedly.
  socket.on("close", () => {
    console.log("Client Disconnected");
  });
});

console.log("WebSocket Server is live on ws://localhost:8080");
