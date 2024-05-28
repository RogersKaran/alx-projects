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
      if (msg && msg.id) {
        await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg.content, clientOffset);
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
    if (clientLatEventId) {
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

