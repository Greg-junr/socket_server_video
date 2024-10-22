import { Peer as PeerType } from '../types/types';
import * as WebSocket from 'ws';
import * as mediasoup from 'mediasoup';

export class Peer implements PeerType {
  id: string;
  socket: WebSocket;
  transports: Map<string, mediasoup.types.Transport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
  isAudioMuted: boolean;
  isVideoOff: boolean;

  constructor(id: string, socket: WebSocket) {
    this.id = id;
    this.socket = socket;
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    this.isAudioMuted = false;
    this.isVideoOff = false;
  }

  muteAudio() {
    this.isAudioMuted = true;
  }

  unmuteAudio() {
    this.isAudioMuted = false;
  }

  turnOffVideo() {
    this.isVideoOff = true;
  }

  turnOnVideo() {
    this.isVideoOff = false;
  }
}