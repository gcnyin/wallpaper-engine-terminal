/*
 * we-api.js — the only file in this project that talks to Wallpaper Engine.
 *
 * Responsibilities:
 *   - normalize Wallpaper Engine user properties into `TW.settings`
 *     (validated against js/properties.js, clamped, color-parsed)
 *   - expose pause / FPS-limit / audio frames as plain JS state
 *   - mirror a few values onto <html> as CSS custom properties and data attributes
 *   - provide an opt-in developer panel (index.html?dev=1) for browser testing
 *
 * Contract used by the UI code (js/app.js and friends):
 *
 *   TW.settings            live, mutable snapshot of all user properties
 *   TW.onSettings(fn)      fn(settings, changedKeys) — fired immediately, then on every change
 *   TW.onPause(fn)         fn(isPaused)
 *   TW.onResize(fn)        fn({ width, height, dpr })
 *   TW.paused              boolean
 *   TW.fpsLimit            0 = no limit suggested by Wallpaper Engine
 *   TW.audio               Float32Array(128) — 0..63 left, 64..127 right; all zero if inactive
 *   TW.audioActive         true while audio frames are arriving
 *   TW.isWE                true once Wallpaper Engine has called into us
 *   TW.parseColor(value)   -> { r, g, b, css, hex } (accepts "r g b" floats)
 *
 * CSS variables maintained on <html>:
 *   --we-accent, --we-accent-rgb   from the `schemecolor` property
 *   --we-scale                     fontscale / 100
 *   --we-scanlines                 0..1
 *   --we-glow                      0..1
 * <html> also gets data-theme, data-paused and data-audio.
 *
 * Keep this file framework-free and synchronous-friendly: the wallpaper must
 * render its first frame without waiting for any event.
 */
