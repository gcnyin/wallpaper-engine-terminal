/*
 * fx.js — one bloom, a generated grain tile, audio-reactive glow, parallax.
 *
 * The grain is rasterised exactly once. Scanlines are a static CSS gradient.
 * Audio only modulates custom properties; no canvas or layout work per frame.
 */
(function (root) {
  'use strict';

  var el = {};
  var settings = null;
  var staticMode = false;
  var grainReady = false;
  var parallaxOn = false;
  var px = 0;
  var py = 0;
  var tx = 0;
  var ty = 0;
  var audioLevel = 0;

  function makeGrain() {
    if (grainReady) return;
    var size = 184;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var img = ctx.createImageData(size, size);
    var data = img.data;
    for (var i = 0; i < data.length; i += 4) {
      var a = Math.random();
      // Most pixels are almost transparent; a few are bright specks.
      var alpha = a > 0.82 ? 46 + Math.random() * 92 : Math.random() * 26;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
    el.grain.style.backgroundImage = 'url(' + canvas.toDataURL('image/png') + ')';
    grainReady = true;
  }

  function init(initialSettings) {
    settings = Object.assign({}, initialSettings || {});
    el.grain = document.querySelector('.crt__grain');
    el.bloom = document.querySelector('.backdrop__bloom');
    el.frame = document.getElementById('frame');
    document.documentElement.style.setProperty('--audio-level', '0');
    makeGrain();
    bindPointer();
  }

  function bindPointer() {
    window.addEventListener(
      'pointermove',
      function (event) {
        if (!parallaxOn || staticMode) return;
        var w = window.innerWidth || 1;
        var h = window.innerHeight || 1;
        tx = ((event.clientX / w) - 0.5) * 12;
        ty = ((event.clientY / h) - 0.5) * 12;
        tx = Math.max(-6, Math.min(6, tx));
        ty = Math.max(-6, Math.min(6, ty));
      },
      { passive: true }
    );
  }

  function setParallax(value) {
    parallaxOn = !!value;
    if (!parallaxOn) {
      px = 0;
      py = 0;
      if (el.frame) el.frame.style.transform = '';
      if (el.bloom) el.bloom.style.marginLeft = '';
      if (el.bloom) el.bloom.style.marginTop = '';
    }
  }

  function setStatic(value) {
    staticMode = !!value;
    if (staticMode) {
      setParallax(false);
      audioLevel = 0;
      document.documentElement.style.setProperty('--audio-level', '0');
    }
  }

  function updateSettings(next) {
    settings = Object.assign({}, next || settings);
    if (settings.parallax === false) setParallax(false);
    setParallax(!!settings.parallax && !staticMode);
  }

  function audioTick(dt) {
    var target = 0;
    var TW = root.TW;
    if (settings.audioglow && TW && TW.audioActive && !TW.paused) {
      var audio = TW.audio;
      var sum = 0;
      var n = 0;
      for (var i = 0; i < 8; i++) {
        sum += audio[i] || 0;
        n++;
      }
      for (var j = 64; j < 72; j++) {
        sum += audio[j] || 0;
        n++;
      }
      target = Math.min(1, (sum / n) * 2.4);
    }
    var speed = target > audioLevel ? 0.22 : 0.07;
    audioLevel += (target - audioLevel) * speed;
    if (audioLevel < 0.002) audioLevel = 0;
    document.documentElement.style.setProperty('--audio-level', audioLevel.toFixed(3));
  }

  function tick(now, dt) {
    if (staticMode) return;
    if (parallaxOn) {
      px += (tx - px) * 0.075;
      py += (ty - py) * 0.075;
      if (el.frame) {
        el.frame.style.transform =
          'translate3d(' + px.toFixed(2) + 'px,' + py.toFixed(2) + 'px,0)';
      }
      if (el.bloom) {
        el.bloom.style.marginLeft = (px * -1.2).toFixed(2) + 'px';
        el.bloom.style.marginTop = (py * -1.2).toFixed(2) + 'px';
      }
    }
    audioTick(dt || 16);
  }

  root.PhosphorFx = {
    init: init,
    updateSettings: updateSettings,
    setStatic: setStatic,
    tick: tick
  };
})(window);
