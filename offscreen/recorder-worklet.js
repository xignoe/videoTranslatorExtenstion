/**
 * AudioWorklet processor that forwards mono audio to the main thread
 * in ~2048-sample batches (≈43ms at 48kHz) to keep message traffic low.
 */
const BATCH_SIZE = 2048;

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(BATCH_SIZE);
    this._length = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    let offset = 0;
    while (offset < channel.length) {
      const n = Math.min(BATCH_SIZE - this._length, channel.length - offset);
      this._buffer.set(channel.subarray(offset, offset + n), this._length);
      this._length += n;
      offset += n;
      if (this._length === BATCH_SIZE) {
        const out = this._buffer;
        this._buffer = new Float32Array(BATCH_SIZE);
        this._length = 0;
        this.port.postMessage(out, [out.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
