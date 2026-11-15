/*
 * terminal.js — scrollback, scene composition, human typing, command output.
 *
 * The terminal is not an emulator. It renders a curated session, keeps the
 * current prompt at the bottom, and composes a balanced still frame that keeps
 * fastfetch in view on short and tall screens. Motion is driven by app.js's
 * single RAF loop; this module never owns a timer or an animation frame.
 */
(function (root) {
  'use strict';

  var C = root.PhosphorContent;
  var esc = C.escape;
  var clean = C.clean;

  var SLOW_OUTPUT = {
    viteBuild: 68,
    cargoBuild: 74,
    cargoTest: 62,
    uvInstall: 52,
    train: 120,
    journalctl: 82,
    composeUp: 58,
    pacman: 62,
    rsync: 64,
    dockerPs: 42,
    perfStat: 54,
    uvAdd: 58
  };

  var el = null;
  var settings = null;
  var sessionId = 'mixed';
  var session = null;
  var staticMode = false;
  var bannerEl = null;
  var bannerGroup = null;

  var state = {
    mode: 'idle',
    current: null,
    idleUntil: 0,
    nextAt: 0,
    queue: [],
    qi: 0,
    typoUsed: false,
    typoAt: 0,
    lastCommandId: null,
    commandsSinceClear: 0,
    pool: [],
    clearAt: 0
  };

  var generation = 0;

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function init(initialSettings) {
    settings = Object.assign({}, initialSettings || {});
    sessionId = settings.session || 'mixed';
    session = C.getSession(sessionId);
    el = {
      screen: document.getElementById('termScreen'),
      history: document.getElementById('termHistory')
    };
  }

  /* --------------------------------------------------------------------- */
  /* composition                                                           */
  /* --------------------------------------------------------------------- */

  function promptLine(commandText, withCaret) {
    var user = clean(settings.promptuser, 'dev');
    var host = clean(settings.prompthost, 'workstation');
    var line = document.createElement('div');
    line.className = 'prompt-line';
    line.innerHTML =
      '<span class="p-user">' + esc(user) + '</span>' +
      '<span class="p-at">@</span>' +
      '<span class="p-host">' + esc(host) + '</span> ' +
      '<span class="p-cwd">~/dev/phosphor</span>' +
      '<span class="p-branch"> (main)</span>' +
      '<span class="p-char">❯</span>' +
      '<span class="cmd-text"></span>' +
      (withCaret ? '<span class="caret" aria-hidden="true"></span>' : '');
    line.querySelector('.cmd-text').textContent = commandText || '';
    return line;
  }

  function outputNode(lines) {
    var out = document.createElement('div');
    out.className = 'out';
    if (lines && lines.length) {
      var html = '';
      for (var i = 0; i < lines.length; i++) {
        html += '<div>' + lines[i] + '</div>';
      }
      out.innerHTML = html;
    }
    return out;
  }

  function spacerNode() {
    var spacer = document.createElement('div');
    spacer.className = 'term-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    return spacer;
  }

  function commandBlock(id) {
    var def = C.getCommand(id);
    if (!def) return null;
    var block = document.createElement('div');
    block.className = 'cmd';
    block.setAttribute('data-command', id);
    block.appendChild(promptLine(def.cmd, false));
    var lines = def.out;
    if (id === 'fastfetch') {
      lines = [C.buildFastfetch(settings, sessionId)];
    }
    block.appendChild(outputNode(lines));
    return block;
  }

  function fastfetchBlock() {
    var block = document.createElement('div');
    block.className = 'cmd cmd--banner';
    block.setAttribute('data-command', 'fastfetch');
    block.appendChild(promptLine('fastfetch', false));
    block.appendChild(outputNode([C.buildFastfetch(settings, sessionId)]));
    return block;
  }

  function pinCurrentEntry(entry, id) {
    if (!entry) return entry;
    entry.commandId = id;
    return entry;
  }

  function currentBlock() {
    var def = C.getCommand(session.partial) || C.getCommand('gitCommit');
    var block = document.createElement('div');
    block.className = 'cmd cmd--current is-current';
    block.setAttribute('data-command', session.partial);
    var prompt = promptLine('', true);
    var out = outputNode([]);
    block.appendChild(prompt);
    block.appendChild(out);
    var cmdText = prompt.querySelector('.cmd-text');
    var caret = prompt.querySelector('.caret');
    var prefix = String(session.prefix || '');
    if (prefix.length > def.cmd.length) prefix = def.cmd.slice(0, def.cmd.length);
    cmdText.textContent = prefix;
    return {
      block: block,
      prompt: prompt,
      cmdText: cmdText,
      caret: caret,
      out: out,
      entry: pinCurrentEntry(def, session.partial),
      commandId: session.partial,
      typed: prefix
    };
  }

  function renderComposition(prefill, pre, withBanner, post, current) {
    var frag = document.createDocumentFragment();
    var i;

    for (i = 0; i < prefill.length; i++) {
      var fillBlock = commandBlock(prefill[i]);
      if (fillBlock) frag.appendChild(fillBlock);
    }
    for (i = 0; i < pre.length; i++) {
      var preBlock = commandBlock(pre[i]);
      if (preBlock) frag.appendChild(preBlock);
    }
    if (withBanner) {
      bannerGroup = fastfetchBlock();
      frag.appendChild(bannerGroup);
      bannerEl = bannerGroup;
    } else {
      bannerGroup = null;
      bannerEl = null;
    }
    for (i = 0; i < post.length; i++) {
      var postBlock = commandBlock(post[i]);
      if (postBlock) frag.appendChild(postBlock);
    }

    frag.appendChild(current.block);
    frag.appendChild(spacerNode());
    el.history.replaceChildren(frag);
    scrollBottom();
    state.current = current;
  }

  function scrollBottom() {
    if (!el || !el.screen) return;
    el.screen.scrollTop = el.screen.scrollHeight;
  }

  function bannerTop() {
    if (!bannerEl) return null;
    var screenRect = el.screen.getBoundingClientRect();
    var bannerRect = bannerEl.getBoundingClientRect();
    return bannerRect.top - screenRect.top;
  }

  function buildFillers() {
    var ids = session.preExtra.concat(session.pool);
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!id || id === 'clear' || id === 'fastfetch' || id === session.partial) continue;
      if (seen[id]) continue;
      if (!C.getCommand(id)) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function compose() {
    if (!el) return;
    generation++;
    session = C.getSession(sessionId);

    var preBase = session.pre.slice();
    var post = session.post.slice();
    var extras = session.postExtra.slice();
    var withBanner = !!settings.showbanner;
    var prefill = [];
    var minPost = 1;
    var addBlocked = false;
    var current = currentBlock();

    for (var pass = 0; pass < 7; pass++) {
      renderComposition(prefill, preBase, withBanner, post, current);
      if (!withBanner) break;

      var h = el.screen.clientHeight || 1;
      var top = bannerTop();
      if (top == null) break;

      if (top < h * 0.15) {
        if (post.length > minPost) {
          post.pop();
          current = currentBlock();
          continue;
        }
        break;
      }

      if (top > h * 0.44 && extras.length && post.length < 5 && !addBlocked) {
        var extra = extras.shift();
        if (extra === session.partial || extra === 'fastfetch') {
          extra = extras.shift();
        }
        if (extra === session.partial || extra === 'fastfetch') {
          extra = extras.shift();
        }
        if (!extra) break;
        post.push(extra);
        current = currentBlock();
        renderComposition(prefill, preBase, withBanner, post, current);
        var after = bannerTop();
        if (after != null && after < h * 0.1) {
          post.pop();
          current = currentBlock();
          renderComposition(prefill, preBase, withBanner, post, current);
          addBlocked = true;
        }
        continue;
      }
      break;
    }

    /* Fill the pane above the composition with older scrollback. Adding above
       the banner never moves the banner, it only fills the quiet top fade. */
    var fillers = buildFillers();
    var guard = 0;
    while (guard++ < 9 && fillers.length) {
      if (el.history.offsetHeight >= el.screen.clientHeight + 2) break;
      prefill.unshift(fillers.shift());
      current = currentBlock();
      renderComposition(prefill, preBase, withBanner, post, current);
    }

    scrollBottom();
    resetLive();

    if (withBanner && bannerEl) {
      bannerEl.setAttribute('data-banner-visible', 'true');
    }
    trim();
  }

  function resetLive() {
    state.mode = 'idle';
    state.queue = [];
    state.qi = 0;
    state.typoUsed = false;
    state.typoAt = 0;
    state.commandsSinceClear = 0;
    state.pool = [];
    state.idleUntil = now() + 1150 + Math.random() * 600;
    if (state.current) {
      state.current.typed = state.current.cmdText.textContent;
    }
  }

  function trim() {
    if (!el || staticMode) return;
    var maxBlocks = 56;
    var guard = 0;
    while (el.history.childElementCount > maxBlocks && guard++ < 40) {
      var first = el.history.firstElementChild;
      if (!first || first === state.current.block) break;
      first.remove();
    }
  }

  /* --------------------------------------------------------------------- */
  /* live typing                                                           */
  /* --------------------------------------------------------------------- */

  function refreshPool() {
    if (!state.pool.length) {
      var source = session.pool.slice();
      for (var i = source.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = source[i];
        source[i] = source[j];
        source[j] = tmp;
      }
      state.pool = source;
    }
  }

  function chooseNext() {
    if (state.commandsSinceClear >= 10 && Math.random() < 0.18) {
      state.commandsSinceClear = 0;
      return 'clear';
    }
    refreshPool();
    var id = state.pool.shift();
    if (!id) return 'gitStatus';
    if (id === state.lastCommandId && state.pool.length) {
      state.pool.push(id);
      id = state.pool.shift();
    }
    return id;
  }

  function appendPromptBlock() {
    if (state.current && state.current.block) {
      state.current.block.classList.remove('cmd--current', 'is-current');
    }
    var block = document.createElement('div');
    block.className = 'cmd cmd--current is-current';
    var prompt = promptLine('', true);
    var out = outputNode([]);
    block.appendChild(prompt);
    block.appendChild(out);
    var oldSpacer = el.history.querySelector('.term-spacer');
    if (oldSpacer) oldSpacer.remove();
    el.history.appendChild(block);
    el.history.appendChild(spacerNode());
    state.current = {
      block: block,
      prompt: prompt,
      cmdText: prompt.querySelector('.cmd-text'),
      caret: prompt.querySelector('.caret'),
      out: out,
      entry: null,
      commandId: null,
      typed: ''
    };
    state.mode = 'idle';
    state.current.entry = null;
    state.current.typed = '';
    state.idleUntil = now() + 4000 + Math.random() * 5000;
    scrollBottom();
  }

  function finishCommand(at) {
    state.lastCommandId = state.current.commandId || null;
    state.commandsSinceClear++;
    appendPromptBlock();
    state.mode = 'idle';
    state.idleUntil = at + 4000 + Math.random() * 5000;
    trim();
  }

  function charDelay() {
    var speed = Math.max(1, Math.min(10, Number(settings.typingspeed) || 5));
    var base = 110 - (speed - 1) * (96 / 9);
    var delay = base * (0.72 + Math.random() * 0.58);
    if (Math.random() < 0.045) delay += 45 + Math.random() * 120;
    return delay;
  }

  function beginOutput(at) {
    var cur = state.current;
    if (!cur) return;
    if (cur.caret && cur.caret.parentNode) cur.caret.remove();
    var entry = cur.entry;
    if (!entry) {
      finishCommand(at);
      return;
    }
    if (entry.clear) {
      startClear(at);
      return;
    }
    state.queue = (entry.out || []).slice();
    state.qi = 0;
    state.mode = 'output';
    state.nextAt = at + 60 + Math.random() * 80;
    if (!state.queue.length) {
      state.nextAt = at + 220;
    }
  }

  function tickTyping(at) {
    var cur = state.current;
    if (!cur || !cur.entry) {
      state.mode = 'idle';
      state.idleUntil = at + 1200;
      return;
    }
    if (at < state.nextAt) return;

    var full = cur.entry.cmd;
    var typed = cur.typed;

    if (state.typoAt) {
      if (at < state.typoAt) return;
      typed = typed.slice(0, -1);
      cur.typed = typed;
      cur.cmdText.textContent = typed;
      state.typoAt = 0;
      state.nextAt = at + 90 + Math.random() * 90;
      scrollBottom();
      return;
    }

    if (typed.length < full.length) {
      var nextChar = full.charAt(typed.length);
      var canTypo = !state.typoUsed && typed.length > 3 && Math.random() < 0.012;
      if (canTypo) {
        var wrong = 'abcdefghijklmnopqrstuvwxyz'
          .charAt(Math.floor(Math.random() * 26));
        var correct = nextChar.toLowerCase();
        if (wrong === correct) wrong = wrong === 'a' ? 's' : 'a';
        typed += wrong;
        state.typoUsed = true;
        state.typoAt = at + 150 + Math.random() * 190;
        state.nextAt = state.typoAt;
      } else {
        typed += nextChar;
        state.nextAt = at + charDelay() + (nextChar === ' ' ? 22 : 0);
      }
      cur.typed = typed;
      cur.cmdText.textContent = typed;
      scrollBottom();
      return;
    }

    if (state.mode === 'typing') {
      state.mode = 'enter';
      state.nextAt = at + 150 + Math.random() * 170;
    }
  }

  function tickOutput(at) {
    if (at < state.nextAt) return;
    if (state.qi < state.queue.length) {
      var line = state.queue[state.qi++];
      var row = document.createElement('div');
      row.innerHTML = line;
      state.current.out.appendChild(row);
      scrollBottom();
      var pace = SLOW_OUTPUT[state.current.commandId]
        ? SLOW_OUTPUT[state.current.commandId]
        : 26;
      state.nextAt = at + pace * (0.7 + Math.random() * 0.6);
      return;
    }
    state.mode = 'after-output';
    state.nextAt = at + 120 + Math.random() * 120;
  }

  function startClear(at) {
    if (!el) return;
    state.mode = 'clearing';
    state.clearAt = at + 250;
    el.history.classList.add('is-clearing');
  }

  function finishClear(at) {
    el.history.classList.remove('is-clearing');
    el.history.replaceChildren();
    compose();
    state.mode = 'idle';
    state.idleUntil = at + 1600 + Math.random() * 800;
  }

  function startCommand(id) {
    var def = C.getCommand(id);
    if (!def) {
      state.mode = 'idle';
      state.idleUntil = now() + 1500;
      return;
    }
    if (id === 'fastfetch') {
      def = { cmd: 'fastfetch', out: [C.buildFastfetch(settings, sessionId)] };
    }
    var cur = state.current;
    cur.entry = def;
    cur.commandId = id;
    cur.typed = '';
    cur.cmdText.textContent = '';
    if (cur.caret && !cur.caret.parentNode) {
      cur.prompt.appendChild(cur.caret);
    }
    state.typoUsed = false;
    state.typoAt = 0;
    state.mode = 'typing';
    state.nextAt = now() + 80;
  }

  function tick(at) {
    if (!el || staticMode) return;

    if (state.mode === 'idle') {
      if (at < state.idleUntil) return;
      var cur = state.current;
      if (!cur) return;
      if (cur.entry) {
        state.mode = 'typing';
        state.nextAt = at;
      } else {
        startCommand(chooseNext());
      }
      return;
    }

    if (state.mode === 'typing' || state.mode === 'enter') {
      if (at >= state.nextAt) {
        if (state.mode === 'enter') {
          beginOutput(at);
        } else {
          tickTyping(at);
        }
      }
      return;
    }

    if (state.mode === 'output') {
      tickOutput(at);
      return;
    }

    if (state.mode === 'after-output') {
      if (at >= state.nextAt) {
        finishCommand(at);
      }
      return;
    }

    if (state.mode === 'clearing') {
      if (at >= state.clearAt) finishClear(at);
    }
  }

  /* --------------------------------------------------------------------- */
  /* settings                                                              */
  /* --------------------------------------------------------------------- */

  function updateSettings(next, changed) {
    var previous = settings || {};
    settings = Object.assign({}, next || settings || {});

    var namesChanged = !changed ||
      changed.indexOf('promptuser') !== -1 ||
      changed.indexOf('prompthost') !== -1;

    if (namesChanged && el) {
      var user = clean(settings.promptuser, 'dev');
      var host = clean(settings.prompthost, 'workstation');
      var title = user + '@' + host;
      var rule = '';
      for (var r = 0; r < title.length; r++) rule += '-';
      el.history.querySelectorAll('.p-user').forEach(function (node) {
        node.textContent = user;
      });
      el.history.querySelectorAll('.p-host').forEach(function (node) {
        node.textContent = host;
      });
      el.history.querySelectorAll('[data-ff-host]').forEach(function (node) {
        node.textContent = host;
      });
      el.history.querySelectorAll('[data-ff-title]').forEach(function (node) {
        node.textContent = title;
      });
      el.history.querySelectorAll('[data-ff-rule]').forEach(function (node) {
        node.textContent = rule;
      });
    }

    if (!changed || changed.indexOf('tagline') !== -1) {
      var mottoNodes = el ? el.history.querySelectorAll('[data-ff-motto]') : [];
      for (var i = 0; i < mottoNodes.length; i++) {
        mottoNodes[i].textContent = clean(settings.tagline, 'one keystroke at a time');
      }
    }

    if ((!changed || changed.indexOf('showbanner') !== -1) && previous.showbanner !== settings.showbanner) {
      compose();
    }
  }

  function setStatic(value) {
    staticMode = !!value;
  }

  function fitStatic() {
    if (!el || !staticMode) return;
    var current = state.current;
    if (!current || !current.block) return;
    var screenRect = el.screen.getBoundingClientRect();
    var currentRect = current.block.getBoundingClientRect();
    if (
      currentRect.bottom <= screenRect.bottom - 2 &&
      currentRect.top >= screenRect.top
    ) {
      return;
    }
    var guard = 0;
    // A still frame should never clip its live prompt. Drop the oldest
    // scrollback above the banner until the remaining scene fits the pane.
    while (el.history.scrollHeight > el.screen.clientHeight && guard++ < 28) {
      var first = el.history.firstElementChild;
      if (!first || first === current.block) break;
      if (first.classList.contains('cmd--banner')) break;
      if (first.classList.contains('term-spacer')) break;
      first.remove();
    }
    scrollBottom();
  }

  function restart(id) {
    if (id && !C.sessions[id]) return;
    if (id) sessionId = id;
    session = C.getSession(sessionId);
    compose();
  }

  function reflow() {
    compose();
  }

  function getState() {
    return {
      session: sessionId,
      mode: state.mode,
      blocks: el ? el.history.childElementCount : 0,
      typed: state.current ? state.current.typed : '',
      banner: !!(bannerEl && bannerEl.getBoundingClientRect().height > 0),
      static: staticMode,
      generation: generation
    };
  }

  root.PhosphorTerminal = {
    init: init,
    restart: restart,
    reflow: reflow,
    updateSettings: updateSettings,
    setStatic: setStatic,
    tick: tick,
    scrollBottom: scrollBottom,
    fitStatic: fitStatic,
    getState: getState
  };
})(window);
