import { io } from 'socket.io-client';

// Server URL (defaults to localhost:4000 where Person 4's server runs)
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

let socket = null;

/**
 * Initializes and returns the WebSocket connection.
 */
export const initSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('Connected to Sanjeevani WebSocket Server:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.warn('Disconnected from server:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });
  }
  return socket;
};

/**
 * Listens for incoming telemetry packets broadcast by the server.
 * @param {Function} callback - Function to run when a packet arrives.
 */
export const subscribeToTelemetry = (callback) => {
  const s = initSocket();
  s.on('telemetry', (packet) => {
    callback(packet);
  });
};

/**
 * Unsubscribes from incoming telemetry packets.
 */
export const unsubscribeFromTelemetry = () => {
  if (socket) {
    socket.off('telemetry');
  }
};