import * as WebSocket from 'ws';
import * as http from 'http';
import * as mediasoup from 'mediasoup';

import cors from 'cors';
import express from 'express';

const ROOM_CLEANUP_INTERVAL = 60000; // 1 minute
const ROOM_MAX_IDLE_TIME = 300000; // 5 minutes
const app = express();
const server = http.createServer(app);
// const wss = new WebSocket.Server({ noServer: true });
const wss = new WebSocket.Server({ server });
const port = process.env.PORT || 3000;

interface Room {
  id: string;
  router: mediasoup.types.Router;
  peers: Map<string, Peer>;
  isPrivate: boolean;
  lastActivity: number;
}

interface Peer {
  id: string;
  socket: WebSocket;
  transports: Map<string, mediasoup.types.Transport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
  isAudioMuted: boolean;
  isVideoOff: boolean;
}

const rooms = new Map<string, Room>();
let worker: mediasoup.types.Worker;

const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
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

async function initializeWorker() {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
  });
  console.log('mediasoup worker created');
  return worker;
}

app.use(cors());

// HTTP endpoints
app.get('/', (req, res) => {
  res.send('Video Call Server is running');
});

// // Upgrade HTTP server to WebSocket when necessary
// server.on('upgrade', (request, socket, head) => {
//   wss.handleUpgrade(request, socket, head, (ws) => {
//     wss.emit('connection', ws, request);
//   });
// });

async function createWebSocketServer(initialPort: number = 3000): Promise<WebSocket.Server> {
  // const server = http.createServer();
  // const wss = new WebSocket.Server({ server });

  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      server.listen(port, () => {
        console.log(`WebSocket server is running on port ${port}`);
        resolve(wss);
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`Port ${port} is busy, trying ${port + 1}`);
          tryPort(port + 1);
        } else {
          reject(error);
        }
      });
    };

    tryPort(initialPort);
  });
}

async function main() {
  await initializeWorker();
  // const wss = new WebSocket.Server({ noServer: true });
  const wss = await createWebSocketServer();
  // WebSocket connection handler
wss.on('connection', (socket: WebSocket, request: http.IncomingMessage) => {
  console.log('New WebSocket connection');

  socket.on('message', async (message: string) => {
    const data = JSON.parse(message);
    try {
      switch (data.type) {
        case 'create-room':
            await handleCreateRoom(socket, data);
            break;
        case 'join-room':
          await handleJoinRoom(socket, data);
          break;
        case 'create-transport':
          await handleCreateTransport(socket, data);
          break;
        case 'connect-transport':
          await handleConnectTransport(socket, data);
          break;
        case 'produce':
          await handleProduce(socket, data);
          break;
        case 'consume':
          await handleConsume(socket, data);
          break;
        case 'resume-consumer':
          await handleResumeConsumer(socket, data);
          break;
        case 'mute-audio':
          await handleMuteAudio(socket, data);
          break;
        case 'unmute-audio':
          await handleUnmuteAudio(socket, data);
          break;
        case 'video-off':
          await handleVideoOff(socket, data);
          break;
        case 'video-on':
          await handleVideoOn(socket, data);
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
    handleDisconnect(socket);
  });
});

  // server.listen(port, () => {
  //   console.log(`Server running on port ${port}`);
  // });

  setInterval(cleanupRooms, ROOM_CLEANUP_INTERVAL);
}

async function handleCreateRoom(socket: WebSocket, data: any) {
  const { roomId, isPrivate } = data;
  if (rooms.has(roomId)) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room already exists' }));
    return;
  }

  const router = await worker.createRouter({ mediaCodecs });
  const room: Room = {
    id: roomId,
    router,
    peers: new Map(),
    isPrivate: isPrivate || false,
    lastActivity: Date.now(),
  };
  rooms.set(roomId, room);

  socket.send(JSON.stringify({ type: 'room-created', roomId, isPrivate }));
}


async function handleJoinRoom(socket: WebSocket, data: any) {
  const { roomId, peerId } = data;
  const room = rooms.get(roomId);

  if (!room) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }

  if (room.isPrivate && room.peers.size >= 2) {
    socket.send(JSON.stringify({ type: 'error', message: 'Private room is full' }));
    return;
  }

  const peer: Peer = {
    id: peerId,
    socket,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    isAudioMuted: false,
    isVideoOff: false,
  };
  room.peers.set(peerId, peer);
  room.lastActivity = Date.now();

  const routerRtpCapabilities = room.router.rtpCapabilities;
  socket.send(JSON.stringify({ type: 'joined-room', roomId, peerId, routerRtpCapabilities }));

  for (const otherPeer of room.peers.values()) {
    if (otherPeer.id !== peerId) {
      otherPeer.socket.send(JSON.stringify({ type: 'new-peer', peerId }));
    }
  }
}

async function handleMuteAudio(socket: WebSocket, data: any) {
  const { roomId, peerId } = data;
  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);

  if (!room || !peer) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room or peer not found' }));
    return;
  }

  peer.isAudioMuted = true;
  room.lastActivity = Date.now();

  // Notify other peers about the audio mute
  for (const otherPeer of room.peers.values()) {
    if (otherPeer.id !== peerId) {
      otherPeer.socket.send(JSON.stringify({ type: 'peer-muted-audio', peerId }));
    }
  }

  socket.send(JSON.stringify({ type: 'audio-muted' }));
}

async function handleUnmuteAudio(socket: WebSocket, data: any) {
  const { roomId, peerId } = data;
  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);

  if (!room || !peer) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room or peer not found' }));
    return;
  }

  peer.isAudioMuted = false;
  room.lastActivity = Date.now();

  // Notify other peers about the audio unmute
  for (const otherPeer of room.peers.values()) {
    if (otherPeer.id !== peerId) {
      otherPeer.socket.send(JSON.stringify({ type: 'peer-unmuted-audio', peerId }));
    }
  }

  socket.send(JSON.stringify({ type: 'audio-unmuted' }));
}

