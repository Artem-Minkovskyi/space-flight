export class Lobby extends EventTarget {
  constructor({ roomsUrl = '/api/rooms.json', pollInterval = 5000 } = {}) {
    super();

    this.roomsUrl = roomsUrl;
    this.pollInterval = pollInterval;

    this.rooms = [];
    this.playerName = '';
    this.selectedRoom = null;

    this.visible = false;
    this.pollTimer = null;
    this.controller = null;
  }

  async fetchRooms() {
    this.controller?.abort();

    this.controller = new AbortController();
    const signal = this.controller.signal;

    try {
      const timeoutSignal = AbortSignal.timeout(5000);
      const combinedSignal = AbortSignal.any([signal, timeoutSignal]);

      const response = await fetch(this.roomsUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: combinedSignal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();

      this.rooms = data.rooms ?? data;

      this.dispatchEvent(
        new CustomEvent('roomsUpdated', {
          detail: { rooms: this.rooms },
        }),
      );

      return this.rooms;
    } catch (error) {
      if (signal.aborted) {
        return [];
      }

      this.dispatchEvent(
        new CustomEvent('error', {
          detail: { error },
        }),
      );

      return [];
    }
  }

  startPolling() {
    if (!this.visible) {
      return;
    }

    this.stopPolling();

    this.fetchRooms();

    this.pollTimer = setInterval(() => {
      if (this.visible) {
        this.fetchRooms();
      }
    }, this.pollInterval);
  }

  stopPolling() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.controller?.abort();
    this.controller = null;
  }

  show() {
    this.visible = true;
    this.startPolling();
  }

  hide() {
    this.visible = false;
    this.stopPolling();
  }

  join(playerName, roomId) {
    const normalizedName = playerName.trim();

    if (!normalizedName) {
      throw new Error('Введіть ім’я гравця');
    }

    const room = this.rooms.find((item) => item.id === roomId);

    if (!room) {
      throw new Error('Оберіть доступну кімнату');
    }

    this.playerName = normalizedName;
    this.selectedRoom = room;

    this.hide();

    this.dispatchEvent(
      new CustomEvent('join', {
        detail: {
          playerName: this.playerName,
          room,
          config: room.arena ?? room.config ?? room,
        },
      }),
    );
  }

  destroy() {
    this.hide();
    this.rooms = [];
  }
}
