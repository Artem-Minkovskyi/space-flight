
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Transform, pipeline } from 'node:stream';
import { promisify } from 'node:util';

const pipelineAsync = promisify(pipeline);

export class MatchLogger {
  constructor(directory) {
    this.directory = directory;
    this.filePath = path.join(directory, 'matches.ndjson');
    this.transform = null;
    this.writeStream = null;
    this.pipelinePromise = null;
    this.closed = false;
  }

  async start() {
    await mkdir(this.directory, { recursive: true });

    this.transform = new Transform({
      writableObjectMode: true,

      transform(event, encoding, callback) {
        try {
          const line = JSON.stringify({
            timestamp: new Date().toISOString(),
            ...event,
          });

          callback(null, `${line}\n`);
        } catch (error) {
          callback(error);
        }
      },
    });

    this.writeStream = createWriteStream(this.filePath, {
      flags: 'a',
      encoding: 'utf8',
    });

    this.pipelinePromise = pipelineAsync(
      this.transform,
      this.writeStream,
    );

    this.pipelinePromise.catch((error) => {
      console.error('Match logger pipeline error:', error);
    });

    return this;
  }

  log(event) {
    if (this.closed || !this.transform || this.transform.destroyed) {
      return false;
    }

    return this.transform.write(event);
  }

  async close() {
    if (this.closed) {
      return;
    }

    this.closed = true;

    if (this.transform && !this.transform.destroyed) {
      this.transform.end();
    }

    if (this.pipelinePromise) {
      await this.pipelinePromise;
    }
  }
}

