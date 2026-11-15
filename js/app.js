/*
 * app.js — boot, property wiring, the one RAF loop, test hooks.
 */
(function (root) {
  'use strict';

  var html = document.documentElement;
  var query = root.location && root.location.search ? root.location.search : '';
  var demo = /(^|[?&])demo=1(&|$)/.test(query);
  var still = /(^|[?&])still=1(&|$)/.test(query);
  var reduced = false;
  try {
    reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (err) {
    reduced = false;
  }

  var staticMode = !!(still || reduced);
  var frameEl = document.getElementById('frame');
  var clockBlock = document.getElementById('clockBlock');
  var railEl = document.getElementById('rail');

  var rafId = 0;
  var lastProcessed = 0;
  var readyDone = false;
  var firstSettings = true;
  var bootSnapshot = null;
  var lastW = root.innerWidth || 0;
  var lastH = root.innerHeight || 0;
  var resizeTimer = 0;
  var scaleTimer = 0;

  var hooks = {
    ready: false,
    frame: 0,
    restart: function (session) {
      return restartHook(session);
    },
    getState: function () {
      var terminal = root.PhosphorTerminal ? root.PhosphorTerminal.getState() : null;
      var rail = root.PhosphorRail ? root.PhosphorRail.getState() : null;
      return {
        ready: hooks.ready,
        frame: hooks.frame,
        render: html.getAttribute('data-render'),
        theme: html.getAttribute('data-theme'),
        session: root.TW ? root.TW.settings.session : null,
        paused: root.TW ? root.TW.paused : false,
        fpsLimit: root.TW ? root.TW.fpsLimit : 0,
        audioActive: root.TW ? root.TW.audioActive : false,
        demo: demo,
        still: staticMode,
        terminal: terminal,
        rail: rail
      };
    }
  };
  root.__phosphor = hooks;

  function applyLayout(settings) {
    var sidebar = !!(settings && settings.showsidebar);
    frameEl.setAttribute('data-rail', sidebar ? 'on' : 'off');
    if (clockBlock) clockBlock.hidden = !(settings && settings.showclock);
    if (railEl) {
      railEl.setAttribute(
        'data-compact',
        Number(settings && settings.fontscale) >= 122 ? 'true' : 'false'
      );
    }
    var compactBanner =
      Number(settings && settings.fontscale) >= 125 &&
      (root.innerWidth || 0) <= 1500;
    html.setAttribute('data-banner', compactBanner ? 'compact' : 'full');
    html.setAttribute('data-motion', staticMode ? 'static' : 'live');
  }

  function applyAccent(settings) {
    if (!root.TW || !root.TW.parseColor) return;
    var color = root.TW.parseColor(settings && settings.schemecolor);
    var isDefault =
      color.r === 51 && color.g === 255 && color.b === 135;
    var next = isDefault ? 'theme' : 'custom';
    if (html.getAttribute('data-accent') !== next) {
      html.setAttribute('data-accent', next);
    }
  }

  function scheduleResizeWork(kind) {
    if (kind === 'fontscale') {
      clearTimeout(scaleTimer);
      scaleTimer = setTimeout(function () {
        if (root.PhosphorRail) root.PhosphorRail.resize();
        if (root.PhosphorTerminal) {
          root.PhosphorTerminal.reflow();
          setTimeout(function () {
            root.PhosphorTerminal.scrollBottom();
            if (staticMode) root.PhosphorTerminal.fitStatic();
          }, 140);
        }
        if (staticMode && root.PhosphorRail) root.PhosphorRail.renderStatic();
      }, 150);
      return;
    }

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      applyLayout(root.TW ? root.TW.settings : {});
      if (root.PhosphorRail) root.PhosphorRail.resize();
      if (root.PhosphorTerminal) {
        root.PhosphorTerminal.reflow();
        setTimeout(function () {
          root.PhosphorTerminal.scrollBottom();
          if (staticMode) root.PhosphorTerminal.fitStatic();
        }, 140);
      }
      if (staticMode && root.PhosphorRail) root.PhosphorRail.renderStatic();
    }, 170);
  }

  function afterSidebarChange() {
    // The grid snaps synchronously; give the browser one tick to reflow the
    // text, then re-anchor the scrollback.
    setTimeout(function () {
      if (root.PhosphorTerminal) root.PhosphorTerminal.scrollBottom();
      if (root.PhosphorRail) root.PhosphorRail.resize();
    }, 40);
  }

  function handleSettings(settings, changed) {
    var sessionChanged = changed.indexOf('session') !== -1;
    var bannerChanged = changed.indexOf('showbanner') !== -1;
    applyAccent(settings);

    if (root.PhosphorTerminal) {
      var terminalChanged = changed;
      if (sessionChanged && bannerChanged) {
        // The session restart composes with the new banner setting; avoid a
        // throwaway compose of the old session.
        terminalChanged = changed.filter(function (key) {
          return key !== 'showbanner';
        });
      }
      root.PhosphorTerminal.updateSettings(settings, terminalChanged);
    }

    applyLayout(settings);

    if (sessionChanged) {
      if (root.PhosphorRail) root.PhosphorRail.setSession(settings.session);
      if (root.PhosphorTerminal) root.PhosphorTerminal.restart(settings.session);
    } else if (root.PhosphorRail) {
      root.PhosphorRail.updateSettings(settings);
    }

    if (root.PhosphorFx) root.PhosphorFx.updateSettings(settings);

    if (changed.indexOf('fontscale') !== -1) {
      scheduleResizeWork('fontscale');
    }
    if (changed.indexOf('showsidebar') !== -1) {
      afterSidebarChange();
    }
    if (staticMode && root.PhosphorTerminal) {
      root.PhosphorTerminal.fitStatic();
      setTimeout(function () {
        if (staticMode && root.PhosphorTerminal) root.PhosphorTerminal.fitStatic();
      }, 90);
    }
  }

  function restartHook(session) {
    if (!session || !root.PhosphorContent || !root.PhosphorContent.sessions[session]) {
      return false;
    }
    if (root.TW) root.TW.settings.session = session;
    html.setAttribute('data-session', session);
    if (root.PhosphorRail) root.PhosphorRail.setSession(session);
    if (root.PhosphorTerminal) root.PhosphorTerminal.restart(session);
    if (staticMode && root.PhosphorTerminal) root.PhosphorTerminal.fitStatic();
    if (staticMode && root.PhosphorRail) root.PhosphorRail.renderStatic();
    return true;
  }

  function markReady() {
    if (readyDone) return;

    var done = function () {
      if (readyDone) return;
      readyDone = true;
      hooks.ready = true;
      if (root.PhosphorTerminal) root.PhosphorTerminal.scrollBottom();
      if (staticMode && root.PhosphorTerminal) root.PhosphorTerminal.fitStatic();
      html.setAttribute('data-render', 'ready');
      // Font metrics can settle a frame after the composed scene is laid out;
      // re-anchor once so the live prompt is never left below the fold.
      setTimeout(function () {
        if (root.PhosphorTerminal) root.PhosphorTerminal.scrollBottom();
        if (staticMode && root.PhosphorTerminal) root.PhosphorTerminal.fitStatic();
      }, 240);
    };

    var paint = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(done);
      });
    };

    if (document.readyState === 'complete') paint();
    else root.addEventListener('load', paint, { once: true });

    // Headless / hidden-tab safety net. The double rAF is the normal path.
    setTimeout(done, 700);
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    lastProcessed = 0;
  }

  function ensureLoop() {
    if (rafId || staticMode) return;
    if (root.TW && root.TW.paused) return;
    lastProcessed = 0;
    rafId = requestAnimationFrame(loop);
  }

  function loop(at) {
    rafId = 0;
    if (staticMode) return;
    if (root.TW && root.TW.paused) return;

    rafId = requestAnimationFrame(loop);

    var fps = 60;
    if (root.TW && root.TW.fpsLimit > 0) fps = Math.min(60, Math.max(1, root.TW.fpsLimit));
    if (lastProcessed && at - lastProcessed < (1000 / fps) - 1) return;

    var step = lastProcessed ? at - lastProcessed : 16;
    if (step > 100) step = 100;
    if (step < 0) step = 0;
    lastProcessed = at;

    if (root.PhosphorTerminal) root.PhosphorTerminal.tick(at);
    if (root.PhosphorRail) root.PhosphorRail.tick(at);
    if (root.PhosphorFx) root.PhosphorFx.tick(at, step);
    hooks.frame++;
  }

  function bindEvents() {
    if (root.TW) {
      root.TW.onSettings(function (settings, changed) {
        if (firstSettings) {
          firstSettings = false;
          if (bootSnapshot) {
            var diff = [];
            for (var key in settings) {
              if (
                Object.prototype.hasOwnProperty.call(settings, key) &&
                settings[key] !== bootSnapshot[key]
              ) {
                diff.push(key);
              }
            }
            if (diff.length) handleSettings(settings, diff);
          }
          return;
        }
        handleSettings(settings, changed || []);
      });

      root.TW.onPause(function (paused) {
        if (paused) {
          stopLoop();
        } else {
          ensureLoop();
        }
      });

      root.TW.onResize(function (info) {
        if (info.width === lastW && info.height === lastH) return;
        lastW = info.width;
        lastH = info.height;
        scheduleResizeWork('resize');
      });
    }
  }

  function boot() {
    if (!root.TW || !root.PhosphorTerminal || !root.PhosphorRail) {
      return;
    }

    var settings = root.TW.settings;
    bootSnapshot = Object.assign({}, settings);
    applyAccent(settings);
    applyLayout(settings);

    if (root.PhosphorRail) root.PhosphorRail.init(settings);
    if (root.PhosphorTerminal) root.PhosphorTerminal.init(settings);
    if (root.PhosphorFx) root.PhosphorFx.init(settings);

    if (root.PhosphorTerminal) root.PhosphorTerminal.updateSettings(settings);
    if (root.PhosphorTerminal) {
      root.PhosphorTerminal.setStatic(staticMode);
      root.PhosphorTerminal.restart(settings.session);
    }

    if (staticMode) {
      html.setAttribute('data-motion', 'static');
      if (root.PhosphorTerminal) root.PhosphorTerminal.fitStatic();
      if (root.PhosphorRail) {
        root.PhosphorRail.setStatic(true);
        root.PhosphorRail.renderStatic();
      }
      if (root.PhosphorFx) {
        root.PhosphorFx.setStatic(true);
        root.PhosphorFx.updateSettings(settings);
      }
    } else {
      html.setAttribute('data-motion', 'live');
      if (root.PhosphorTerminal) root.PhosphorTerminal.setStatic(false);
      if (root.PhosphorRail) root.PhosphorRail.setStatic(false);
      if (root.PhosphorFx) {
        root.PhosphorFx.setStatic(false);
        root.PhosphorFx.updateSettings(settings);
      }
    }

    bindEvents();

    if (!staticMode && !(root.TW && root.TW.paused)) {
      ensureLoop();
    }

    if (staticMode) {
      // Set the static marker before the ready flag so the caret and grain are
      // frozen in the very first composed paint.
      html.setAttribute('data-motion', 'static');
    }
    markReady();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
