const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
});

// Broadcast live simulated telemetry every 3 seconds
app.get('/', (req, res) => res.send('Sanjeevani Telemetry Server Running'));
setInterval(() => {
  const simulatedPacket = {
    worker_id: 'DIV-01 (Arjun)',
    domain: 'diver',
    ts: Date.now(),
    hr: Math.floor(70 + Math.random() * 45),
    spo2: Math.floor(92 + Math.random() * 7),
    motion_g: 1.02,
    pos_x: 11.8745,
    pos_y: 75.3704,
    pos_z: -14.2,
    triage_tier: Math.random() > 0.7 ? 'yellow' : 'green',
    battery_pct: 87,
    comms_status: 'ok',
    depth_m: 14.2,
  };

  io.emit('telemetry_update', simulatedPacket);
}, 3000);

server.listen(5000, () => {
  console.log('Telemetry server running on http://localhost:5000');
});