/*
 * rail.js — clock, btop-flavoured vitals, git rhythm.
 *
 * Values are synthetic but plausible. Charts advance at 2 Hz and the clock at
 * 1 Hz, driven by app.js's loop. Nothing here schedules its own frames.
 */
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

  var SESSION = {
    mixed: {
      cpu: 41, freq: 3.87, mem: 12.7, memMax: 30.6, dsk: 62,
      netDown: 1.2, netUp: 0.048, load: '0.45 0.38 0.31', ahead: 2,
      gpu: 12, gpuTemp: 48, io: 18.4, fan: 1120, power: 62,
      iface: 'wlan0 192.168.1.24', seed: 17, commits: 126, streak: '7d'
    },
    web: {
      cpu: 27, freq: 3.62, mem: 18.2, memMax: 30.6, dsk: 71,
      netDown: 0.884, netUp: 0.022, load: '0.71 0.63 0.52', ahead: 1,
      gpu: 7, gpuTemp: 44, io: 8.2, fan: 980, power: 48,
      iface: 'wlan0 192.168.1.24', seed: 29, commits: 118, streak: '4d'
    },
    systems: {
      cpu: 54, freq: 4.21, mem: 9.8, memMax: 30.6, dsk: 44,
      netDown: 0.212, netUp: 0.009, load: '1.24 1.08 0.94', ahead: 4,
      gpu: 24, gpuTemp: 61, io: 42.6, fan: 1420, power: 96,
      iface: 'enp7s0 10.0.0.42', seed: 7, commits: 203, streak: '11d'
    },
    data: {
      cpu: 63, freq: 4.05, mem: 22.4, memMax: 30.6, dsk: 83,
      netDown: 0.038, netUp: 0.116, load: '2.14 1.92 1.71', ahead: 3,
      gpu: 38, gpuTemp: 66, io: 128.0, fan: 1680, power: 118,
      iface: 'enp7s0 10.0.0.42', seed: 41, commits: 87, streak: '2d'
    },
    ops: {
      cpu: 18, freq: 2.94, mem: 13.9, memMax: 30.6, dsk: 57,
      netDown: 2.8, netUp: 1.1, load: '0.22 0.19 0.17', ahead: 2,
      gpu: 4, gpuTemp: 39, io: 3.6, fan: 840, power: 38,
      iface: 'wg0 10.8.0.2', seed: 5, commits: 168, streak: '9d'
    }
  };

  var PROCS = {
    mixed: [
      ['firefox', '7.2%', '1.4G'], ['kitty', '2.1%', '312M'],
      ['Hyprland', '1.4%', '480M'], ['waybar', '0.6%', '84M'],
      ['pipewire', '0.4%', '46M'], ['Xwayland', '0.3%', '112M'],
      ['systemd', '0.1%', '24M']
    ],
    web: [
      ['node', '6.8%', '1.1G'], ['firefox', '5.4%', '1.3G'],
      ['kitty', '2.0%', '298M'], ['esbuild', '1.1%', '94M'],
      ['waybar', '0.6%', '84M'], ['Xwayland', '0.3%', '112M'],
      ['systemd', '0.1%', '24M']
    ],
    systems: [
      ['cargo', '12.4%', '2.1G'], ['rustc', '9.8%', '1.7G'],
      ['kitty', '2.0%', '298M'], ['firefox', '4.1%', '1.2G'],
      ['waybar', '0.6%', '84M'], ['Xwayland', '0.3%', '112M'],
      ['systemd', '0.1%', '24M']
    ],
    data: [
      ['python', '48.2%', '8.6G'], ['python', '6.1%', '1.2G'],
      ['firefox', '4.7%', '1.4G'], ['kitty', '2.2%', '320M'],
      ['waybar', '0.6%', '84M'], ['Xwayland', '0.4%', '118M'],
      ['systemd', '0.1%', '24M']
    ],
    ops: [
      ['dockerd', '3.2%', '412M'], ['containerd', '1.8%', '168M'],
      ['firefox', '4.4%', '1.3G'], ['kitty', '1.9%', '284M'],
      ['waybar', '0.5%', '78M'], ['Xwayland', '0.3%', '108M'],
      ['systemd', '0.1%', '24M']
    ]
  };

  var COMMITS = [
    ['4a2c1de', 'auth: rotate refresh tokens', '12m'],
    ['9f31b02', 'api: debounce search queries', '48m'],
    ['c0ffee1', 'ui: focus trap in command palette', '2h']
  ];

  var el = {};
  var settings = null;
  var sessionId = 'mixed';
  var variant = SESSION.mixed;
  var staticMode = false;
  var lastClockAt = 0;
  var lastChartAt = 0;
  var chartCells = 56;
  var series = { cpu: [], mem: [], net: [], gpu: [], io: [] };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clamp(n, min, max) {
    return n < min ? min : n > max ? max : n;
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isoWeek(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - start) / 86400000) + 1) / 7);
  }

  function zoneLabel(date) {
    var offset = -date.getTimezoneOffset();
    var sign = offset >= 0 ? '+' : '-';
    var abs = Math.abs(offset);
    return 'UTC' + sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60);
  }

  function hostName() {
    var value = String(settings && settings.prompthost ? settings.prompthost : 'workstation')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return value || 'workstation';
  }

  function netLabel(value) {
    if (value >= 1) return value.toFixed(1).replace(/\.0$/, '') + 'M';
    var k = Math.round(value * 1000);
    if (k >= 1000) return (value).toFixed(1).replace(/\.0$/, '') + 'M';
    return k + 'K';
  }

  function buildVitals() {
    var procs = PROCS[sessionId] || PROCS.mixed;
    var procRows = '';
    for (var i = 0; i < procs.length; i++) {
      procRows +=
        '<div class="proc-row">' +
          '<span class="proc-name">' + procs[i][0] + '</span>' +
          '<span class="proc-cpu">' + procs[i][1] + '</span>' +
          '<span class="proc-mem">' + procs[i][2] + '</span>' +
        '</div>';
    }

    el.vitals.innerHTML =
      '<div class="block-head">' +
        '<span class="block-head__label">System</span>' +
        '<span class="block-head__meta">' + esc(hostName()) + ' · 6.12.9</span>' +
      '</div>' +
      '<div class="vitals__body">' +
        '<div class="vitals__metrics">' +
          '<div class="metric">' +
            '<div class="metric__head"><span class="metric__label">CPU</span>' +
              '<span class="metric__value"><span id="vCpuPct">' + variant.cpu + '%</span>' +
              '<span class="sep">·</span><span class="unit" id="vCpuFreq">' + variant.freq.toFixed(2) + 'GHz</span></span>' +
            '</div>' +
            '<div class="spark" id="sparkCpu" aria-hidden="true"></div>' +
          '</div>' +
          '<div class="metric">' +
            '<div class="metric__head"><span class="metric__label">Mem</span>' +
              '<span class="metric__value"><span id="vMemUsed">' + variant.mem.toFixed(1) + 'G</span>' +
              '<span class="unit"> / </span><span class="unit" id="vMemMax">' + variant.memMax.toFixed(1) + 'G</span></span>' +
            '</div>' +
            '<div class="spark" id="sparkMem" aria-hidden="true"></div>' +
          '</div>' +
          '<div class="metric">' +
            '<div class="metric__head"><span class="metric__label">Dsk</span>' +
              '<span class="metric__value"><span id="vDskPct">' + variant.dsk + '%</span>' +
              '<span class="sep">·</span><span class="unit">nvme0n1</span></span>' +
            '</div>' +
            '<div class="spark spark--bar" id="sparkDsk" aria-hidden="true"></div>' +
          '</div>' +
          '<div class="metric">' +
            '<div class="metric__head"><span class="metric__label">Net</span>' +
              '<span class="metric__value"><span class="arrow">↓</span><span class="down" id="vNetDown">' + netLabel(variant.netDown) + '</span>' +
              '<span class="sep"> </span><span class="arrow">↑</span><span class="up" id="vNetUp">' + netLabel(variant.netUp) + '</span></span>' +
            '</div>' +
            '<div class="spark" id="sparkNet" aria-hidden="true"></div>' +
          '</div>' +
          '<div class="metric metric--extra">' +
            '<div class="metric__head"><span class="metric__label">GPU</span>' +
              '<span class="metric__value"><span id="vGpuPct">' + variant.gpu + '%</span>' +
              '<span class="sep">·</span><span class="unit" id="vGpuTemp">' + variant.gpuTemp + '°C</span></span>' +
            '</div>' +
            '<div class="spark" id="sparkGpu" aria-hidden="true"></div>' +
          '</div>' +
          '<div class="metric metric--extra">' +
            '<div class="metric__head"><span class="metric__label">I/O</span>' +
              '<span class="metric__value"><span id="vIo">' + variant.io.toFixed(1) + 'M/s</span>' +
              '<span class="sep">·</span><span class="unit">nvme0n1</span></span>' +
            '</div>' +
            '<div class="spark" id="sparkIo" aria-hidden="true"></div>' +
          '</div>' +
          '<div class="gauge-row">' +
            '<span class="gauge-label">load average</span>' +
            '<span class="gauge-value" id="vLoad">' + variant.load + '</span>' +
          '</div>' +
          '<div class="gauge-row gauge-row--extra">' +
            '<span class="gauge-label">thermal</span>' +
            '<span class="gauge-value" id="vThermal">' + variant.gpuTemp + '°C · ' + (variant.fan / 1000).toFixed(1) + 'k · ' + variant.power + 'W</span>' +
          '</div>' +
          '<div class="gauge-row gauge-row--extra">' +
            '<span class="gauge-label">iface</span>' +
            '<span class="gauge-value" id="vIface">' + esc(variant.iface) + ' · link up</span>' +
          '</div>' +
        '</div>' +
        '<div class="vitals__proc">' +
          '<div class="proc-head"><span>Process</span><span class="proc-cols">cpu&nbsp;&nbsp;&nbsp;mem</span></div>' +
          procRows +
        '</div>' +
      '</div>';

    el.sparkCpu = $('sparkCpu');
    el.sparkMem = $('sparkMem');
    el.sparkDsk = $('sparkDsk');
    el.sparkNet = $('sparkNet');
    el.sparkGpu = $('sparkGpu');
    el.sparkIo = $('sparkIo');
    el.vCpuPct = $('vCpuPct');
    el.vCpuFreq = $('vCpuFreq');
    el.vMemUsed = $('vMemUsed');
    el.vMemMax = $('vMemMax');
    el.vDskPct = $('vDskPct');
    el.vNetDown = $('vNetDown');
    el.vNetUp = $('vNetUp');
    el.vGpuPct = $('vGpuPct');
    el.vGpuTemp = $('vGpuTemp');
    el.vIo = $('vIo');
    el.vLoad = $('vLoad');
  }

  function buildGit() {
    var rows = '';
    for (var i = 0; i < COMMITS.length; i++) {
      rows +=
        '<div class="commit">' +
          '<span class="commit__hash">' + COMMITS[i][0] + '</span>' +
          '<span class="commit__msg">' + COMMITS[i][1] + '</span>' +
          '<span class="commit__when">' + COMMITS[i][2] + '</span>' +
        '</div>';
    }

    el.git.innerHTML =
      '<div class="block-head">' +
        '<span class="block-head__label">Git</span>' +
        '<span class="git__branch">' +
          '<span class="branch-name">main</span>' +
          '<span class="ahead">↑' + variant.ahead + '</span>' +
          '<span class="behind">↓0</span>' +
        '</span>' +
      '</div>' +
      '<div class="commit-list">' + rows + '</div>' +
      '<div class="contrib">' +
        '<div class="contrib__head">' +
          '<span>' + variant.commits + ' commits · 12 months</span>' +
          '<span class="streak"><span class="accent">' + variant.streak + '</span> streak</span>' +
        '</div>' +
        '<div class="contrib__grid" id="contribGrid" aria-hidden="true"></div>' +
      '</div>';

    el.contribGrid = $('contribGrid');
    buildContrib();
  }

  function buildContrib() {
    if (!el.contribGrid) return;
    var rng = mulberry32(variant.seed * 977 + 19);
    var html = '';
    for (var week = 0; week < 53; week++) {
      for (var day = 0; day < 7; day++) {
        var r = rng();
        var recent = week > 45;
        var level = 0;
        if (r > (recent ? 0.42 : 0.62)) level = 1;
        if (r > (recent ? 0.68 : 0.82)) level = 2;
        if (r > (recent ? 0.87 : 0.93)) level = 3;
        if (r > (recent ? 0.96 : 0.98)) level = 4;
        html += '<i data-l="' + level + '"></i>';
      }
    }
    el.contribGrid.innerHTML = html;
  }

  function measureSpark() {
    if (!el.sparkCpu) return;
    var style = getComputedStyle(el.sparkCpu);
    var size = parseFloat(style.fontSize) || 12;
    var charWidth = size * 0.6;
    var probeEl = document.createElement('span');
    probeEl.textContent = '██████████';
    probeEl.style.cssText =
      'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font:inherit;letter-spacing:0;';
    el.sparkCpu.appendChild(probeEl);
    var rect = probeEl.getBoundingClientRect();
    if (rect.width > 0) charWidth = rect.width / 10;
    if (probeEl.parentNode) probeEl.parentNode.removeChild(probeEl);
    var width = el.sparkCpu.clientWidth || 420;
    chartCells = Math.max(30, Math.min(96, Math.floor(width / charWidth)));
  }

  function seedSeries() {
    var rng = mulberry32(variant.seed * 31 + 7);
    var baseCpu = 1.2 + (variant.cpu / 100) * 6.2;
    var baseMem = 1.4 + (variant.mem / variant.memMax) * 6.4;
    var baseNet = 3.2;
    var baseGpu = 1.2 + (variant.gpu / 100) * 6.2;
    var baseIo = clamp(1.4 + Math.log(variant.io + 1) * 0.95, 1.4, 5.1);
    series.cpu = [];
    series.mem = [];
    series.net = [];
    series.gpu = [];
    series.io = [];
    for (var i = 0; i < 110; i++) {
      var wave = Math.sin(i * 0.43) * 1.35 + Math.cos(i * 0.17) * 0.8;
      series.cpu.push(clamp(baseCpu + wave + (rng() - 0.5) * 1.9, 1.2, 7.9));
      series.mem.push(clamp(baseMem + Math.sin(i * 0.12) * 0.52 + (rng() - 0.5) * 0.4, 1.3, 7.6));
      series.net.push(clamp(baseNet + Math.sin(i * 0.61) * 2.0 + (rng() - 0.5) * 2.4, 1.1, 7.9));
      series.gpu.push(clamp(baseGpu + Math.sin(i * 0.37 + 1.4) * 1.25 + (rng() - 0.5) * 1.6, 1.1, 7.7));
      series.io.push(clamp(baseIo + Math.sin(i * 0.51 + 0.7) * 1.35 + (rng() - 0.5) * 1.7, 1.1, 7.4));
    }
  }

  function sparkMarkup(values) {
    var start = Math.max(0, values.length - chartCells);
    var html = '';
    for (var i = start; i < values.length; i++) {
      var level = clamp(Math.round(values[i]), 1, 8);
      var cls = level >= 7 ? 'hi' : level >= 5 ? 'mid' : '';
      html += '<span class="' + cls + '">' + BLOCKS[level - 1] + '</span>';
    }
    return html;
  }

  function barMarkup(percent) {
    var filled = Math.round((percent / 100) * chartCells);
    filled = clamp(filled, 1, chartCells - 1);
    var html = '';
    for (var i = 0; i < chartCells; i++) {
      if (i < filled) {
        html += '<span class="hi' + (i < filled * 0.55 ? '2' : '') + '">' + '█' + '</span>';
      } else {
        html += '<span class="low">' + '░' + '</span>';
      }
    }
    return html;
  }

  function renderSparks() {
    if (!el.sparkCpu) return;
    el.sparkCpu.innerHTML = sparkMarkup(series.cpu);
    el.sparkMem.innerHTML = sparkMarkup(series.mem);
    el.sparkNet.innerHTML = sparkMarkup(series.net);
    el.sparkGpu.innerHTML = sparkMarkup(series.gpu);
    el.sparkIo.innerHTML = sparkMarkup(series.io);
    el.sparkDsk.innerHTML = barMarkup(variant.dsk);
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function updateValues(now, forceBase) {
    if (!el.vCpuPct) return;
    var t = now / 1000;
    if (forceBase) {
      setText(el.vCpuPct, variant.cpu + '%');
      setText(el.vCpuFreq, variant.freq.toFixed(2) + 'GHz');
      setText(el.vMemUsed, variant.mem.toFixed(1) + 'G');
      setText(el.vMemMax, variant.memMax.toFixed(1) + 'G');
      setText(el.vDskPct, variant.dsk + '%');
      setText(el.vNetDown, netLabel(variant.netDown));
      setText(el.vNetUp, netLabel(variant.netUp));
      setText(el.vGpuPct, variant.gpu + '%');
      setText(el.vGpuTemp, variant.gpuTemp + '°C');
      setText(el.vIo, variant.io.toFixed(1) + 'M/s');
      setText(el.vLoad, variant.load);
      setText($('clockLoad'), variant.load);
      return;
    }

    var cpu = clamp(
      variant.cpu + Math.sin(t * 0.19) * 3.4 + (Math.random() - 0.5) * 1.1,
      8, 92
    );
    var freq = variant.freq + Math.sin(t * 0.53) * 0.05 + (Math.random() - 0.5) * 0.02;
    var mem = clamp(variant.mem + Math.sin(t * 0.11) * 0.18 + (Math.random() - 0.5) * 0.08, 1, variant.memMax - 0.5);
    var down = variant.netDown * (0.82 + Math.random() * 0.36);
    var up = variant.netUp * (0.78 + Math.random() * 0.44);
    var gpu = clamp(variant.gpu + Math.sin(t * 0.15 + 1.2) * 2.2 + (Math.random() - 0.5) * 1.2, 0, 96);
    var gpuTemp = variant.gpuTemp + Math.sin(t * 0.07) * 0.6 + (Math.random() - 0.5) * 0.4;
    var io = variant.io * (0.78 + Math.random() * 0.44);

    setText(el.vCpuPct, Math.round(cpu) + '%');
    setText(el.vCpuFreq, freq.toFixed(2) + 'GHz');
    setText(el.vMemUsed, mem.toFixed(1) + 'G');
    setText(el.vNetDown, netLabel(down));
    setText(el.vNetUp, netLabel(up));
    setText(el.vGpuPct, Math.round(gpu) + '%');
    setText(el.vGpuTemp, Math.round(gpuTemp) + '°C');
    setText(el.vIo, io.toFixed(1) + 'M/s');
    setText($('clockLoad'), variant.load);
  }

  function advanceSeries() {
    var rng = Math.random;
    var baseCpu = 1.2 + (variant.cpu / 100) * 6.2;
    var baseMem = 1.4 + (variant.mem / variant.memMax) * 6.4;
    var baseNet = 3.2;
    var baseGpu = 1.2 + (variant.gpu / 100) * 6.2;
    var baseIo = clamp(1.4 + Math.log(variant.io + 1) * 0.95, 1.4, 5.1);
    series.cpu.push(clamp(baseCpu + (rng() - 0.5) * 2.4 + Math.sin(series.cpu.length * 0.23) * 0.5, 1.1, 7.9));
    series.cpu.shift();
    series.mem.push(clamp(baseMem + (rng() - 0.5) * 0.4 + Math.sin(series.mem.length * 0.08) * 0.3, 1.2, 7.7));
    series.mem.shift();
    series.net.push(clamp(baseNet + (rng() - 0.5) * 4.4 + Math.sin(series.net.length * 0.37) * 0.8, 1.0, 7.9));
    series.net.shift();
    series.gpu.push(clamp(baseGpu + (rng() - 0.5) * 2.2 + Math.sin(series.gpu.length * 0.29) * 0.6, 1.0, 7.9));
    series.gpu.shift();
    series.io.push(clamp(baseIo + (rng() - 0.5) * 2.6 + Math.sin(series.io.length * 0.33) * 0.7, 1.0, 7.6));
    series.io.shift();
  }

  function formatClock(date) {
    var h = date.getHours();
    var m = date.getMinutes();
    var s = date.getSeconds();
    var twelve = settings && settings.clockformat === '12h';
    var hour = twelve ? (h % 12 || 12) : h;
    var ampm = h < 12 ? 'AM' : 'PM';
    return {
      time: (twelve ? String(hour) : pad2(hour)) + ':' + pad2(m),
      shortTime: (twelve ? String(hour) + ':' + pad2(m) + ' ' + ampm : pad2(h) + ':' + pad2(m)),
      sec: ':' + pad2(s),
      ampm: ampm,
      twelve: twelve,
      date: DAYS[date.getDay()] + ' ' + pad2(date.getDate()) + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear(),
      shortDate: DAYS[date.getDay()] + ' ' + pad2(date.getDate()) + ' ' + MONTHS[date.getMonth()],
      week: 'W' + isoWeek(date),
      zone: zoneLabel(date)
    };
  }

  function updateClock(date) {
    var c = formatClock(date || new Date());
    setText(el.clockTime, c.time);
    setText(el.clockSec, c.sec);
    setText(el.clockDate, c.date);
    setText(el.clockZone, c.zone);
    setText(el.clockWeek, c.week);
    setText(el.statusTime, c.shortTime);
    setText(el.statusDate, c.shortDate);
    if (el.clockAmPm) {
      if (c.twelve) {
        el.clockAmPm.hidden = false;
        el.clockAmPm.textContent = c.ampm;
      } else {
        el.clockAmPm.hidden = true;
      }
    }
    setText($('clockLoad'), variant.load);
  }

  function updateStatusIdentity() {
    var host = hostName();
    setText(el.statusCenter, sessionId + ' @ ' + host);
    var meta = el.vitals ? el.vitals.querySelector('.block-head__meta') : null;
    if (meta) meta.textContent = host + ' · 6.12.9';
    el.statusBranch.innerHTML = 'main <span class="up">↑' + variant.ahead + '</span>';
  }

  /* --------------------------------------------------------------------- */

  function init(initialSettings) {
    settings = Object.assign({}, initialSettings || {});
    sessionId = settings.session || 'mixed';
    variant = SESSION[sessionId] || SESSION.mixed;

    el.clockBlock = $('clockBlock');
    el.clockTime = $('clockTime');
    el.clockSec = $('clockSec');
    el.clockAmPm = $('clockAmPm');
    el.clockDate = $('clockDate');
    el.clockZone = $('clockZone');
    el.clockWeek = $('clockWeek');
    el.clockUptime = $('clockUptime');
    el.statusCenter = $('statusCenter');
    el.statusBranch = $('statusBranch');
    el.statusDate = $('statusDate');
    el.statusTime = $('statusTime');
    el.vitals = $('vitals');
    el.git = $('gitBlock');

    buildVitals();
    buildGit();
    updateStatusIdentity();
    measureSpark();
    seedSeries();
    renderSparks();
    updateValues(now(), true);
    updateClock(new Date());

    el.clockUptime.textContent = 'up 3d 7h';
  }

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function setSession(id) {
    sessionId = SESSION[id] ? id : 'mixed';
    variant = SESSION[sessionId];
    buildVitals();
    buildGit();
    updateStatusIdentity();
    measureSpark();
    seedSeries();
    renderSparks();
    updateValues(now(), staticMode);
    updateClock(new Date());
  }

  function updateSettings(next) {
    settings = Object.assign({}, next || settings);
    if (!el.vitals) return;
    updateStatusIdentity();
    updateClock(new Date());
    measureSpark();
    renderSparks();
  }

  function resize() {
    if (!el.sparkCpu) return;
    measureSpark();
    renderSparks();
  }

  function tick(at) {
    if (staticMode || !el.clockTime) return;
    if (at - lastClockAt >= 1000) {
      lastClockAt = at;
      updateClock(new Date());
    }
    if (at - lastChartAt >= 500) {
      lastChartAt = at;
      advanceSeries();
      renderSparks();
      updateValues(at, false);
    }
  }

  function renderStatic() {
    staticMode = true;
    if (!el.clockTime) return;
    measureSpark();
    seedSeries();
    renderSparks();
    updateValues(now(), true);
    updateClock(new Date());
  }

  function setStatic(value) {
    staticMode = !!value;
  }

  function getState() {
    return {
      session: sessionId,
      cpu: el.vCpuPct ? el.vCpuPct.textContent : null,
      mem: el.vMemUsed ? el.vMemUsed.textContent : null,
      cells: chartCells,
      static: staticMode
    };
  }

  root.PhosphorRail = {
    init: init,
    setSession: setSession,
    updateSettings: updateSettings,
    resize: resize,
    tick: tick,
    renderStatic: renderStatic,
    setStatic: setStatic,
    getState: getState
  };
})(window);
