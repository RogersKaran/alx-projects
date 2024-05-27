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

io.on('connection', async (socket) => {
  socket.on('chat message', async (msg, clientOffset, callback) => {
    try {
     await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
      io.emit('chat message', msg);
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

  function getMissingPieces(clientLastEventId) {
    return new Promise((resolve) +> {
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
    });
  }

  const port = process.env.PORT  || 3000;

  server.listen(port, () => {
    console.log(`server running at http://localhost:${port}`);
  });
}

