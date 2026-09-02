// Language voting: lock once two consecutive windows agree; re-detect when the locked
// language becomes unlikely (< minConf), after >= 3 s of silence, or every ~30 s.

export class LanguageVoter {
  constructor({ agreeCount = 2, minConf = 0.5, silenceMs = 3000, relockMs = 30000 } = {}) {
    this.agreeCount = agreeCount; this.minConf = minConf; this.silenceMs = silenceMs; this.relockMs = relockMs;
    this.locked = null; this.lockedAt = 0; this.redetect = false;
    this.lastLang = null; this.streak = 0; this.history = [];
    this.prior = null; // language locked in a previous session: soft preference for the first window
  }

  /** Language to force on the next window, or null to let the model choose freely. */
  forcedLanguage() {
    if (this.locked && !this.redetect) return this.locked;
    if (!this.locked && this.history.length === 0 && this.prior) return this.prior;
    return null;
  }

  /**
   * @param {{lang:string, conf:number, lockedConf?:number, ts:number, silenceMs?:number}} obs
   *  lang/conf: free (unforced) argmax over the language logits and its softmax probability.
   *  lockedConf: probability of the currently locked language in the same distribution.
   *  silenceMs: silence between this window and the previous one.
   */
  observe(obs) {
    const { lang, ts, silenceMs = 0 } = obs;
    const lockedConf = obs.lockedConf ?? (lang === this.locked ? obs.conf : 0);
    this.history.push({ lang, conf: obs.conf, ts });
    if (this.history.length > 50) this.history.shift();
    if (lang === this.lastLang) this.streak++; else { this.lastLang = lang; this.streak = 1; }

    if (this.locked) {
      if (lockedConf < this.minConf || silenceMs >= this.silenceMs || ts - this.lockedAt >= this.relockMs) {
        this.redetect = true;
      }
      if (this.redetect && this.streak >= this.agreeCount) {
        this.locked = lang; this.lockedAt = ts; this.redetect = false;
      }
    } else if (this.streak >= this.agreeCount) {
      this.locked = lang; this.lockedAt = ts; this.redetect = false;
    }
    return this.locked;
  }

  /** New session: forget the votes but remember the last locked language as a soft prior. */
  reset() {
    this.prior = this.locked || this.prior;
    this.locked = null; this.lockedAt = 0; this.redetect = false; this.lastLang = null; this.streak = 0; this.history = [];
  }
}
