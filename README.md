# Video Translator

Live translated captions for anything playing in a browser tab: videos, streams, podcasts, calls.
It listens to the tab, recognizes the speech on your own computer, and shows the translation as
captions over the video.

Works in Chrome 128 or newer and in Chromium browsers that load Chrome extensions (Brave, Edge).

## Install

You do not need Node.js or any coding tools for this.

1. Download `video-translator-v….zip` from the
   [latest release](https://github.com/xignoe/videoTranslatorExtenstion/releases/latest).
2. Unzip it.
3. Open `chrome://extensions` (in Brave `brave://extensions`, in Edge `edge://extensions`).
4. Turn on **Developer mode**, click **Load unpacked**, and choose the unzipped folder.
5. Pin Video Translator to the toolbar so it is one click away.

> Use the zip from the Releases page, not the green **Code > Download ZIP** button. That button
> gives you the source code, which has to be built before it can run (see
> [Build from source](#build-from-source)).

## Use

1. Open the page you want to watch and start playback.
2. Click the Video Translator icon, pick the language under **Translate to**, and press
   **Start captions**.
3. The first start downloads the speech model once. The popup shows the progress; later starts
   are quick.
4. Captions appear over the video, or in a bar at the bottom of the page for audio-only sites.
   The toolbar icon shows **ON** while a tab is being captioned.
5. Press **Stop captions** when you are done.

Under **Options** you can also set:

- **Spoken language**: leave on Auto-detect unless it keeps guessing wrong.
- **Quality**: Fast, Balanced (the default) or Most accurate. Higher quality means a larger
  one-time download and more work for your computer.

## What to expect

- Captions trail the speech by about one to three seconds on a computer with a recent GPU, and
  longer in CPU mode (the popup tells you which one you are in).
- Netflix, Disney+, Prime Video and other protected streams cannot be captioned. The browser does
  not hand their audio to extensions.
- Captions cannot be drawn inside the Picture-in-Picture window. They stay on the page.
- Browser pages such as `chrome://` and the Chrome Web Store cannot be captioned.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| "This copy of Video Translator is not built yet" | You loaded the source code. Install the zip from the [Releases page](https://github.com/xignoe/videoTranslatorExtenstion/releases/latest) instead, or [build from source](#build-from-source). |
| "No sound is reaching the translator" | Check the tab is not muted. Protected streams (Netflix and similar) never work. |
| Captions are slow | Under Options, set Quality to Fast. CPU mode is slower than GPU mode. |
| "Translation is not available right now" | The translation service did not answer. Check your connection; captions resume on their own. |
| Nothing happens on Start | Reload the page, click the icon on that tab, and press Start again. |

If you are still stuck, [open an issue](https://github.com/xignoe/videoTranslatorExtenstion/issues)
and include the text shown in the popup.

## Privacy

- The audio never leaves your computer. Speech recognition (Whisper) runs in the browser.
- The recognized text is sent to a translation service: Google Translate's public endpoint, with
  MyMemory as the fallback.
- The speech model is downloaded from Hugging Face on first use and cached by the browser.

## Build from source

Needs [Node.js](https://nodejs.org) 22.12 or newer.

```bash
npm install
npm run build
```

Then load the `extension` folder with **Load unpacked** as described under [Install](#install).
After pulling new code, run `npm run build` again and press the reload button on the extension's
card.

On Windows, if PowerShell refuses to run `npm` ("running scripts is disabled on this system"),
use Command Prompt instead.

Other commands:

```bash
npm test          # unit tests
npm run package   # build, then write dist/video-translator-v<version>.zip
npm run e2e       # browser tests in Chrome for Testing (opens a browser window)
```

`npm run clips` regenerates the test audio and needs macOS; the clips are already in the repo, so
you can ignore it.

To publish a release, set the new version in `extension/manifest.json`, commit, and push a tag
with the same number (for example `v3.1.0`). The Release workflow builds the zip and attaches it.

How it works, the site matrix, measured latency and the manual test checklist are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

CC BY-NC-ND 4.0: free to use and share with credit, not for commercial use, and modified versions
may not be redistributed. See [LICENSE](LICENSE) for the terms and for commercial licensing.
