import * as WebSocket from 'ws';
import * as mediasoup from 'mediasoup';

export interface Room {
  id: string;
  router: mediasoup.types.Router;
  peers: Map<string, Peer>;
  isPrivate: boolean;
  lastActivity: number;
}

export interface Peer {
  id: string;
  socket: WebSocket;
  transports: Map<string, mediasoup.types.Transport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
  isAudioMuted: boolean;
  isVideoOff: boolean;
}

export const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];