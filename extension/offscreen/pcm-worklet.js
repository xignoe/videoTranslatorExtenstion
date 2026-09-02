// AudioWorklet running inside the 16 kHz AudioContext: mixes to mono and posts 100 ms batches
// (1600 samples) with the wall-clock time of the batch's last sample and its RMS level.
class PcmBatcher extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1600;
    this.buf = new Float32Array(this.size);
    this.n = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch0 = input[0];
    const nCh = input.length;
    for (let i = 0; i < ch0.length; i++) {
      let s = ch0[i];
      for (let c = 1; c < nCh; c++) s += input[c][i];
      this.buf[this.n++] = s / nCh;
      if (this.n === this.size) {
        let sum = 0;
        for (let k = 0; k < this.size; k++) sum += this.buf[k] * this.buf[k];
        const rms = Math.sqrt(sum / this.size);
        this.port.postMessage({ pcm: this.buf, endTs: Date.now(), rms }, [this.buf.buffer]);
        this.buf = new Float32Array(this.size);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-batcher', PcmBatcher);
