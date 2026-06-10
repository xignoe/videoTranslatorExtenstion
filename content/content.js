/**
 * Content script: renders translated subtitles over the page's main video.
 *
 * Receives SUBTITLE messages from the background worker and overlays the
 * text on the largest visible video. If the page has no visible video
 * (audio-only, or the video lives in a cross-origin iframe), it falls back
 * to a caption bar at the bottom of the viewport.
 */
(() => {
  let overlay = null;
  let hideTimer = null;
  let positionTimer = null;

  function pickVideo() {
    let best = null;
    let bestScore = 0;
    for (const video of document.querySelectorAll('video')) {
      const rect = video.getBoundingClientRect();
      const visibleWidth = Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
      const visibleHeight = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
      if (visibleWidth < 100 || visibleHeight < 60) continue;
      let score = visibleWidth * visibleHeight;
      if (!video.paused && !video.ended) score *= 3;
      if (score > bestScore) {
        bestScore = score;
        best = video;
      }
    }
    return best;
  }

  function ensureOverlay() {
    const host = document.fullscreenElement || document.body || document.documentElement;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = '__video_translator_overlay';
      Object.assign(overlay.style, {
        position: 'fixed',
        zIndex: '2147483647',
        pointerEvents: 'none',
        background: 'rgba(0, 0, 0, 0.75)',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        fontWeight: '500',
        lineHeight: '1.35',
        textAlign: 'center',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
        padding: '6px 14px',
        borderRadius: '6px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxSizing: 'border-box',
        display: 'none'
      });
    }
    if (overlay.parentElement !== host) host.appendChild(overlay);
    return overlay;
  }

  function position() {
    if (!overlay || overlay.style.display === 'none') return;
    const video = pickVideo();
    if (video) {
      const rect = video.getBoundingClientRect();
      overlay.style.left = `${rect.left + rect.width / 2}px`;
      overlay.style.top = `${rect.bottom - Math.min(40, rect.height * 0.06)}px`;
      overlay.style.transform = 'translate(-50%, -100%)';
      overlay.style.maxWidth = `${Math.min(rect.width * 0.85, innerWidth * 0.9)}px`;
      overlay.style.fontSize = `${Math.max(14, Math.min(rect.width * 0.022, 26))}px`;
    } else {
      // No visible video — caption bar at the bottom of the viewport.
      overlay.style.left = '50%';
      overlay.style.top = `${innerHeight - 40}px`;
      overlay.style.transform = 'translate(-50%, -100%)';
      overlay.style.maxWidth = '80vw';
      overlay.style.fontSize = '18px';
    }
  }

  function showSubtitle(text) {
    if (!text) return;
    ensureOverlay();
    overlay.textContent = text;
    overlay.style.display = 'block';
    position();

    if (!positionTimer) positionTimer = setInterval(position, 250);

    clearTimeout(hideTimer);
    const duration = Math.max(5000, Math.min(4000 + text.length * 60, 12000));
    hideTimer = setTimeout(hide, duration);
  }

  function hide() {
    if (overlay) overlay.style.display = 'none';
    clearInterval(positionTimer);
    positionTimer = null;
  }

  function clear() {
    hide();
    if (overlay && overlay.parentElement) overlay.remove();
    overlay = null;
  }

  document.addEventListener('fullscreenchange', () => {
    if (overlay && overlay.style.display !== 'none') {
      ensureOverlay();
      position();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.target !== 'content') return;
    if (message.type === 'SUBTITLE') showSubtitle(message.text);
    else if (message.type === 'CLEAR_SUBTITLES') clear();
  });
})();
