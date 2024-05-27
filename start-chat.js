const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

// Create an Express app
const app = express();

// Create an HTTP server
const server = http.createServer(app);

// Create a Socket.IO instance
const io = socketIO(server);

// Handle incoming connections
io.on('connection', (socket) => {
  console.log('A user connected');

  // Handle chat messages
  socket.on('chat message', (message) => {
    io.emit('chat message', message);
  });

 // Handle user disconnections
 socket.on('disconnect', () => {
   console.log('A user disconnected');
 });
});

// Start the server
const port = 3000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

