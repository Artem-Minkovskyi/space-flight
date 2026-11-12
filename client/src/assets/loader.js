export class HttpError extends Error {
  constructor(response) {
    super(`HTTP error: ${response.status} ${response.statusText}`);
    this.name = 'HttpError';
    this.status = response.status;
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  }
}

function wait(delay, signal) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delay);

    function onAbort() {
      clearTimeout(timeout);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function shouldRetry(error, signal) {
  if (
    signal?.aborted ||
    error.name === 'AbortError' ||
    error.name === 'TimeoutError'
  ) {
    return false;
  }

  if (error instanceof HttpError) {
    return error.status >= 500;
  }

  return error instanceof TypeError;
}

export async function withRetry(
  operation,
  { signal, maxAttempts = 4, baseDelay = 300, maxDelay = 5000 } = {},
) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    throwIfAborted(signal);

    try {
      return await operation({ signal, attempt });
    } catch (error) {
      lastError = error;

      const hasAttemptsLeft = attempt < maxAttempts - 1;

      if (!hasAttemptsLeft || !shouldRetry(error, signal)) {
        throw error;
      }

      const exponentialDelay = Math.min(maxDelay, baseDelay * 2 ** attempt);

      // Jitter: випадкове відхилення часу очікування.
      const jitter = 0.5 + Math.random();

      await wait(exponentialDelay * jitter, signal);
    }
  }

  throw lastError;
}

export async function fetchJson(url, { signal } = {}) {
  return withRetry(
    async ({ signal: retrySignal }) => {
      const response = await fetch(url, {
        signal: retrySignal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new HttpError(response);
      }

      return response.json();
    },
    { signal },
  );
}

export async function loadJson(url, options = {}) {
  return fetchJson(url, options);
}

export async function loadImage(url, { signal } = {}) {
  return withRetry(
    async ({ signal: retrySignal }) => {
      throwIfAborted(retrySignal);

      const response = await fetch(url, {
        signal: retrySignal,
      });

      if (!response.ok) {
        throw new HttpError(response);
      }

      const blob = await response.blob();

      throwIfAborted(retrySignal);

      const objectUrl = URL.createObjectURL(blob);

      return new Promise((resolve, reject) => {
        const image = new Image();

        const cleanup = () => {
          image.onload = null;
          image.onerror = null;
          retrySignal?.removeEventListener('abort', onAbort);
          URL.revokeObjectURL(objectUrl);
        };

        const onAbort = () => {
          cleanup();
          reject(
            retrySignal.reason ?? new DOMException('Aborted', 'AbortError'),
          );
        };

        image.onload = () => {
          cleanup();
          resolve(image);
        };

        image.onerror = () => {
          cleanup();
          reject(new Error(`Cannot decode image: ${url}`));
        };

        retrySignal?.addEventListener('abort', onAbort, {
          once: true,
        });

        image.src = objectUrl;
      });
    },
    { signal },
  );
}

export async function loadAudio(url, { signal, audioContext } = {}) {
  if (!audioContext) {
    throw new Error('AudioContext is required to load audio');
  }

  return withRetry(
    async ({ signal: retrySignal }) => {
      const response = await fetch(url, {
        signal: retrySignal,
      });

      if (!response.ok) {
        throw new HttpError(response);
      }

      const arrayBuffer = await response.arrayBuffer();

      throwIfAborted(retrySignal);

      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      throwIfAborted(retrySignal);

      return audioBuffer;
    },
    { signal },
  );
}
