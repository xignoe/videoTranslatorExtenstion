# Video Translator (Chrome extension, Manifest V3)

Live, translated captions for any sound playing in any tab on any website. Speech recognition
(Whisper via `@huggingface/transformers`) and language detection run entirely on-device in a
Worker (WebGPU, WASM fallback). Only the recognized text leaves the machine, for translation.

## How it works

```
popup/            settings, Start/Stop, status (backend, detected language, download %, latency)
  └─> background.js    service worker: session state, tabCapture stream id, caption routing per frame
        └─> offscreen/    offscreen document: getUserMedia(tab stream) -> passthrough to speakers
              │            + AudioContext({sampleRate:16000}) + AudioWorklet -> 16 kHz mono batches
              └─> worker.bundle.js   dedicated Worker: Whisper (WebGPU fp32 encoder / q4 decoder,
                                     WASM q8 fallback), per-window language detection, growing-window
                                     streaming, hallucination filter, translation (Google gtx -> MyMemory)
        └─> content/content.js   every frame: finds the best visible video (incl. open shadow roots),
                                 heartbeats its score, renders the caption in a popover="manual" host
                                 with an open shadow root (top layer, adoptedStyleSheets, !important host styles)
```

Key behaviours:

- **Audio**: `chrome.tabCapture.getMediaStreamId({targetTabId})` in the service worker, consumed
  immediately by `getUserMedia({audio:{mandatory:{chromeMediaSource:'tab', chromeMediaSourceId}}})`
  in the offscreen document. The stream is routed back to `AudioContext.destination` at the native
  rate so the tab stays audible, and resampled to 16 kHz by a second AudioContext whose AudioWorklet
  posts 100 ms Float32 batches (transferable) to the Worker. Nothing is resampled on the main thread.
- **Language detection** does not use the pipeline. Each window calls `model.generate` with
  `decoder_input_ids=[<|startoftranscript|>]` and a custom LogitsProcessor that at step 1 reads the
  logits over `lang_to_id`, computes argmax + softmax confidence, then masks everything except the
  chosen (or locked / user-forced) language; step 2 forces `transcribe`, step 3 forces
  `<|notimestamps|>`. Detection is therefore free on every window on both backends. A voter locks a
  language once two consecutive windows agree and re-detects when the locked language's probability
  drops below 0.5, after >= 3 s of silence, or every ~30 s (multi-speaker calls, mixed feeds).
- **Streaming**: growing-window transcription over the current utterance since the last committed
  boundary. First inference after 1.2 s of speech, then every `max(2 s, 1.2 x last inference time)`
  of new audio; windows are capped at 10 s (force-cut keeping 1 s of overlap, text merged by
  suffix/prefix word overlap); a >= 0.5 s pause finalises. The recognized text is emitted as an
  interim caption message immediately and translated (Google gtx, MyMemory fallback, 8 s timeout,
  cache); the overlay shows **only the translated result** (untranslated interim messages are
  logged for latency measurement but never rendered), and a final replaces the interim on a pause.
  Every caption message carries `latencyMs = now - capture time of the window's last sample`.
- **Overlay**: each frame scores its candidate videos with `IntersectionObserver` visible area x
  (playing ? 3 : 1) x (unmuted ? 3 : 1) and heartbeats every 1.5 s; the background sends captions only
  to the winning frame (`chrome.tabs.sendMessage(tabId, msg, {frameId})`), or to frame 0 with
  `fallback:true` (fixed bottom bar) when no video is visible. On `fullscreenchange` the popover is
  hidden and re-shown so it stays above the fullscreen element in the top layer.
- **Injection**: manifest content script on `<all_urls>` (all frames, about:blank) plus
  `chrome.scripting.executeScript` on Start (tabs opened before install/reload) and on every
  `tabs.onUpdated` completion of the captured tab. Content scripts ask the background whether their
  tab is captured when they load, so SPA route changes and full navigations need no restart.

## Build, test, run

```bash
npm install
npm run build        # esbuild: extension/offscreen/{offscreen,worker}.bundle.js + extension/vendor/ort-*.wasm/.mjs
npm test             # node --test: text filters, translator parsers, text merge, language vote
npm run clips        # generate e2e clips with macOS `say` + ffmpeg (already in e2e/fixtures/clips)
npm run e2e          # Puppeteer 25 + Chrome for Testing; add --soak=600, --only=<test,...>, --skip-wasm, --model=tiny
```

