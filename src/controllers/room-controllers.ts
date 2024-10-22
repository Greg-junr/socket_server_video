import * as WebSocket from 'ws';
import { WebSocketService } from '../services/websocket.service';
import { MediaSoupService } from '../services/media-soup.service';
import { Peer } from '../models/peer-model';
import { mediaCodecs } from '../types/types';

export class RoomController {
  private static instance: RoomController;
  private webSocketService: WebSocketService;
  private mediaSoupService: MediaSoupService;

  private constructor(webSocketService: WebSocketService, mediaSoupService: MediaSoupService) {
    this.webSocketService = webSocketService;
    this.mediaSoupService = mediaSoupService;
  }

  public static getInstance(webSocketService: WebSocketService, mediaSoupService: MediaSoupService): RoomController {
    if (!RoomController.instance) {
      RoomController.instance = new RoomController(webSocketService, mediaSoupService);
    }
    return RoomController.instance;
  }

  async handleCreateRoom(socket: WebSocket, data: any) {
    const { roomId, isPrivate } = data;
    const router = await this.mediaSoupService.getWorker().createRouter({ mediaCodecs });
    this.webSocketService.createRoom(roomId, isPrivate, router);
    socket.send(JSON.stringify({ type: 'room-created', roomId, isPrivate }));
  }

  handleJoinRoom(socket: WebSocket, data: any) {
    const { roomId, peerId } = data;
    const peer = new Peer(peerId, socket);
    this.webSocketService.joinRoom(roomId, peer);
    socket.send(JSON.stringify({ type: 'joined-room', roomId, peerId }));
  }

  handleLeaveRoom(socket: WebSocket, data: any) {
    const { roomId, peerId } = data;
    this.webSocketService.leaveRoom(roomId, peerId);
    socket.send(JSON.stringify({ type: 'left-room', roomId, peerId }));
  }
}
