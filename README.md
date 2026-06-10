# Video Translator

A Chrome extension that generates **live translated subtitles for any video playing in your browser** — YouTube, news sites, random embedded players, anything that makes sound in a tab.

Speech recognition runs **entirely on your device** using [OpenAI Whisper](https://github.com/openai/whisper) via [transformers.js](https://huggingface.co/docs/transformers.js). No API keys, no accounts, no audio ever leaves your machine. Only the recognized *text* is sent to a translation service (Google Translate's free endpoint, with LibreTranslate as fallback).

## How it works

```
popup ──START──▶ background service worker
                     │  chrome.tabCapture.getMediaStreamId()
                     ▼
              offscreen document
                tab audio ─▶ AudioWorklet ─▶ 16 kHz chunks (~5s)
                          ─▶ Whisper (on-device, WebGPU or WASM)
                          ─▶ translate recognized text
                     │
                     ▼
              background ──SUBTITLE──▶ content script ─▶ overlay on the video
```

Why this design:

- **`chrome.tabCapture`** grabs the tab's actual audio output. It works on every site regardless of CORS or how the player is built (the Web Speech API, which a lot of extensions try first, can only listen to your *microphone* — it cannot transcribe video audio).
- The captured audio is routed back to the speakers, so you keep hearing the video normally.
- **Whisper** auto-detects the spoken language (~100 languages supported), so "any video I find online" actually works.
- Model weights download once from the Hugging Face Hub on first start and are cached by the browser afterwards.

## Install

```bash
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder

## Use

1. Open a tab with a video and start playing it.
2. Click the extension icon.
3. Pick your target language (and optionally the video's language — auto-detect works well).
4. Click **Start captions on this tab**.

The first start downloads the recognition model (~80 MB for the default "base" model) — the popup shows progress. After that, starts are instant and recognition works offline.

| Model | Size | Speed | Quality |
|---|---|---|---|
| Fast (tiny) | ~40 MB | fastest | okay for clear speech |
| Balanced (base) | ~80 MB | good | **default** |
| Accurate (small) | ~250 MB | needs a decent machine (WebGPU recommended) | best |

## Expectations & limitations

- Subtitles arrive in ~5–8 second batches (audio is transcribed in chunks), so this behaves like live captioning, not pre-timed subtitles.
- One tab at a time.
- On machines without WebGPU, Whisper falls back to WASM (CPU) — use the *tiny* or *base* model there.
- Videos inside cross-origin iframes are still heard and transcribed (audio capture is tab-wide), but the caption overlay falls back to a bar at the bottom of the window instead of sitting on the video.
- Translation uses Google Translate's unofficial free endpoint; if it's ever rate-limited, the extension falls back to LibreTranslate, and if both fail, you see the untranslated transcript.

## Development

```bash
npm test         # unit tests (node --test)
npm run build    # rebuild offscreen/offscreen.bundle.js + vendor/
```

Source layout:

- `background.js` — service worker; session state and message routing
- `offscreen/offscreen.js` — audio capture, chunking, Whisper, translation
- `offscreen/recorder-worklet.js` — AudioWorklet that streams mono PCM
- `offscreen/textFilters.js` — transcript cleanup + Whisper hallucination filter
- `offscreen/translator.js` — Google/LibreTranslate clients
- `content/content.js` — subtitle overlay rendering
- `popup/` — UI

## License

MIT — see [LICENSE](LICENSE).
