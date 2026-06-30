import express from "express";
import http from "http";
import { matchRouter } from "../routes/matches.js";
import { attachWebSocketServer } from "./ws/server.js";
import { securityMiddleware } from "../arcjet.js";

// Define server configuration from environment variables or fallback to defaults
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
const server = http.createServer(app); // Wrap Express in a native Node HTTP server (required for WebSockets)

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hallo from express server");
});

app.use(securityMiddleware())

// Mount the matches router at the /matches endpoint
app.use("/matches", matchRouter);

// Attach the WebSocket server to the HTTP server
// This upgrades HTTP connections to WS connections when the client requests the /ws path
const { broadcastMatchCreated } = attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated; // Expose the broadcast function for use in match creation

server.listen(PORT, HOST, () => {
  // Dynamically format the console output based on whether we are binding to localhost or a specific IP
  const baseUrl =
    HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;

  console.log(`Server is running on ${baseUrl}`);
  console.log(
    `WebSocket Server is running on ${baseUrl.replace("http", "ws")}/ws`,
  );
});
