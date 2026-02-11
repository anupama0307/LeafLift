import { io, Socket } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

let socket: Socket | null = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling']
    });
  }
  return socket;
};

export const registerSocket = (userId: string, role: 'RIDER' | 'DRIVER') => {
  const active = getSocket();
  active.emit('register', { userId, role });
  return active;
};

export const joinRideRoom = (rideId: string) => {
  const active = getSocket();
  active.emit('join:ride', { rideId });
};

export const leaveRideRoom = (rideId: string) => {
  const active = getSocket();
  active.emit('leave:ride', { rideId });
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
