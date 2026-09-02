// Content script (every frame): finds the best visible media element, reports it to the
// background, and renders captions in a top-layer popover with an open shadow root.
(() => {
  if (globalThis.__vtContentLoaded) return;
  globalThis.__vtContentLoaded = true;

  const HEARTBEAT_MS = 1500;
  const HIDE_AFTER_MS = 6000;
  const IO_THRESHOLDS = [0, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1];

  let active = false;
  let hbTimer = null;
  let io = null;
  const visible = new Map(); // media -> intersection area
  let bestVideo = null;
  let overlay = null;
  let hideTimer = null;
  let rafId = null;
  let shown = false;
  let anchor = null;
  let useFallback = false;

  const SHADOW_CSS = `
    :host { all: initial; }
    .box {
      display: inline-block; box-sizing: border-box; max-width: 100%;
      background: rgba(0, 0, 0, 0.78); color: #fff;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Hiragino Sans", "Yu Gothic", sans-serif;
      font-weight: 600; line-height: 1.3; padding: 0.25em 0.6em; border-radius: 6px;
      text-align: center; text-shadow: 0 1px 2px #000, 0 0 6px rgba(0,0,0,.6);
      white-space: pre-wrap; overflow-wrap: anywhere; letter-spacing: 0; text-transform: none;
      opacity: 1; visibility: visible;
    }
    .box.interim { color: #e8e8e8; }
    .box.interim::after { content: "…"; }
  `;

  // ---------- media discovery ----------
  function collectMedia(root, out, depth) {
    if (depth > 12) return;
    let nodes;
    try { nodes = root.querySelectorAll('*'); } catch { return; }
    for (const el of nodes) {
      const tag = el.tagName;
      if (tag === 'VIDEO' || tag === 'AUDIO') out.push(el);
      if (el.shadowRoot) collectMedia(el.shadowRoot, out, depth + 1);
    }
  }

  function ensureObserver() {
    if (io) return io;
    io = new IntersectionObserver((entries) => {
      for (const e of entries) visible.set(e.target, e.isIntersecting ? e.intersectionRect.width * e.intersectionRect.height : 0);
    }, { root: null, threshold: IO_THRESHOLDS });
    return io;
  }

  function viewportArea(el) {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  }

  const isPlaying = (m) => !m.paused && !m.ended && m.readyState >= 2;
  const isUnmuted = (m) => !m.muted && m.volume > 0;

  function evaluate() {
    const media = [];
    collectMedia(document, media, 0);
    const obs = ensureObserver();
    obs.takeRecords().forEach((e) => visible.set(e.target, e.isIntersecting ? e.intersectionRect.width * e.intersectionRect.height : 0));
    for (const m of media) if (!visible.has(m)) { visible.set(m, m.tagName === 'VIDEO' ? viewportArea(m) : 0); obs.observe(m); }
    for (const m of [...visible.keys()]) if (!media.includes(m)) { visible.delete(m); try { obs.unobserve(m); } catch {} }

    let best = null, bestScore = 0;
    let mediaPlayingUnmuted = false, videoCount = 0;
    for (const m of media) {
      if (isPlaying(m) && isUnmuted(m)) mediaPlayingUnmuted = true;
      if (m.tagName !== 'VIDEO') continue;
      videoCount++;
      const area = visible.get(m) || 0;
      const score = area * (isPlaying(m) ? 3 : 1) * (isUnmuted(m) ? 3 : 1);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    bestVideo = best;
    return { score: bestScore, hasVideo: !!best, mediaPlayingUnmuted, videoCount };
  }

  function heartbeat() {
    if (!active) return;
    let info;
    try { info = evaluate(); } catch (e) { info = { score: 0, hasVideo: false, mediaPlayingUnmuted: false, videoCount: 0, error: String(e) }; }
    chrome.runtime.sendMessage({ type: 'FRAME_HEARTBEAT', ...info }).catch(() => {});
  }

  function startHeartbeat() {
    if (hbTimer) return;
    heartbeat();
    setTimeout(heartbeat, 300); // IntersectionObserver has reported by now
    hbTimer = setInterval(heartbeat, HEARTBEAT_MS);
  }
  function stopHeartbeat() { if (hbTimer) clearInterval(hbTimer); hbTimer = null; }

  // ---------- overlay ----------
  const imp = (el, prop, value) => el.style.setProperty(prop, value, 'important');

  function hostBaseStyle(host) {
    const props = {
      position: 'fixed', display: 'block', visibility: 'visible', opacity: '1', margin: '0', padding: '0', border: '0', outline: '0',
      background: 'transparent', 'box-shadow': 'none', overflow: 'visible', 'pointer-events': 'none', 'z-index': '2147483647',
      transform: 'none', filter: 'none', 'clip-path': 'none', clip: 'auto', inset: 'auto', 'max-width': 'none', 'max-height': 'none',
      'min-width': '0', 'min-height': '0', height: 'auto', 'text-align': 'center', 'font-size': '16px', 'line-height': 'normal',
      contain: 'none', zoom: '1', color: '#fff', 'text-transform': 'none', 'letter-spacing': 'normal', 'box-sizing': 'border-box',
      'writing-mode': 'horizontal-tb', direction: 'ltr', animation: 'none', transition: 'none',
    };
    for (const [k, v] of Object.entries(props)) imp(host, k, v);
  }

  function ensureOverlay() {
    if (overlay && overlay.host.isConnected) return overlay;
    const host = document.createElement('vt-caption');
    host.setAttribute('popover', 'manual');
    const root = host.attachShadow({ mode: 'open' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(SHADOW_CSS);
      root.adoptedStyleSheets = [sheet];
    } catch (e) { console.warn('[vt] adoptedStyleSheets unavailable', e); }
    const box = document.createElement('div');
    box.className = 'box';
    root.appendChild(box);
    hostBaseStyle(host);
    (document.documentElement || document.body).appendChild(host);
    raise(host);
    overlay = { host, box };
    document.addEventListener('fullscreenchange', onFullscreenChange, true);
    return overlay;
  }

  function raise(host) {
    if (typeof host.showPopover === 'function') {
      try { if (host.matches(':popover-open')) host.hidePopover(); } catch {}
      try { host.showPopover(); } catch (e) { /* not connected yet or already open */ }
    }
  }

  function onFullscreenChange() {
    if (!overlay) return;
    // Fullscreen elements enter the top layer after us; hide + show re-raises the popover above them.
    raise(overlay.host);
    layout();
  }

  function removeOverlay() {
    hideCaption();
    if (overlay) {
      try { overlay.host.hidePopover(); } catch {}
      overlay.host.remove();
      overlay = null;
    }
    document.removeEventListener('fullscreenchange', onFullscreenChange, true);
  }

  function layout() {
    if (!overlay || !shown) return;
    const { host, box } = overlay;
    let r = null;
    if (!useFallback && anchor && anchor.isConnected) {
      r = anchor.getBoundingClientRect();
      if (r.width < 40 || r.height < 30) r = null;
    }
    if (r) {
      const width = Math.max(160, Math.round(r.width * 0.9));
      const left = Math.round(r.left + (r.width - width) / 2);
      const fontPx = Math.max(14, Math.min(34, Math.round(r.height * 0.065)));
      const bottomOffset = Math.round(r.height * 0.06);
      imp(host, 'left', `${left}px`);
      imp(host, 'width', `${width}px`);
      imp(host, 'top', 'auto');
      imp(host, 'bottom', `${Math.round(innerHeight - r.bottom + bottomOffset)}px`);
      imp(box, 'font-size', `${fontPx}px`);
      host.dataset.anchored = '1';
    } else {
      imp(host, 'left', '0px');
      imp(host, 'width', `${innerWidth}px`);
      imp(host, 'top', 'auto');
      imp(host, 'bottom', '0px');
      imp(box, 'font-size', '22px');
      imp(box, 'border-radius', '0');
      imp(box, 'width', '100%');
      host.dataset.anchored = '0';
    }
    if (r) { imp(box, 'border-radius', '6px'); box.style.removeProperty('width'); }
  }

  function loop() {
    layout();
    rafId = shown ? requestAnimationFrame(loop) : null;
  }

  function showCaption(msg) {
    const { host, box } = ensureOverlay();
    const text = msg.translated;
    box.textContent = text;
    box.className = 'box ' + (msg.kind === 'final' ? 'final' : 'interim');
    if (msg.translated != null) box.title = msg.text; else box.removeAttribute('title');
    Object.assign(host.dataset, { seq: String(msg.seq), kind: msg.kind, lang: msg.lang || '', latency: String(msg.latencyMs ?? ''), translated: msg.translated != null ? '1' : '0', fallback: msg.fallback ? '1' : '0' });
    useFallback = !!msg.fallback;
    if (!useFallback) { if (!bestVideo || !bestVideo.isConnected) evaluate(); anchor = bestVideo; }
    shown = true;
    imp(host, 'visibility', 'visible');
    imp(host, 'opacity', '1');
    if (!host.matches(':popover-open')) raise(host);
    layout();
    if (!rafId) rafId = requestAnimationFrame(loop);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideCaption, HIDE_AFTER_MS);
  }

  function hideCaption() {
    clearTimeout(hideTimer);
    shown = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (overlay) { imp(overlay.host, 'visibility', 'hidden'); overlay.host.dataset.hidden = '1'; }
  }

  // ---------- session control ----------
  function setActive(on) {
    if (on && !active) { active = true; startHeartbeat(); }
    else if (!on && active) { active = false; stopHeartbeat(); removeOverlay(); }
    else if (!on) removeOverlay();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || sender.tab) return;
    switch (msg.type) {
      case 'CAPTION':
        if (msg.translated == null) { sendResponse({ ok: true, skipped: true }); return; } // only translated output is shown
        if (!active) setActive(true);
        if (overlay) overlay.host.dataset.hidden = '0';
        showCaption(msg);
        sendResponse({ ok: true, anchored: !useFallback && !!anchor });
        return;
      case 'CLEAR': hideCaption(); sendResponse({ ok: true }); return;
      case 'SESSION_STATE': setActive(!!msg.captured); sendResponse({ ok: true }); return;
      case 'PING': sendResponse({ ok: true, active, frameUrl: location.href }); return;
    }
  });

  chrome.runtime.sendMessage({ type: 'CONTENT_HELLO' }).then((r) => { if (r?.captured) setActive(true); }).catch(() => {});
})();
