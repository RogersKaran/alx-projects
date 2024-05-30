import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { composeWithDevTools } from '@redux-devtools/extension';
import Chat from './Chat';

const mockSocket = {
  emit: jest.fn(),
  on: jest.fn(),
  disconnected: jest.fn(),
};

const setup = () => {
  const store = createStore(() => ({ onlineUsers: {}, lastEventId: null }), composeWithDevTools());
  const { container } = render(
    <Provider store={store}>
      <Chat socket={mockSocket} />
    </Provider>
  );

  return { store, container, mockSocket };
};

describe('<Chat />', () => {
  it('renders online users', () => {
    const { container } = setup();
    expect(container.querySelector('p').textContent).toBe('Online users: ');
  });

  it('emits "set nickname" on input change', () => {
    const { container, mockSocket } = setup();
    const input = container.querySelector('input#nickname');
    fireEvent.change(input, { target: { value: 'test' } });
    expect(mockSocket.emit).toHaveBeenCalledWith('set nickname', 'test');
  });

  it('emits "chat message" on message submit', async () => {
    const { container, mockSocket } = setup();
    const input = container.querySelector('input#message');
    const button = container.querySelector('button');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.click(button);
    await waitFor(() => expect(mockSocket.emit).toHaveBeenCalledWith('chat message', { content: 'test', offset: null }));
  });

  it('emits "private message" on private message submit', async () => {
    const { container, mockSocket } = setup();
    const input = container.querySelector('input#message');
    const privateButton = container.querySelector('button:nth-child(2)');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.click(privateButton);
    await waitFor(() => expect(mockSocket.emit).toHaveBeenCalledWith('private message', { content: 'test', receiver: '', clientOffset: null }));
  });

  it('emits "sync" on sync button click', () => {
    const { container, mockSocket } = setup();
    const syncButton = container.querySelector('button:nth-child(3)');
    fireEvent.click(syncButton);
    expect(mockSocket.emit).toHaveBeenCalledWith('sync', 2);
  });

  it('calls socket.disconnect on unmount', () => {
    const { store, container } = setup();
    const mockSocketDisconnect = jest.fn();
    mockSocket.disconnected = mockSocketDisconnect;
    store.unlisten();
    expect(mockSocketDisconnect).toHaveBeenCalled();
  });
});
