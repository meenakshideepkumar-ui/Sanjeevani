import { io, Socket } from 'socket.io-client';

// Change this URL if your WebSocket server runs on a different port (e.g., http://localhost:5000)
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket'],
    });
  }
  return socket;
};