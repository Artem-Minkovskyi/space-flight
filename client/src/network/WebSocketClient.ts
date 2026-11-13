import {
  serverMessageSchema,
  type ServerMessage,
} from '@space-flight/shared/messages';

export type ConnectionStatus =
  'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'queue-full';

export interface WebSocketClientOptions {
  readonly url: string;
  readonly onMessage?: (message: ServerMessage) => void;
  readonly onBinary?: (buffer: ArrayBuffer) => void;
  readonly onStatusChange?: (status: ConnectionStatus) => void;
  readonly maxQueueSize?: number;
  readonly maxReconnectDelay?: number;
}

export class WebSocketClient {
  private readonly url: string;
  private readonly onMessage: (message: ServerMessage) => void;
  private readonly onBinary: (buffer: ArrayBuffer) => void;
  private readonly onStatusChange: (status: ConnectionStatus) => void;
  private readonly maxQueueSize: number;
  private readonly maxReconnectDelay: number;
  private socket: WebSocket | null = null;
  private readonly queue: string[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;

  constructor({
    url,
    onMessage = () => {},
    onBinary = () => {},
    onStatusChange = () => {},
    maxQueueSize = 100,
    maxReconnectDelay = 30_000,
  }: WebSocketClientOptions) {
    this.url = url;
    this.onMessage = onMessage;
    this.onBinary = onBinary;
    this.onStatusChange = onStatusChange;
    this.maxQueueSize = maxQueueSize;
    this.maxReconnectDelay = maxReconnectDelay;
  }

  connect(): void {
    this.manualClose = false;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    )
      return;

    this.onStatusChange('connecting');
    this.socket = new WebSocket(this.url);
    this.socket.binaryType = 'arraybuffer';

    this.socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.onStatusChange('connected');
      this.flushQueue();
    });

    this.socket.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data instanceof ArrayBuffer) {
        this.onBinary(event.data);
        return;
      }
      if (typeof event.data !== 'string') {
        console.warn('Ignored unsupported WebSocket payload');
        return;
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(event.data);
      } catch (error: unknown) {
        console.error('Invalid server JSON message:', error);
        return;
      }
      const parsed = serverMessageSchema.safeParse(decoded);
      if (!parsed.success) {
        console.warn('Ignored invalid server message:', parsed.error.issues);
        return;
      }
      this.onMessage(parsed.data);
    });

    this.socket.addEventListener('close', () => {
      this.onStatusChange('disconnected');
      if (!this.manualClose) this.scheduleReconnect();
    });

    this.socket.addEventListener('error', (error: Event) => {
      console.error('WebSocket error:', error);
    });
  }

  send(message: unknown): boolean {
    const serialized = JSON.stringify(message);
    if (serialized === undefined) return false;
    if (
      this.socket?.readyState === WebSocket.OPEN &&
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

  sendBinary(buffer: ArrayBuffer): boolean {
    if (
      this.socket?.readyState === WebSocket.OPEN &&
      this.socket.bufferedAmount < 1024 * 1024
    ) {
      this.socket.send(buffer);
      return true;
    }
    return false;
  }

  private flushQueue(): void {
    while (
      this.queue.length > 0 &&
      this.socket?.readyState === WebSocket.OPEN &&
      this.socket.bufferedAmount < 1024 * 1024
    ) {
      const message = this.queue.shift();
      if (message !== undefined) this.socket.send(message);
    }
  }

  private scheduleReconnect(): void {
    if (this.manualClose || this.reconnectTimer !== null) return;
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

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1000, 'Client disconnected');
    this.onStatusChange('disconnected');
  }
}
