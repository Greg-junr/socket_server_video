import * as WebSocket from 'ws';
import { Room } from '../models/room-model';
import { Peer } from '../models/peer-model';
import * as mediasoup from 'mediasoup';

export class WebSocketService {
  private rooms: Map<string, Room>;

  constructor() {
    this.rooms = new Map();
  }

  createRoom(roomId: string, isPrivate: boolean, router: mediasoup.types.Router) {
    const room = new Room(roomId, isPrivate, router);
    this.rooms.set(roomId, room);
    return room;
  }

  joinRoom(roomId: string, peer: Peer) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.addPeer(peer);
      return room;
    }
    throw new Error('Room not found');
  }

  leaveRoom(roomId: string, peerId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.removePeer(peerId);
      if (room.isEmpty()) {
        this.rooms.delete(roomId);
      }
      return room;
    }
    throw new Error('Room not found');
  }

  getRoom(roomId: string) {
    return this.rooms.get(roomId);
  }
}