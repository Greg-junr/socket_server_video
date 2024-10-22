import * as WebSocket from 'ws';
import * as http from 'http';
import express from 'express';
import cors from 'cors';
import { MediaSoupService } from './services/media-soup.service';
import { WebSocketService } from './services/websocket.service';
import { RoomController } from './controllers/room-controllers';

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
  res.send('Video Call Server is running');
});

async function main() {
  const mediaSoupService = MediaSoupService.getInstance();
  await mediaSoupService.initializeWorker();

  const webSocketService = WebSocketService.getInstance();
  const roomController = RoomController.getInstance(webSocketService, mediaSoupService);

  const wss = new WebSocket.Server({ server });

  wss.on('connection', (socket: WebSocket) => {
    socket.on('message', async (message: string) => {

      console.log('Received message:', message);
      const data = JSON.parse(message);

      try {
        switch (data.type) {
          case 'create-room':
            await roomController.handleCreateRoom(socket, data);
            break;
          case 'join-room':
            roomController.handleJoinRoom(socket, data);
            break;
          case 'leave-room':
            roomController.handleLeaveRoom(socket, data);
            break;
          default:
            console.warn(`Unknown message type: ${data.type}`);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        socket.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
      }
    });
  });
}

main().catch(error => {
  console.error('Error in main:', error);
});