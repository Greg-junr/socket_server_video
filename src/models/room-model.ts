import { Room as RoomType, Peer } from '../types/types';
import * as mediasoup from 'mediasoup';

export class Room implements RoomType {
  id: string;
  router: mediasoup.types.Router;
  peers: Map<string, Peer>;
  isPrivate: boolean;
  lastActivity: number;

  constructor(id: string, isPrivate: boolean, router: mediasoup.types.Router) {
    this.id = id;
    this.isPrivate = isPrivate;
    this.router = router;
    this.peers = new Map();
    this.lastActivity = Date.now();
  }

  addPeer(peer: Peer) {
    this.peers.set(peer.id, peer);
    this.lastActivity = Date.now();
  }

  removePeer(peerId: string) {
    this.peers.delete(peerId);
    this.lastActivity = Date.now();
  }

  isEmpty(): boolean {
    return this.peers.size === 0;
  }
}