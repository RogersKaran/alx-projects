const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { join, dirname } = require('path');
const { fileURLToPath } = require('url');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  adapter: redisAdapter({
    host: 'localhost',
    port: 6379,
  }),
});

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  socket.on('chat message', async (msg) => {
    try {
      const acknowledgment = await new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve('Hi there');
	}, 1000);
      });
      io.emit('chat message', acknowledgment);
  } catch (error) {
    console.error(error);
  }
});

 socket.on('*', (event, ...args) => {
   console.log(`Received event: ${event}`);
   console.log(`Arguments: ${args}`);
});

io.on('connection', (socket) => {
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`${socket.id} joined room: ${room}`);
  });

  socket.on('leave', (room) => {
    socket.leave(room);
    console.log(`${socket.id} left room: ${room}`);
  });
});

// Example: Join specific rooms
io.on('connection', (socket) => {
  socket.emit('join', 'politics');
  socket.emit('join', 'science');
  socket.emit('join', 'natural');
  socket.emit('join', 'philosophy');
  socket.emit('join', 'spiritual');
});

// Example: Broadcast to a specific room
io.on('connection', (socket) => {
  socket.on('broadcast', (room, message) => {
    io.to(room).emit('message', message);
  });
});

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});