async function handleVideoOff(socket: WebSocket, data: any) {
  const { roomId, peerId } = data;
  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);

  if (!room || !peer) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room or peer not found' }));
    return;
  }

  peer.isVideoOff = true;
  room.lastActivity = Date.now();

  // Notify other peers about the video off
  for (const otherPeer of room.peers.values()) {
    if (otherPeer.id !== peerId) {
      otherPeer.socket.send(JSON.stringify({ type: 'peer-video-off', peerId }));
    }
  }

  socket.send(JSON.stringify({ type: 'video-off' }));
}

async function handleVideoOn(socket: WebSocket, data: any) {
  const { roomId, peerId } = data;
  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);

  if (!room || !peer) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room or peer not found' }));
    return;
  }

  peer.isVideoOff = false;
  room.lastActivity = Date.now();

  // Notify other peers about the video on
  for (const otherPeer of room.peers.values()) {
    if (otherPeer.id !== peerId) {
      otherPeer.socket.send(JSON.stringify({ type: 'peer-video-on', peerId }));
    }
  }

  socket.send(JSON.stringify({ type: 'video-on' }));
}

function cleanupRooms() {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_MAX_IDLE_TIME) {
      console.log(`Cleaning up inactive room: ${roomId}`);
      for (const peer of room.peers.values()) {
        cleanupPeer(peer);
      }
      room.router.close();
      rooms.delete(roomId);
    }
  }
}

function handleDisconnect(socket: WebSocket) {
  for (const room of rooms.values()) {
    for (const [peerId, peer] of room.peers.entries()) {
      if (peer.socket === socket) {
        room.peers.delete(peerId);
        cleanupPeer(peer);
        notifyPeerLeft(room, peerId);
        room.lastActivity = Date.now();
        break;
      }
    }
  }
}

function cleanupPeer(peer: Peer) {
  for (const producer of peer.producers.values()) {
    producer.close();
  }
  for (const consumer of peer.consumers.values()) {
    consumer.close();
  }
  for (const transport of peer.transports.values()) {
    transport.close();
  }
  console.log('Peer disconnected:', peer.id);
}

function notifyPeerLeft(room: Room, peerId: string) {
  for (const otherPeer of room.peers.values()) {
    otherPeer.socket.send(JSON.stringify({ type: 'peer-left', peerId }));
  }
}

async function handleCreateTransport(socket: WebSocket, data: any) {
  const { roomId, peerId, direction } = data;
  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);

  if (!room || !peer) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room or peer not found' }));
    return;
  }

  const transport = await createWebRtcTransport(room.router);
  peer.transports.set(transport.id, transport);

  socket.send(JSON.stringify({
    type: 'transport-created',
    direction,
    transportOptions: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    },
  }));
}

async function handleConnectTransport(socket: WebSocket, data: any) {
  const { roomId, peerId, transportId, dtlsParameters } = data;
  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);
  const transport = peer?.transports.get(transportId);

  if (!transport) {
    socket.send(JSON.stringify({ type: 'error', message: 'Transport not found' }));
    return;
  }

  await transport.connect({ dtlsParameters });
  socket.send(JSON.stringify({ type: 'transport-connected', transportId }));
}

async function handleProduce(socket: WebSocket, data: any) {
  const { roomId, peerId, transportId, kind, rtpParameters } = data;
  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);
  const transport = peer?.transports.get(transportId);

  if (!transport) {
    socket.send(JSON.stringify({ type: 'error', message: 'Transport not found' }));
    return;
  }

  const producer = await transport.produce({ kind, rtpParameters });
  peer!.producers.set(producer.id, producer);

  socket.send(JSON.stringify({ type: 'producer-created', producerId: producer.id }));

  // Notify other peers in the room about the new producer
  for (const otherPeer of room!.peers.values()) {
    if (otherPeer.id !== peerId) {
      otherPeer.socket.send(JSON.stringify({
        type: 'new-producer',
        producerId: producer.id,
        producerPeerId: peerId,
        kind,
      }));
    }
  }
}

async function handleConsume(socket: WebSocket, data: any) {
  const { roomId, peerId, transportId, producerId, rtpCapabilities } = data;
  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);
  const transport = peer?.transports.get(transportId);

  if (!transport) {
    socket.send(JSON.stringify({ type: 'error', message: 'Transport not found' }));
    return;
  }

  if (!room!.router.canConsume({ producerId, rtpCapabilities })) {
    socket.send(JSON.stringify({ type: 'error', message: 'Cannot consume' }));
    return;
  }

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: true, // Start paused, resume after handling 'resume-consumer'
  });

  peer!.consumers.set(consumer.id, consumer);

  socket.send(JSON.stringify({
    type: 'consumer-created',
    consumerId: consumer.id,
    producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
    producerPaused: consumer.producerPaused,
  }));
}

async function handleResumeConsumer(socket: WebSocket, data: any) {
  const { roomId, peerId, consumerId } = data;
  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);
  const consumer = peer?.consumers.get(consumerId);

  if (!consumer) {
    socket.send(JSON.stringify({ type: 'error', message: 'Consumer not found' }));
    return;
  }

  await consumer.resume();
  socket.send(JSON.stringify({ type: 'consumer-resumed', consumerId }));
}

async function createWebRtcTransport(router: mediasoup.types.Router) {
  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp: 'ws://viaduct.proxy.rlwy.net:33910', // Replace with your public IP or domain
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  return transport;
}

main().catch(error => {
  console.error('Error in main:', error);
});