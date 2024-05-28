const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { join, dirname } = require('path');
const sqlite3 = require('sqlite3').verbose();
const redisAdapter = require('socket.io-redis');
const redis = require('redis');
const pub = redis.createClient();
const sub = redis.createClient();
const adapter = redisAdapter({ pubClient: pub, subClient: sub });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { adapter });

// open the database file
const db = new sqlite3.Database('chat.db');

// create our 'messages' table (you can ignore the 'client_offset' column for now)
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_offset TEXT UNIQUE,
    content TEXT
  );
`);

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

let lastEventId = null;
let onlineUsers = {};

io.on('connection', async (socket) => {
  // Broadcast a message when a user connects
  socket.emit('chat message', 'A user connected');

  // Broadcast a message when a user disconnects
  socket.on('disconnect', () => {
    socket.emit('chat message', 'A user disconnected');
  });

  // Handle nickname selection
  socket.on('set nickname', (nickname) => {
    socket.nickname = nickname;
    onlineUsers[socket.id] = nickname;
    io.emit('online users', onlineUsers);
  });

  
  // Handle chat messages
  socket.on('chat message', async (msg, clientOffset, callback) => {
    try {
      if (msg && msg.content) {
        // Store the message in the db
        await db.run('INSERT INTO messages (content, sender, receiver) VALUES (?, ?, ?)', msg.content, socket.nickname, msg.receiver);
        // Emit the message to all connected users
        io.emit('chat message', msg);
        
        callback();
      
        // Store the message in the database
        await db.run('INSERT INTO messages (content) VALUES (?)', msg);

        // Include the offset with the message
        const result = await db.get('SELECT last_insert_rowid() AS id');
        io.to(socket.id).emit('lastEventId', result.id);

        // Update the last event ID
        lastEventId = result.id;
        socket.emit('lastEventId', lastEventId);
      } else {
        console.error('Invalid message object:', msg);
      }
    })
    catch (e) {
      if (e.errno === 19 /* SQLITE_CONSTRAINT */ ) {
        // the message was already inserted, so we notify the client
        callback();
      } else {
        // nothing to do, just let the client retry
      }
    }
  });

  socket.on('sync', (clientLastEventId) => {
    if (clientLastEventId) {
      if (lastEventId && clientLastEventId < lastEventId) {
        // Retrieve the missing pieces from the server
        const missingPieces = getMissingPieces(clientLastEventId);

        // Send the missing pieces to the client
        socket.emit('missing pieces', missingPieces);
      }
    } else {
      console.error('Invalid clientLastEventId:', clientLastEventId);
    }
  });

   // Handle typing events
  socket.on('typing', (typing) => {
    io.emit('typing', { nickname: socket.nickname, typing });
  });

  // Handle private messages
  socket.on('private message', (msg, clientOffset, receiver) => {
    // Send the message to the receiver only
    io.to(receiver).emit('private message', msg);
  });

  async function getMissingPieces(clientLastEventId) {
    if (!clientLastEventId) {
      console.error('Invalid clientLastEventId:', clientLastEventId);
      return [];
    }

    return new Promise((resolve, reject) => {
      const missingPieces = [];
      const query = db.all(
        'SELECT id, content FROM messages WHERE id > ?',
        [clientLastEventId],
        (err, rows) => {
           if (err) {
             reject(err);
           } else {
             rows.forEach((row) => {
               missingPieces.push({ id: row.id, content: row.content });
             });
             resolve(missingPieces);
           }
        }
      );
    }).catch((error) => {
      console.error('Error retrieving missing pieces:', error);
      throw error;
    });
  }

  const port = process.env.PORT  || 3000;

  server.listen(port, () => {
    console.log(`server running at http://localhost:${port}`);
  });
}

