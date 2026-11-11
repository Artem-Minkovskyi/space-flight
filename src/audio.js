export class AudioManager {
  constructor() {
    this.context = null;
    this.buffers = {};
    this.enabled = true;
  }

  async initialize() {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error('Ваш браузер не підтримує Web Audio API');
      }

      this.context = new AudioContextClass();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  setBuffers(buffers) {
    this.buffers = buffers;
  }

  play(name) {
    if (!this.enabled || !this.context || !this.buffers[name]) {
      return;
    }

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();

    source.buffer = this.buffers[name];
    gain.gain.value = 0.35;

    source.connect(gain);
    gain.connect(this.context.destination);

    source.start(0);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  destroy() {
    if (this.context && this.context.state !== 'closed') {
      this.context.close();
    }
  }
}

export function connectAudio(events, audio) {
  events.addEventListener('fired', () => audio.play('shot'));
  events.addEventListener('hit', () => audio.play('hit'));
  events.addEventListener('exploded', () => audio.play('explosion'));
}
