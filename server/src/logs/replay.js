
import { createReadStream } from 'node:fs';
import { Transform, Writable, pipeline } from 'node:stream';
import { promisify } from 'node:util';

const pipelineAsync = promisify(pipeline);

export async function replayMatches(filePath, onEvent = console.log) {
  let remainder = '';

  const parseLines = new Transform({
    writableObjectMode: false,
    readableObjectMode: true,

    transform(chunk, encoding, callback) {
      try {
        const data = remainder + chunk.toString('utf8');
        const lines = data.split('\n');

        remainder = lines.pop();

        for (const line of lines) {
          if (line.trim()) {
            this.push(JSON.parse(line));
          }
        }

        callback();
      } catch (error) {
        callback(error);
      }
    },

    flush(callback) {
      try {
        if (remainder.trim()) {
          this.push(JSON.parse(remainder));
        }

        callback();
      } catch (error) {
        callback(error);
      }
    },
  });

  const output = new Writable({
    objectMode: true,

    write(event, encoding, callback) {
      try {
        onEvent(event);
        callback();
      } catch (error) {
        callback(error);
      }
    },
  });

  await pipelineAsync(
    createReadStream(filePath),
    parseLines,
    output,
  );
}
