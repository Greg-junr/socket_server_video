import * as WebSocket from 'ws';
import { getWorker } from './worker';
import { Room, Peer, mediaCodecs } from './types';
import * as mediasoup from 'mediasoup';

const ROOM_MAX_IDLE_TIME = 1000 * 60 * 5;

export async function handleCreateRoom(socket: WebSocket, data: any, rooms: Map<string, Room>, worker: mediasoup.types.Worker) {
  const { roomId, isPrivate } = data;
  if (rooms.has(roomId)) {
    socket.send(JSON.stringify({ type: 'room-exist', message: 'Room already exists' }));
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
  console.log('Room created:', roomId);

  socket.send(JSON.stringify({ type: 'room-created', roomId, isPrivate }));
}

export async function handleJoinRoom(socket: WebSocket, data: any, rooms: Map<string, Room>) {
  const { roomId, peerId, user } = data;
  const room = rooms.get(roomId);


  if (!room) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
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

  const existingPeers = Array.from(room.peers.keys()).filter(id => id !== peerId);

  socket.send(JSON.stringify({
    type: 'joined-room',
    roomId,
    peerId,
    existingPeers,
  }));

  // Notify existing peers about the new peer
  for (const otherPeer of room.peers.values()) {
    if (otherPeer.id !== peerId) {
      otherPeer.socket.send(JSON.stringify({ type: 'new-peer', peerId, user }));
    }
  }
}

export async function handleMuteAudio(socket: WebSocket, data: any, rooms: Map<string, Room>) {
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

export async function handleUnmuteAudio(socket: WebSocket, data: any, rooms: Map<string, Room>) {
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

export async function handleVideoOff(socket: WebSocket, data: any, rooms: Map<string, Room>) {
  console.log('handleVideoOff');
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

export async function handleVideoOn(socket: WebSocket, data: any, rooms: Map<string, Room>) {
  console.log('handleVideoOn');
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

export function cleanupRooms(rooms: Map<string, Room>) {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_MAX_IDLE_TIME) {
      console.log(`Cleaning up inactive room: ${roomId}`);
      for (const peer of room.peers.values()) {
        peer.socket.close();
      }
      room.router.close();
      rooms.delete(roomId);
    }
  }
}

export function handleDisconnect(socket: WebSocket, rooms: Map<string, Room>) {
  for (const [roomId, room] of rooms.entries()) {
    for (const [peerId, peer] of room.peers.entries()) {
      if (peer.socket === socket) {
        room.peers.delete(peerId);
        room.lastActivity = Date.now();

        // Notify other peers about the disconnection
        for (const otherPeer of room.peers.values()) {
          otherPeer.socket.send(JSON.stringify({ type: 'peer-left', peerId }));
        }

        console.log(`Peer ${peerId} disconnected from room ${roomId}`);

        // Only close the room if it's empty
        if (room.peers.size === 0) {
          room.router.close();
          rooms.delete(roomId);
          console.log(`Room ${roomId} closed and deleted`);
        }

        break;
      }
    }
  }
}

export function cleanupPeer(peer: Peer, rooms: Map<string, Room>) {
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

export function notifyPeerLeft(room: Room, peerId: string) {
  console.log('Peer left:', peerId);
  for (const otherPeer of room.peers.values()) {
    otherPeer.socket.send(JSON.stringify({ type: 'peer-left', peerId }));
  }
}

export async function handleLeaveRoom(socket: WebSocket, data: any, rooms: Map<string, Room>) {
  const { roomId, peerId } = data;
  const room = rooms.get(roomId);

  if (room) {
    room.peers.delete(peerId);
    room.lastActivity = Date.now();

    // Notify other peers about the peer leaving
    for (const otherPeer of room.peers.values()) {
      otherPeer.socket.send(JSON.stringify({ type: 'peer-left', peerId }));
    }

    console.log(`Peer ${peerId} left room ${roomId}`);

    // Only close the room if it's empty
    if (room.peers.size === 0) {
      await room.router.close();
      rooms.delete(roomId);
      console.log(`Room ${roomId} closed and deleted`);
    }
  }
}

export async function handleCreateTransport(socket: WebSocket, data: any, rooms: Map<string, Room>) {
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

export async function handleConnectTransport(socket: WebSocket, data: any, rooms: Map<string, Room>) {
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

export async function handleProduce(socket: WebSocket, data: any, rooms: Map<string, Room>) {
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

export async function handleConsume(socket: WebSocket, data: any, rooms: Map<string, Room>) {
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

export async function handleResumeConsumer(socket: WebSocket, data: any, rooms: Map<string, Room>) {
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

export async function createWebRtcTransport(router: mediasoup.types.Router) {
  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: '0.0.0.0',
        // announcedIp: '127.0.0.1', // Replace with your public IP or domain
        announcedIp: 'roundhouse.proxy.rlwy.net', // Replace with your public IP or domain
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  return transport;
}

export async function handleOffer(socket: WebSocket, data: any, rooms: Map<string, Room>) {
  const { roomId, peerId, targetPeerId, sdp } = data;
  const room = rooms.get(roomId);

  if (!room) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }

  const targetPeer = room.peers.get(targetPeerId);
  if (!targetPeer) {
    socket.send(JSON.stringify({ type: 'error', message: 'Target peer not found' }));
    return;
  }

  // Relay the offer to the target peer
  targetPeer.socket.send(JSON.stringify({
    type: 'offer',
    peerId: peerId,
    sdp: sdp
  }));

  room.lastActivity = Date.now();
}

export async function handleAnswer(socket: WebSocket, data: any, rooms: Map<string, Room>) {
  const { roomId, peerId, targetPeerId, sdp } = data;
  const room = rooms.get(roomId);

  if (!room) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }

  const targetPeer = room.peers.get(targetPeerId);
  if (!targetPeer) {
    socket.send(JSON.stringify({ type: 'error', message: 'Target peer not found' }));
    return;
  }

  // Relay the answer to the target peer
  targetPeer.socket.send(JSON.stringify({
    type: 'answer',
    peerId: peerId,
    sdp: sdp
  }));

  room.lastActivity = Date.now();
}

export async function handleIceCandidate(socket: WebSocket, data: any, rooms: Map<string, Room>) {
  const { roomId, peerId, targetPeerId, candidate } = data;
  const room = rooms.get(roomId);

  if (!room) {
    socket.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }

  const targetPeer = room.peers.get(targetPeerId);
  if (!targetPeer) {
    socket.send(JSON.stringify({ type: 'error', message: 'Target peer not found' }));
    return;
  }

  // Relay the ICE candidate to the target peer
  targetPeer.socket.send(JSON.stringify({
    type: 'ice-candidate',
    peerId: peerId,
    candidate: candidate
  }));

  room.lastActivity = Date.now();
}