(function () {
  'use strict';

  var META = window.WE_PROJECT_PROPERTIES;
  if (!META || !META.properties) {
    console.error('[we-api] js/properties.js must be loaded before js/we-api.js');
    return;
  }

  var props = META.properties;
  var byKey = Object.create(null);
  for (var i = 0; i < props.length; i++) byKey[props[i].key] = props[i];

  function isArray(v) {
    return Object.prototype.toString.call(v) === '[object Array]';
  }

  function toBool(v) {
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  function clamp(v, min, max) {
    v = Number(v);
    if (!isFinite(v)) return null;
    if (typeof min === 'number' && v < min) v = min;
    if (typeof max === 'number' && v > max) v = max;
    return v;
  }

  /**
   * Accepts every color shape this project can encounter:
   *   "0.2 1 0.53"      Wallpaper Engine property payload
   *   [0.2, 1, 0.53]    older builds / arrays
   *   "#21ff87"         dev panel / CSS
   *   "rgb(33, 255, 135)" already-normalized settings value
   */
  function parseColor(value) {
    var r;
    var g;
    var b;
    if (isArray(value)) {
      r = Number(value[0]);
      g = Number(value[1]);
      b = Number(value[2]);
    } else if (typeof value === 'string') {
      var text = value.trim();
      if (text.charAt(0) === '#') {
        var hex = text.slice(1);
        if (hex.length === 3) {
          hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
        }
        var parsed = parseInt(hex, 16);
        if (hex.length === 6 && !isNaN(parsed)) {
          r = (parsed >> 16) & 255;
          g = (parsed >> 8) & 255;
          b = parsed & 255;
          // Hex is already 0..255; skip the float scaling below.
          return finishColor(r, g, b);
        }
      }
      var match = text.match(/rgba?\(([^)]+)\)/);
      if (match) {
        var channels = match[1].split(/[\s,/]+/);
        return finishColor(Number(channels[0]), Number(channels[1]), Number(channels[2]));
      }
      var parts = text.split(/\s+/);
      r = Number(parts[0]);
      g = Number(parts[1]);
      b = Number(parts[2]);
    }
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) {
      r = g = b = 1;
    }
    // Wallpaper Engine hands out 0..1 floats; tolerate accidental 0..255 values.
    if (r > 1 || g > 1 || b > 1) {
      r /= 255;
      g /= 255;
      b /= 255;
    }
    return finishColor(r * 255, g * 255, b * 255);
  }

  function finishColor(r255, g255, b255) {
    var r2 = Number(r255);
    var g2 = Number(g255);
    var b2 = Number(b255);
    if (!isFinite(r2) || !isFinite(g2) || !isFinite(b2)) {
      r2 = g2 = b2 = 255;
    }
    var ri = Math.max(0, Math.min(255, Math.round(r2)));
    var gi = Math.max(0, Math.min(255, Math.round(g2)));
    var bi = Math.max(0, Math.min(255, Math.round(b2)));
    function hex2(n) {
      return ('0' + n.toString(16)).slice(-2);
    }
    return {
      r: ri,
      g: gi,
      b: bi,
      rgb: ri + ' ' + gi + ' ' + bi,
      css: 'rgb(' + ri + ', ' + gi + ', ' + bi + ')',
      hex: '#' + hex2(ri) + hex2(gi) + hex2(bi)
    };
  }

  /** Coerce one raw Wallpaper Engine value according to its declared type. */
  function normalize(meta, raw) {
    var v = raw;
    switch (meta.type) {
      case 'bool':
        return toBool(v);
      case 'slider': {
        var n = clamp(v, meta.min, meta.max);
        return n === null ? meta.value : n;
      }
      case 'color':
        return parseColor(v).css;
      case 'combo': {
        var ok = false;
        if (meta.options) {
          for (var i = 0; i < meta.options.length; i++) {
            if (meta.options[i].value === v) {
              ok = true;
              break;
            }
          }
        }
        return ok ? v : meta.value;
      }
      case 'textinput': {
        var s = v === null || v === undefined ? '' : String(v);
        // Keep prompts on a single line and prevent absurd values.
        return s.replace(/[\r\n\t]+/g, ' ').slice(0, 64);
      }
      default:
        return v;
    }
  }

  // ---------------------------------------------------------------- state ---

  var settings = {};
  for (var p = 0; p < props.length; p++) settings[props[p].key] = props[p].value;

  var settingsListeners = [];
  var pauseListeners = [];
  var resizeListeners = [];

  var TW = {
    settings: settings,
    paused: false,
    fpsLimit: 0,
    isWE: false,
    audio: new Float32Array(128),
    audioActive: false,
    parseColor: parseColor,
    version: '1.2.1'
  };

  TW.onSettings = function (fn) {
    if (typeof fn !== 'function') return;
    settingsListeners.push(fn);
    callSafely(fn, settings, Object.keys(settings));
    return function () {
      var idx = settingsListeners.indexOf(fn);
      if (idx >= 0) settingsListeners.splice(idx, 1);
    };
  };

  TW.onPause = function (fn) {
    if (typeof fn !== 'function') return;
    pauseListeners.push(fn);
    return function () {
      var idx = pauseListeners.indexOf(fn);
      if (idx >= 0) pauseListeners.splice(idx, 1);
    };
  };

  TW.onResize = function (fn) {
    if (typeof fn !== 'function') return;
    resizeListeners.push(fn);
    fn({ width: window.innerWidth, height: window.innerHeight, dpr: devicePixelRatio || 1 });
    return function () {
      var idx = resizeListeners.indexOf(fn);
      if (idx >= 0) resizeListeners.splice(idx, 1);
    };
  };

  function callSafely(fn, a, b) {
    try {
      fn(a, b);
    } catch (err) {
      console.error('[we-api] listener failed', err);
    }
  }

  // ------------------------------------------------------- CSS side effects --

  function applyDerived() {
    var el = document.documentElement;
    var accent = parseColor(settings.schemecolor);
    el.style.setProperty('--we-accent', accent.css);
    el.style.setProperty('--we-accent-rgb', accent.rgb);
    el.style.setProperty('--we-scale', String((Number(settings.fontscale) || 100) / 100));
    el.style.setProperty('--we-scanlines', String((Number(settings.scanlines) || 0) / 100));
    el.style.setProperty('--we-glow', String((Number(settings.glow) || 0) / 100));
    el.setAttribute('data-theme', String(settings.theme));
    if (settings.session) el.setAttribute('data-session', String(settings.session));
  }

  function setPaused(isPaused) {
    TW.paused = !!isPaused;
    document.documentElement.setAttribute('data-paused', TW.paused ? 'true' : 'false');
    updateAudioAttribute();
    for (var i = 0; i < pauseListeners.length; i++) callSafely(pauseListeners[i], TW.paused);
  }

  function updateAudioAttribute() {
    document.documentElement.setAttribute(
      'data-audio',
      TW.audioActive && !TW.paused ? 'true' : 'false'
    );
  }

  function commit(rawChange, eventName) {
    var changed = [];
    for (var key in rawChange) {
      if (!Object.prototype.hasOwnProperty.call(rawChange, key)) continue;
      var meta = byKey[key];
      if (!meta) continue; // unknown key (older/newer project.json) — ignore
      var entry = rawChange[key];
      var raw = entry && typeof entry === 'object' ? entry.value : entry;
      var next = normalize(meta, raw);
      if (settings[key] !== next) {
        settings[key] = next;
        changed.push(key);
      }
    }
    applyDerived();
    if (!changed.length) return;
    for (var i = 0; i < settingsListeners.length; i++) {
      callSafely(settingsListeners[i], settings, changed);
    }
    if (window.console && TW._debug) {
      console.log('[we-api] ' + eventName, changed.join(', '));
    }
  }

  // ------------------------------------------------------------ WE bridge ---

  // Must be assigned globally and outside of any event handler, otherwise the
  // first property payload can be missed.
  window.wallpaperPropertyListener = {
    applyUserProperties: function (properties) {
      TW.isWE = true;
      commit(properties || {}, 'applyUserProperties');
    },
    applyGeneralProperties: function (properties) {
      TW.isWE = true;
      if (properties && typeof properties.fps === 'number') {
        TW.fpsLimit = properties.fps;
      }
    },
    setPaused: function (isPaused) {
      TW.isWE = true;
      setPaused(isPaused);
    },
    setAudio: function () {
      // Older Wallpaper Engine builds deliver audio through this callback.
      // Modern builds use wallpaperRegisterAudioListener, wired up below.
    }
  };

  // Audio visualizer: register once, synchronously, from a script that sits at
  // the end of <body> (Wallpaper Engine's documented requirement).
  if (typeof window.wallpaperRegisterAudioListener === 'function') {
    var lastFrame = 0;
    window.wallpaperRegisterAudioListener(function (frame) {
      if (!frame) return;
      var n = Math.min(frame.length, 128);
      for (var i = 0; i < n; i++) {
        var v = Number(frame[i]);
        TW.audio[i] = isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
      }
      TW.audioActive = true;
      lastFrame = Date.now();
      if (Date.now() - (TW._audioAttrAt || 0) > 500) {
        TW._audioAttrAt = Date.now();
        updateAudioAttribute();
      }
    });
    // Fade back to inactive when the system has been silent for a while.
    setInterval(function () {
      if (TW.audioActive && Date.now() - lastFrame > 1500) {
        TW.audioActive = false;
        updateAudioAttribute();
      }
    }, 700);
  }

  // --------------------------------------------------------- resize / init --

  var resizeRaf = 0;
  window.addEventListener('resize', function () {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(function () {
      resizeRaf = 0;
      var info = {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: devicePixelRatio || 1
      };
      for (var i = 0; i < resizeListeners.length; i++) callSafely(resizeListeners[i], info);
    });
  });

  // URL overrides: index.html?theme=amber&typingspeed=8 — handy for screenshots
  // and for previewing a property without going through the Wallpaper Engine UI.
  (function applyQueryOverrides() {
    if (!window.location || !window.location.search) return;
    var query = window.location.search.replace(/^\?/, '').split('&');
    var overrides = {};
    for (var i = 0; i < query.length; i++) {
      if (!query[i]) continue;
      var pair = query[i].split('=');
      var key = decodeURIComponent(pair[0]);
      if (!byKey[key]) continue;
      var raw = decodeURIComponent((pair[1] || '').replace(/\+/g, ' '));
      overrides[key] = { value: raw };
    }
    commit(overrides, 'url');
  })();

  // ?fps=15 mirrors what applyGeneralProperties would deliver, so the FPS cap
  // can be tested in a browser without Wallpaper Engine.
  (function applyFpsOverride() {
    var match = /[?&]fps=(\d+)/.exec(window.location.search || '');
    if (match) TW.fpsLimit = Number(match[1]);
  })();

  applyDerived();
  document.documentElement.setAttribute('data-paused', 'false');

  // ---------------------------------------------------------- dev harness ---

  function wantsDevPanel() {
    return /(^|[?&])dev=1(&|$)/.test(window.location.search || '');
  }

  function buildDevPanel() {
    var style = document.createElement('style');
    style.textContent = [
      '#we-dev{position:fixed;right:12px;bottom:12px;z-index:2147483647;width:268px;',
      'max-height:78vh;overflow:auto;padding:10px 12px;border-radius:10px;',
      'background:rgba(12,14,16,.93);color:#d7dde3;font:11px/1.5 Consolas,monospace;',
      'box-shadow:0 12px 40px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12)}',
      '#we-dev h4{margin:0 0 8px;font:600 11px/1.4 Consolas,monospace;letter-spacing:.12em;',
      'text-transform:uppercase;color:#8b98a5}',
      '#we-dev label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0}',
      '#we-dev select,#we-dev input[type=text]{width:132px;background:#1b2027;color:#e6edf3;',
      'border:1px solid #30363d;border-radius:4px;padding:2px 4px;font:inherit}',
      '#we-dev input[type=range]{width:126px;accent-color:#3fb950}',
      '#we-dev .row-pause{justify-content:flex-start;gap:8px;margin-top:8px;padding-top:8px;',
      'border-top:1px solid rgba(255,255,255,.1)}'
    ].join('');
    document.head.appendChild(style);

    var panel = document.createElement('div');
    panel.id = 'we-dev';
    var title = document.createElement('h4');
    title.textContent = 'WE dev panel';
    panel.appendChild(title);

    props.forEach(function (meta) {
      var label = document.createElement('label');
      var name = document.createElement('span');
      name.textContent = meta.text || meta.key;
      label.appendChild(name);
      var input;
      if (meta.type === 'combo') {
        input = document.createElement('select');
        meta.options.forEach(function (option) {
          var el = document.createElement('option');
          el.value = option.value;
          el.textContent = option.label;
          input.appendChild(el);
        });
        input.value = settings[meta.key];
        input.addEventListener('change', function () {
          devApply(meta.key, input.value);
        });
      } else if (meta.type === 'bool') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!settings[meta.key];
        input.addEventListener('change', function () {
          devApply(meta.key, input.checked);
        });
      } else if (meta.type === 'slider') {
        input = document.createElement('input');
        input.type = 'range';
        input.min = meta.min;
        input.max = meta.max;
        input.value = settings[meta.key];
        input.addEventListener('input', function () {
          devApply(meta.key, input.value);
        });
      } else if (meta.type === 'color') {
        input = document.createElement('input');
        input.type = 'color';
        input.style.width = '44px';
        input.style.padding = '0';
        input.style.background = 'transparent';
        input.value = parseColor(settings[meta.key]).hex;
        input.addEventListener('input', function () {
          var hex = input.value.replace('#', '');
          var n = parseInt(hex, 16);
          var we =
            (((n >> 16) & 255) / 255).toFixed(3) +
            ' ' +
            (((n >> 8) & 255) / 255).toFixed(3) +
            ' ' +
            ((n & 255) / 255).toFixed(3);
          devApply(meta.key, we);
        });
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = settings[meta.key];
        input.addEventListener('input', function () {
          devApply(meta.key, input.value);
        });
      }
      label.appendChild(input);
      panel.appendChild(label);
    });

    var pauseRow = document.createElement('label');
    pauseRow.className = 'row-pause';
    var pauseBox = document.createElement('input');
    pauseBox.type = 'checkbox';
    pauseBox.addEventListener('change', function () {
      setPaused(pauseBox.checked);
    });
    var pauseText = document.createElement('span');
    pauseText.textContent = 'simulate pause';
    pauseRow.appendChild(pauseBox);
    pauseRow.appendChild(pauseText);
    panel.appendChild(pauseRow);

    var audioRow = document.createElement('label');
    audioRow.className = 'row-pause';
    var audioBox = document.createElement('input');
    audioBox.type = 'checkbox';
    audioBox.addEventListener('change', function () {
      simulateAudio = audioBox.checked;
      if (!simulateAudio) {
        TW.audio.fill(0);
        TW.audioActive = false;
        updateAudioAttribute();
      }
    });
    var audioText = document.createElement('span');
    audioText.textContent = 'simulate audio beat';
    audioRow.appendChild(audioBox);
    audioRow.appendChild(audioText);
    panel.appendChild(audioRow);

    document.body.appendChild(panel);

    var simulateAudio = false;
    (function audioTick() {
      if (simulateAudio) {
        var t = performance.now() / 1000;
        var beat = Math.pow(Math.max(0, Math.sin(t * 6.5)), 14) * 0.9 + 0.05;
        for (var i = 0; i < 128; i++) {
          var band = i < 64 ? i : i - 64;
          TW.audio[i] = Math.max(0, beat * Math.exp(-band / 22) + Math.random() * 0.02);
        }
        TW.audioActive = true;
        updateAudioAttribute();
      }
      setTimeout(audioTick, 100);
    })();
  }

  function devApply(key, raw) {
    var change = {};
    change[key] = { value: raw };
    commit(change, 'dev');
  }

  TW._debug = /(^|[?&])debug=1(&|$)/.test(window.location.search || '');

  if (wantsDevPanel()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', buildDevPanel);
    } else {
      buildDevPanel();
    }
  }

  window.TW = TW;
})();
