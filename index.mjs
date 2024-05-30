import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const Chat = () => {
  const [onlineUsers, setOnlineUsers] = useState({});
  const [lastEventId, setLastEventId] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const initSocket = () => {
      const socket = io.connect('http://localhost:3000');

      socket.on('connect', () => {
        console.log('Connected!');
        socket.emit('chat message', 'A user connected');
      });

      socket.on('disconnect', () => {
        console.log('Disconnected!');
        socket.emit('chat message', 'A user disconnected');
      });

      socket.on('online users', (onlineUsers) => {
        setOnlineUsers(onlineUsers);
      });

      socket.on('lastEventId', (lastEventId) => {
        setLastEventId(lastEventId);
      });

      socket.on('missing pieces', (missingPieces) => {
        console.log(missingPieces);
      });

      socket.on('typing', (typing) => {
        console.log(typing);
      });

      return () => {
        socket.disconnect();
      };
    };

    initSocket();
  }, []);

  const handleSetNickname = (nickname) => {
    if (nickname === undefined || nickname === null) {
      console.error('Invalid nickname:', nickname);
      return;
    }

    socket.emit('set nickname', nickname);
  };

  const handleSendMessage = async (msg, clientOffset, callback) => {
    if (
      msg === undefined ||
      msg === null ||
      msg.content === undefined ||
      msg.content === null ||
      socket.nickname === undefined ||
      socket.nickname === null
    ) {
      console.error('Invalid message object:', msg);
      return;
    }

    try {
      // Store the message in the db
      await db.run('INSERT INTO messages (content, sender, receiver) VALUES (?, ?, ?)', msg.content, socket.nickname, msg.receiver);

      // Emit the message to the receiver only
      io.emit('private message', msg, clientOffset, msg.receiver);

      callback();

      // Include the offset with the message
      const result = { id: lastEventId + 1 };
      io.emit('lastEventId', result.id);

      // Update the last event ID
      setLastEventId(result.id);
    } catch (error) {
      console.error('Error storing message:', error);
      if (error.errno === 19 /* SQLITE_CONSTRAINT */ ) {
        // the message was already inserted, so we notify the client
        callback();
      } else {
        // nothing to do, just let the client retry
      }
    }
  };

  const handlePrivateMessage = async (msg, clientOffset, receiver) => {
    if (
      msg === undefined ||
      msg === null ||
      msg.content === undefined ||
      msg.content === null ||
      socket.nickname === undefined ||
      socket.nickname === null ||
      receiver === undefined ||
      receiver === null
    ) {
      console.error('Invalid message object:', msg);
      return;
    }

    try {
      // Store the message in the db
      await db.run('INSERT INTO messages (content, sender, receiver) VALUES (?, ?, ?)', msg.content, socket.nickname, receiver);

      // Emit the message to the receiver only
      io.emit('private message', msg, clientOffset, receiver);
    } catch (error) {
      console.error('Error storing private message:', error);
    }
  };

  const handleSync = (clientLastEventId) => {
    if (clientLastEventId === undefined || clientLastEventId === null) {
      console.error('Invalid clientLastEventId:', clientLastEventId);
      return;
    }

    // Emit the sync request to the server
    socket.emit('sync', clientLastEventId);
  };

  const handleMissingPieces = (pieces) => {
    if (pieces === undefined || pieces === null) {
      console.error('Invalid pieces:', pieces);
      return;
    }

    // Emit the missing pieces to the server
    socket.emit('missing pieces', pieces);
  };

  const handleTyping = (typing) => {
    if (typing === undefined || typing === null) {
      console.error('Invalid typing:', typing);
      return;
    }

    // Emit the typing event to the server
    socket.emit('typing', typing);
  };

  return (
    <div>
      <h1>Chat</h1>
      <p>Online users: {Object.keys(onlineUsers).map((id) => `${onlineUsers[id]}`).join(', ')}</p>
      <input type="text" id="nickname" placeholder="Nickname" onChange={(e) => handleSetNickname(e.target.value)} />
      <input type="text" id="message" placeholder="Message" onChange={(e) => (msg)} />
      <button onClick={() => handleSendMessage({ content: document.getElementById('message').value, receiver: '' }, null, () => console.log('Sent!'))}>Send</button>
      <button onClick={() => handlePrivateMessage({ content: document.getElementById('message').value, receiver: '' }, null, 'user2')}>Send private</button>
      <button onClick={() => handleSync(2)}>Sync</button>
    </div>
  );
};

export default Chat;