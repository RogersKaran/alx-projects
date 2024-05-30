import React, { useState, useEffect } from 'react';

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

  const handleSendMessage = (msg, clientOffset, callback) => {
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
      // TODO

      // Emit the message to the receiver only
      socket.emit('private message', msg, clientOffset, msg.receiver);

      callback();

      // Include the offset with the message
      const result = { id: lastEventId + 1 };
      socket.emit('lastEventId', result.id);

      // Update the last event ID
      setLastEventId(result.id);
    } catch (error) {
      console.error('Error storing private message:', error);
    }
  };

  const handleSync = (clientLastEventId) => {
    if (clientLastEventId === undefined || clientLastEventId === null) {
      console.error('Invalid clientLastEventId:', clientLastEventId);
      return;
    }

    if (lastEventId === undefined || lastEventId === null) {
      console.error('Invalid lastEventId:', lastEventId);
      return;
    }

    if (clientLastEventId < lastEventId) {
      // Retrieve the missing pieces from the server
      socket.emit('sync', clientLastEventId);
    }
  };

  return (
    <div>
      <ul id="messages"></ul>
      <form id="form">
        <input id="input" autocomplete="off" />
        <button type="submit">Send</button>
      </form>

      <button onClick={handleConnect}>Connect</button>
      <button onClick={() => handleSync(null)}>Sync</button>

      <pre>{JSON.stringify(onlineUsers, null, 2)}</pre>
    </div>
  );
};

export default Chat;