Load `extension/` as an unpacked extension (chrome://extensions > Developer mode > Load unpacked).
Open a page with sound, click the extension icon, pick model / languages, press **Start**.

The first start downloads the model from Hugging Face (`onnx-community/whisper-{tiny,base,small}`,
cached by the browser afterwards). The popup shows a single aggregated download percentage.

## Site matrix

| Site / player type | Harness fixture | Status | Notes |
| --- | --- | --- | --- |
| Plain HTML5 `<video>` (hostile CSS, fullscreen, PiP) | `plain.html?clip=en\|es\|ja\|mixed` | PASS (harness) | Caption anchored to the video; survives `display:none!important`, `font-size:1px!important` etc. |
| YouTube / Twitch | manual | see checklist | Standard `<video>` in the top frame; theater/fullscreen work like the plain fixture. |
| Vimeo / any cross-origin iframe player | `iframe.html` (127.0.0.1:4801 embedding localhost:4802) | PASS (harness) | The child frame wins the vote and draws its own popover; top frame stays clean. |
| TikTok / Instagram / X feeds (several autoplaying videos) | `feed.html` | PASS (harness) | Visible area x playing x unmuted picks the unmuted middle video, not the bigger muted ones. |
| Shadow-DOM players (web-component players) | `shadow.html` | PASS (harness) | Candidate search walks open shadow roots. Closed shadow roots fall back to the bottom bar. |
| Podcast / Spotify / SoundCloud (audio only) | `audio.html` | PASS (harness) | No visible video -> fixed bottom caption bar (`fallback:true`). |
| SPA route changes / full navigations | `spa.html` -> `plain.html` | PASS (harness) | pushState player swap re-anchors; full navigation keeps captioning without restart. |
| Google Meet / Jitsi (multi-speaker, mixed languages) | `plain.html?clip=mixed` | PASS (harness) | Language re-detection follows en > es > ja; per-speaker switching within one call works the same way. |
| Netflix / DRM (EME) streams | manual | expected: no audio | Chrome does not expose protected audio to tab capture; the popup shows "No audio reaches the capture; DRM streams such as Netflix may block it" after 10 s. |
| Fullscreen `<video>` | `plain.html` Fullscreen button | PASS (harness) | Popover re-raised on `fullscreenchange`. |
| Picture-in-Picture | `plain.html` PiP button | PASS (harness; in-page bar only) | Captions cannot be drawn into the native PiP window; the in-page bar keeps rendering. |
| chrome:// / Web Store pages | `chrome-url-error` | PASS (harness) | Start returns "Chrome does not allow capturing chrome:// pages ...". |
| WASM fallback (no WebGPU) | `wasm-backend` (`--disable-blink-features=WebGPU`) | PASS (harness) | Popup shows "CPU (WASM)"; slower, see latency table. |

## Measured speech-to-caption latency (Apple M5, Chrome for Testing 152)

`latencyMs` is measured in the Worker as `now - capture time of the window's last sample`
(the moment the last audio sample of the transcribed window left the AudioWorklet). Values are
medians over the harness run (`e2e/.out/summary.json`); `firstCaptionMs` is measured from the
speech onset of a freshly restarted clip.

Whisper `base` (the popup default). The overlay only ever shows translated text, so
"first caption" is the first *translated* caption of a new utterance.

| Backend | First translated caption after speech onset | Interim (pre-translation) median | Final (pre-translation) median | Translated caption median | Inference per window |
| --- | --- | --- | --- | --- | --- |
| WebGPU (Apple M5, fp32 encoder + q4 decoder) | 1.5–2.2 s (best 1.4 s; audio-only/iframe runs that restart mid-utterance report < 0.5 s) | 0.9–1.3 s | 1.3–2.8 s | 1.1–2.0 s | 0.3–0.6 s |
| WASM CPU (q8, 4 threads, `ort-wasm-simd-threaded`) | 1.5–1.7 s | 2.7 s | 3.2 s | 2.9 s | 1.7–2.5 s |
| WASM CPU single-threaded (asyncify build, for reference) | 7.1 s | 16.4 s | 25.8 s | 21.1 s | 11–15 s |

Per-test values of the last full run (`npm run e2e`, 12 tests, Chrome for Testing 152):

| test | backend | firstCaptionMs | interimMs | finalMs | translatedMs |
| --- | --- | --- | --- | --- | --- |
| plain-en (hostile CSS + fullscreen + PiP) | webgpu | 2066 | 1235 | 2783 | 1386 |
| plain-es | webgpu | 2156 | 1245 | 1768 | 1526 |
| plain-ja | webgpu | 1648 | 997 | 1908 | 1959 |
| mixed-language (en > es > ja) | webgpu | 1497 | 887 | 1281 | 1176 |
| shadow-dom | webgpu | 1978 | 1095 | 1766 | 1152 |
| cross-origin-iframe | webgpu | 73 | 2041 | 2312 | 2041 |
| audio-only (bottom bar) | webgpu | 439 | 2357 | 2118 | 2357 |
| feed-three-videos | webgpu | 1594 | 1103 | 2471 | 1134 |
| spa-and-navigation | webgpu | 1585 | 1599 | 3019 | 1925 |
| wasm-backend (4 threads) | wasm | 1725 | 2711 | 3151 | 2854 |

The WASM numbers depend on the CPU being otherwise idle; the adaptive re-inference interval
(`max(2 s, 1.2 x inference time)`) keeps the pipeline from falling behind.

## Cross-origin isolation trade-off

The build was tried with `cross_origin_embedder_policy: require-corp` + `cross_origin_opener_policy:
same-origin` in the manifest. With COOP `same-origin` the offscreen document becomes
cross-origin-isolated and Chrome places it in a **different renderer process** from the service
worker; the tabCapture stream id is bound to the caller's process id, so `getUserMedia` fails with
`AbortError: Error starting tab capture`. `credentialless` isolates the same way. The headers were
therefore dropped.

This costs nothing in practice: extension documents and their workers already get
`SharedArrayBuffer` without isolation (`crossOriginIsolated=false, SharedArrayBuffer=true` is logged
by the offscreen document). The WebGPU path uses the `asyncify` ORT build, which is single-threaded
by design; the CPU fallback switches to the plain `ort-wasm-simd-threaded` build with
`min(4, cores-1)` threads (pthread workers are spawned from the `chrome-extension://` module URL,
which the CSP allows). Hugging Face downloads and the translation fetches work unchanged.

ORT 1.26's extended graph optimiser rejects the `q8`/`q4` Whisper decoders on the CPU EP
(`TransposeDQWeightsForMatMulNBits: Missing required scale`), so WASM sessions are created with
`graphOptimizationLevel: 'basic'` (with `disabled`, `uint8` and `fp32` as further fallbacks).

Other CSP notes: `script-src 'self' 'wasm-unsafe-eval'` is enough. `blob:` module imports are
blocked in extension pages, so the Worker sets `env.useWasmCache = false` and ORT imports the
vendored `vendor/ort-wasm-simd-threaded.asyncify.mjs` directly.

## Manual checklist for real third-party sites

Consoles to open:

1. **Service worker**: `chrome://extensions` > Video Translator > "service worker" link. Shows `[bg]`
   session steps, `[offscreen]` mirrored lines and `[worker:*]` lines (model load, backend, per-window
   `LANG` decisions, translation failures).
2. **Offscreen document**: `chrome://inspect/#other` (or `#pages`) > `offscreen/offscreen.html` >
   inspect. Direct console of the audio pipeline and the Worker.
3. **Page DevTools** (F12 on the site): content-script logs, and `document.querySelector('vt-caption')`
   to inspect the overlay (`.dataset` has seq / kind / lang / latency / fallback).

Steps per site (repeat for YouTube, Twitch, Vimeo embed, TikTok, Instagram, X, Spotify web,
SoundCloud, Google Meet, Jitsi, Netflix):

1. Open the site, start playback, make sure the tab is not muted.
2. Click the extension icon > model `base` > Caption language > **Start**. Expect the popup to go
   "Starting capture…" > "Loading model… N%" > "Captioning (WebGPU) · <language> → …".
3. Within ~3 s of speech expect an interim caption anchored to the bottom of the playing video
   (bottom bar for audio-only sites). Confirm the caption is replaced by its translation.
4. Scroll (feeds), switch videos, go fullscreen, open PiP, change route in the SPA. Captions must
   follow the visible unmuted player; PiP keeps the in-page bar only.
5. Press **Stop**: overlay disappears in every frame, the tab's capture indicator goes away.
6. Copy back: the popup status line, the service worker console (all lines since Start), the
   `LANG` lines (detected language + confidence per window), any `Caption delivery failed` warning,
   and for DRM sites whether the "No audio reaches the capture" warning appeared.

## Known limitations

- Picture-in-Picture: the native PiP window cannot host DOM; captions stay in the page.
- DRM/EME audio (Netflix, Disney+, Prime Video) is not delivered to tab capture.
- Closed shadow roots cannot be searched; captions fall back to the bottom bar.
- Whisper `tiny`/`base` are weak on very short or noisy windows: the very first 1.2 s window of a
  session occasionally picks a wrong language (seen once as Hindi on English speech), which delays
  the first caption to the next window. The previously locked language is used as a soft prior for
  that first window to make this rare.
- The MV3 service worker is terminated after ~30 s idle; a running session keeps it alive through
  heartbeats and audio-level messages, but the popup re-creates state lazily after termination.
- Harness note: `--disable-blink-features=WebGPU` alone no longer removes the WebGPU adapter in
  Chrome 152 (pages and workers still get one); the WASM pass adds `--disable-features=WebGPUService`.
- Harness note: the offscreen URL appears as two CDP targets, the document (`background_page`) and
  its AudioWorklet global scope (`other`). Attaching a debugger to the worklet target pauses it
  forever, so the harness only attaches to the document.
- Translation requires network access to Google's gtx endpoint or MyMemory.
