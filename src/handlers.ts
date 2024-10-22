import * as WebSocket from 'ws';
import * as http from 'http';
import { handleCreateRoom, handleJoinRoom, handleLeaveRoom, handleOffer, handleAnswer, handleIceCandidate, handleDisconnect } from './roomHandlers';
import { getWorker } from './worker';
import { Room } from './types';

const rooms = new Map<string, Room>();

export function handleWebSocketConnection(socket: WebSocket, request: http.IncomingMessage) {
  console.log('New WebSocket connection');

  socket.on('message', async (message: string) => {
    const data = JSON.parse(message);
    console.log('Received message:', data);
    try {
      switch (data.type) {
        case 'create-room':
          await handleCreateRoom(socket, data, rooms, getWorker());
          break;
        case 'join-room':
          await handleJoinRoom(socket, data, rooms);
          break;
        case 'leave-room':
          await handleLeaveRoom(socket, data, rooms);
          break;
        case 'offer':
          await handleOffer(socket, data, rooms);
          break;
        case 'answer':
          await handleAnswer(socket, data, rooms);
          break;
        case 'ice-candidate':
          await handleIceCandidate(socket, data, rooms);
          break;
        default:
          console.warn(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      socket.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
    }
  });

  socket.on('close', () => {
    handleDisconnect(socket, rooms);
  });
}