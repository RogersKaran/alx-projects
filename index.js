const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { join, dirname } = require('path');
const { fileURLToPath } = require('url');
const sqlite3 = require('sqlite3').verbose();
const redisAdapter = require('socket.io-redis');
const redis = require('redis');
const pub = redis.createClient();
const sub = redis.createClient();
const adapter = redisAdapter({ pubClient: pub, subClient: sub });

io.adapter(adapter);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  adapter: redisAdapter({
    host: 'localhost',
    port: 6379,
  }),
});

const __dirname = dirname(fileURLToPath(import.meta.url));

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

io.on('connection', async (socket) => {
  let lastEventId = null;

  socket.on('chat message', async (msg, clientOffset, callback) => {
    try {
      const result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
      io.emit('chat message', msg, result.lastID);
      // acknowledge the event 
      callback();
      
      // Store the message in the database
      await db.run('INSERT INTO messages (content) VALUES (?)', msg);

      // Include the offset with the message
      const result = await db.get('SELECT last_insert_rowid() AS id');
      io.to(socket.id).emit('lastEventId', result.id);

      // Update the last event ID
      lastEventId = msg.id;
      socket.emit('lastEventId', lastEventId);
    } catch (e) {
      if (e.errno === 19 /* SQLITE_CONSTRAINT */ ) {
        // the message was already inserted, so we notify the client
        callback();
      } else {
        // nothing to do, just let the client retry
      }
    }
  });

  socket.on('sync', (clientLastEventId) => {
    if (lastEventId && clientLastEventId < lastEventId) {
      // Retrieve the missing pieces from the server
      const missingPieces = getMissingPieces(clientLastEventId);

      // Send the missing pieces to the client
      socket.emit('missing pieces', missingPieces);
    }
  });

  socket.on('*', (event, ...args) => {
   console.log(`Received event: ${event}`);
   console.log(`Arguments: ${args}`);
  });

  io.on('connection', (socket) => {
    socket.on('join room', (roomId) => {
      socket.join(roomId);
    });

    socket.on('message', (roomId, msg) => {
      io.to(roomId).emit('message', msg);
    });
  });

io.on('connection', (socket) => {
  socket.on('broadcast', (msg) => {
    io.emit('broadcast', msg);
   });
  });

  // Example: Join specific rooms
  io.on('connection', (socket) => {
    socket.on('join', (room) => {
      socket.join(room);
      console.log(`${socket.id} joined room: ${room}`);
    });

    socket.on('leave', (room) => {
      socket.leave(room);
      console.log(`${socket.id} left room: ${room}`);
    });
  })

  io.on('connection', async (socket) => {
    socket.on('chat message', async (msg, clientOffset, callback) => {
      try {
        await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
        io.emit('chat message', msg);
        callback();
      } catch (e) {
        if (e.errno === 19 /* SQLITE_CONSTRAINT */ ) {
          callback();
        } else {
          // nothing to do, just let the client retry
        }
      }
    });
  });

  io.on('connection', (socket) => {
    socket.on('sync', (clientLastEventId) => {
      const missingPieces = getMissingPieces(clientLastEventId);
      socket.emit('missing pieces', missingPieces);
    });
  });

  function getMissingPieces(clientLastEventId) {
    const missingPieces = [];
    db.each(
      'SELECT id, content FROM messages WHERE id > ?',
      [clientLastEventId],
      (_err, row) => {
      missingPieces.push({ id: row.id, content: row.content });
      },
      () => {
        resolve(missingPieces);
      }
    );
  }

  const port = process.env.PORT;

  server.listen(port, () => {
    console.log(`server running at http://localhost:${port}`);
  });
}

