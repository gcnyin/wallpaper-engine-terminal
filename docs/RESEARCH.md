# Wallpaper Engine project research

Notes collected while choosing an implementation strategy for this wallpaper.
Everything here was checked against the copy of Wallpaper Engine installed on
this machine, plus the official designer documentation.

## What is installed

| Item | Value |
| --- | --- |
| Wallpaper Engine | 2.8.42 (`version.json`) |
| Install dir | `D:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine` |
| Local projects | `<install>\projects\myprojects` (empty by default) |
| Bundled examples | `<install>\projects\defaultprojects` |
| Embedded browser | CEF 146.0.11, Chromium 146.0.7680.179 (`bin\libcef.dll`) |
| Renderer binaries | `wallpaper32.exe` / `wallpaper64.exe`, `webwallpaper64.exe`, `scenescript64.dll` |

## The three ways to build a wallpaper

Wallpaper Engine 2.x accepts several project types. The ones relevant here:

### 1. Scene (`"type": "scene"`, `file: "scene.json"`)

A scene is a 3D/2D scene graph rendered by the engine. From
`defaultprojects/retro/scene.json`:

```json
{
  "camera": { "center": "0.000 0.000 0.000", "eye": "0.000 0.000 1.000", "up": "0.000 1.000 0.000" },
  "general": { "clearcolor": "0.000 0.000 0.000", "orthogonalprojection": { "height": 1080, "width": 2520 } },
  "objects": [
    { "id": 1, "model": "models/bgfade/bgfade.mdl", "name": "bgfade", "origin": "0.000 0.000 0.000" },
    { "id": 2, "image": "models/retro.json", "name": "retro", "origin": "540.000 534.906 0.000" }
  ]
}
```

Objects reference models/materials (`materials/*.json`, `.tex-json`), effects,
particles and shaders produced by the **Wallpaper Engine editor**. Text is not
a first-class, reflowing layer: a terminal made of scene objects would need the
entire UI pre-rendered as textures or built from hundreds of image layers, and
any animation/state machine would have to go through SceneScript and effect
graphs. The editor is effectively mandatory for anything non-trivial.

Strengths: GPU particles, lights, shaders, physics, per-pixel effects, very
cheap to render once authored, first-class editor support, workshop-friendly.
Weaknesses for this project: no DOM, no text layout, no diffable source, no
unit-testable logic, poor fit for a screen full of changing monospace text.

### 2. Web (`"type": "web"`, `file: "index.html"`)

A tiny local website rendered in CEF. Bundled examples:
`defaultprojects/corsair_collection` and `corsair_o_tron`. Their
`project.json` looks like this (abridged):

```json
{
  "title": "CORSAIR Collection",
  "description": "…",
  "file": "index.html",
  "preview": "preview.gif",
  "type": "web",
  "general": {
    "supportsaudioprocessing": true,
    "properties": {
      "schemecolor": { "order": 2, "text": "Scene color scheme", "type": "color", "value": "0 0 0" },
      "speed": { "order": 10, "text": "Effect speed", "type": "slider", "value": 2, "min": 1, "max": 10, "editable": true }
    }
  }
}
```

Everything the wallpaper needs (HTML, CSS, JS, images, fonts, `.webm`/`.ogg`
video) is bundled next to `index.html` and loaded locally. Runtime APIs exposed
to the page:

* `window.wallpaperPropertyListener.applyUserProperties(properties)` — full
  payload on load, then only changed properties.
* `applyGeneralProperties({ fps })` — current FPS limit from the app settings.
* `setPaused(isPaused)` — the process is frozen anyway, but useful for
  bookkeeping.
* `window.wallpaperRegisterAudioListener(fn)` — 128 float bins, 64 per channel,
  ~30 Hz, bass first in each channel. Requires
  `general.supportsaudioprocessing: true`.
* RGB/iCUE hooks (not used here — no supported hardware requirement).

Property types and payload formats:

| Type | `project.json` type | Payload |
| --- | --- | --- |
| Checkbox | `bool` | `true` / `false` |
| Slider | `slider` | number within `min`..`max`; `editable` adds a text box; `fraction` + `precision` allow decimals |
| Color | `color` | string `"r g b"` with floats 0..1 |
| Combo | `combo` | the selected option's `value` |
| Text | `textinput` | string |
| File / directory | `file`, `directory` | path(s); not used here |

Properties can have an `order`, a display `condition` written as a JS
expression over other properties (e.g. `showclock.value == true`), and
translated labels instead of plain `text`.

Strengths: real DOM/CSS/JS, diffable and testable source, instant live reload
in any Chromium browser, trivial responsive layout, easy dynamic content.
Weaknesses: CEF process per wallpaper (memory), text/filters can cost GPU if
abused, no access to the host system (by design), must bundle every asset.

### 3. Video / application

`"type": "video"` for pre-rendered loops and `"type": "application"` for
external executables (`sheep.exe` in the bundled examples). A terminal could be
pre-rendered to video, but it would be a fixed loop with no live clock, no
customization and a much larger file. Not a fit.

## Decision: web

The wallpaper is a text-heavy, stateful, themeable UI with live time and
synthetic telemetry. That is precisely what HTML/CSS/JS is good at, and
precisely what the scene format is bad at. The web type also keeps the entire
source reviewable in git, needs no editor round-trips, and runs in the same
Chromium 146 that can be used for development.

Risks accepted and mitigated:

* **file:// loading.** The page is loaded from disk, so the project avoids ES
  modules, `fetch()`, absolute paths and anything CORS-dependent. All scripts
  are classic `<script>` tags, all assets are relative.
* **Process memory / CPU.** One RAF loop, FPS limit from
  `applyGeneralProperties`, 2 Hz charts, 1 Hz clock, cached grain tile,
  animation stops on pause. `prefers-reduced-motion` is respected.
* **Property drift.** `js/properties.js` is the single source of truth; the
  checked-in `project.json` is generated from it by
  `tools/gen-project-json.mjs` (`npm run gen`, `npm run check`).
* **No internet.** Every font fallback is a local system font; no CDN, no
  analytics, no remote images.

## Local install & preview

* Local projects live in `<install>\projects\myprojects\<folder>`.
  `tools/install-wallpaper.ps1` copies the runtime files there (excluding
  docs/tooling) and can open the wallpaper through
  `wallpaper64.exe -control openWallpaper -file "<project.json>"`.
* The **editor** imports a web project by dragging `index.html` onto
  “Create Wallpaper”; it copies the folder into `myprojects` and generates
  `project.json`.
* `preview` in `project.json` is the thumbnail shown in the Installed/Workshop
  lists; a 16:9 JPG/GIF is expected.
* Debugging: set a CEF devtools port in Wallpaper Engine's General settings,
  then open `localhost:<port>` in Chrome/Edge to inspect the live wallpaper.
  During development, `npm run serve` + a normal Chromium window is faster.

## References

* Web wallpaper overview — https://docs.wallpaperengine.io/en/web/overview.html
* Creating a web wallpaper — https://docs.wallpaperengine.io/en/web/first/gettingstarted.html
* `wallpaperPropertyListener` — https://docs.wallpaperengine.io/en/web/api/propertylistener.html
* User properties — https://docs.wallpaperengine.io/en/web/customization/properties.html
* Display conditions — https://docs.wallpaperengine.io/en/web/customization/displaycondition.html
* Audio visualization — https://docs.wallpaperengine.io/en/web/audio/visualizer.html
* FPS limiter — https://docs.wallpaperengine.io/en/web/performance/fps.html
* Web debugging — https://docs.wallpaperengine.io/en/web/debug/debug.html
