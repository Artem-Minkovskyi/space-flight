
export const MAX_MESSAGE_SIZE = 8 * 1024;

const MESSAGE_TYPES = {
  JOIN: 'join',
  CHAT: 'chat',
  LEAVE: 'leave',
  STATE: 'state',
  INPUT: 'input',
};

const MAX_POSITION = 100000;
const MAX_VELOCITY = 1000;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateMessage(data, isBinary = false) {
  // Бінарні повідомлення не підтримуються.
  if (isBinary) {
    return {
      valid: false,
      error: 'Binary messages are not supported',
      closeCode: 1003,
    };
  }

  // Перетворюємо Buffer або інші сумісні дані на рядок.
  let text;

  if (typeof data === 'string') {
    text = data;
  } else if (Buffer.isBuffer(data)) {
    text = data.toString('utf8');
  } else if (ArrayBuffer.isView(data)) {
    text = Buffer.from(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    ).toString('utf8');
  } else if (data instanceof ArrayBuffer) {
    text = Buffer.from(data).toString('utf8');
  } else {
    return {
      valid: false,
      error: 'Unsupported message format',
      closeCode: 1003,
    };
  }

  // Перевірка розміру повідомлення.
  if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_SIZE) {
    return {
      valid: false,
      error: 'Message is too large',
      closeCode: 1009,
    };
  }

  // Перевірка JSON.
  let message;

  try {
    message = JSON.parse(text);
  } catch {
    return {
      valid: false,
      error: 'Invalid JSON',
      closeCode: 1007,
    };
  }

  // Перевірка структури повідомлення.
  if (
    !message ||
    typeof message !== 'object' ||
    Array.isArray(message) ||
    typeof message.type !== 'string'
  ) {
    return {
      valid: false,
      error: 'Invalid message structure',
      closeCode: 1008,
    };
  }

  switch (message.type) {
    case MESSAGE_TYPES.JOIN:
      if (
        typeof message.roomId !== 'string' ||
        message.roomId.trim().length === 0 ||
        message.roomId.length > 64 ||
        typeof message.nickname !== 'string' ||
        message.nickname.trim().length === 0 ||
        message.nickname.trim().length > 24
      ) {
        return {
          valid: false,
          error: 'Invalid join message',
          closeCode: 1008,
        };
      }

      message.roomId = message.roomId.trim();
      message.nickname = message.nickname.trim();
      message.protocol = message.protocol === 'binary' ? 'binary' : 'json';
      break;

    case MESSAGE_TYPES.CHAT:
      if (
        typeof message.text !== 'string' ||
        message.text.trim().length === 0 ||
        message.text.length > 1000
      ) {
        return {
          valid: false,
          error: 'Invalid chat message',
          closeCode: 1008,
        };
      }

      message.text = message.text.trim();
      break;

    case MESSAGE_TYPES.LEAVE:
      break;

    case MESSAGE_TYPES.INPUT: {
      const input = message.input;
      if (!input || !Number.isInteger(input.seq) || input.seq < 0 ||
          !isFiniteNumber(input.throttle) || Math.abs(input.throttle) > 1 ||
          !isFiniteNumber(input.turn) || Math.abs(input.turn) > 1 ||
          typeof input.fire !== 'boolean') {
        return { valid: false, error: 'Invalid input command', closeCode: 1008 };
      }
      message.input = { seq: input.seq >>> 0, throttle: input.throttle, turn: input.turn, fire: input.fire };
      break;
    }

    case MESSAGE_TYPES.STATE: {
      const state = message.state;

      if (
        !state ||
        typeof state !== 'object' ||
        Array.isArray(state)
      ) {
        return {
          valid: false,
          error: 'Invalid ship state',
          closeCode: 1008,
        };
      }

      const { x, y, vx, vy, angle, hp, thrust, dead } = state;

      if (
        !isFiniteNumber(x) ||
        !isFiniteNumber(y) ||
        Math.abs(x) > MAX_POSITION ||
        Math.abs(y) > MAX_POSITION ||
        !isFiniteNumber(vx) ||
        !isFiniteNumber(vy) ||
        Math.abs(vx) > MAX_VELOCITY ||
        Math.abs(vy) > MAX_VELOCITY ||
        !isFiniteNumber(angle) ||
        !isFiniteNumber(hp) ||
        hp < 0 ||
        hp > 100 ||
        typeof thrust !== 'boolean' ||
        typeof dead !== 'boolean'
      ) {
        return {
          valid: false,
          error: 'Invalid ship state values',
          closeCode: 1008,
        };
      }

      // Залишаємо тільки дозволені параметри.
      message.state = {
        x,
        y,
        vx,
        vy,
        angle,
        hp,
        thrust,
        dead,
      };

      break;
    }

    default:
      return {
        valid: false,
        error: 'Unknown message type',
        closeCode: 1008,
      };
  }

  return {
    valid: true,
    message,
  };
}
