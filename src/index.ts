import * as WebSocket from 'ws';
import * as http from 'http';
import express from 'express';
import cors from 'cors';
import { initializeWorker } from './worker';
import { createWebSocketServer } from './websocket';
import { handleWebSocketConnection } from './handlers';

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

app.use(cors());

// HTTP endpoints
app.get('/', (req, res) => {
  res.send('Video Call Server is running');
});

async function main() {
  await initializeWorker();
  const wss = await createWebSocketServer(server);
  
  // WebSocket connection handler
  wss.on('connection', (socket: WebSocket, request: http.IncomingMessage) => {
    handleWebSocketConnection(socket, request);
  });
}

main().catch(error => {
  console.error('Error in main:', error);
});