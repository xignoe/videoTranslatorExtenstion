// Shared helper for fixtures: exposes play state for the harness and applies ?clip=.
window.__fx = {
  clip() { return new URLSearchParams(location.search).get('clip') || 'en'; },
  src(name) { return 'clips/' + (name || this.clip()) + '.webm'; },
};
