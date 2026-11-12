
export class WebSocketClient {
  constructor({
    url,
    onMessage = () => {},
    onStatusChange = () => {},
    maxQueueSize = 100,
    maxReconnectDelay = 30000,
  }) {
    this.url = url;
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;

    this.maxQueueSize = maxQueueSize;
    this.maxReconnectDelay = maxReconnectDelay;

    this.socket = null;
    this.queue = [];
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.manualClose = false;
  }

  connect() {
    this.manualClose = false;

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.onStatusChange('connecting');

    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.onStatusChange('connected');

      this.flushQueue();
    });

    this.socket.addEventListener('message', (event) => {
      try {
        this.onMessage(JSON.parse(event.data));
      } catch (error) {
        console.error('Invalid server message:', error);
      }
    });

    this.socket.addEventListener('close', () => {
      this.onStatusChange('disconnected');

      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    });

    this.socket.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  send(message) {
    const serialized = JSON.stringify(message);

    if (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN &&
      this.socket.bufferedAmount < 1024 * 1024
    ) {
      this.socket.send(serialized);
      return true;
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.onStatusChange('queue-full');
      return false;
    }

    this.queue.push(serialized);
    return true;
  }

  flushQueue() {
    while (
      this.queue.length > 0 &&
      this.socket?.readyState === WebSocket.OPEN &&
      this.socket.bufferedAmount < 1024 * 1024
    ) {
      const message = this.queue.shift();
      this.socket.send(message);
    }
  }

  scheduleReconnect() {
    if (this.manualClose || this.reconnectTimer) {
      return;
    }

    const delay = Math.min(
      1000 * 2 ** this.reconnectAttempts,
      this.maxReconnectDelay,
    );

    this.reconnectAttempts += 1;

    this.onStatusChange('reconnecting');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  disconnect() {
    this.manualClose = true;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    if (this.socket) {
      this.socket.close(1000, 'Client disconnected');
    }

    this.onStatusChange('disconnected');
  }
}
