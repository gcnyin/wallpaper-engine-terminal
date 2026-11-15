/*
 * content.js — the script the terminal is "playing".
 *
 * Every command is a small, hand-written slice of a plausible Linux session:
 * output columns, ANSI colour, exit codes, durations. Nothing is fetched.
 * Sessions are curated; the live loop shuffles the rest of each pool.
 */
(function (root) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clean(value, fallback) {
    var text = String(value == null ? '' : value)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text || fallback;
  }

  var SESSION_MEMORY = {
    mixed: 12.7,
    web: 18.2,
    systems: 9.8,
    data: 22.4,
    ops: 13.9
  };

  /* Arch ASCII logo — 19 lines, exact leading spaces. Keep this shape. */
  var ARCH_LOGO = [
    "                  -`",
    "                 .o+`",
    "                `ooo/",
    "               `+oooo:",
    "              `+oooooo:",
    "              -+oooooo+:",
    "            `/:-:++oooo+:",
    "           `/++++/+++++++:",
    "          `/++++++++++++++:",
    "         `/+++ooooooooooooo/`",
    "        ./ooosssso++osssssso+`",
    "       .oossssso-````/ossssss+`",
    "      -osssssso.      :ssssssso.",
    "     :osssssss/        osssso+++.",
    "    /ossssssss/        +ssssooo/-",
    "  `/ossssso+/:-        -:/+osssso+-",
    " `+sso+:-`                 `.-/+oso:",
    "`++:.                           `-+/",
    ".`                                 `/"
  ];

  function ffRow(label, value, extra) {
    return (
      '<div class="ff-row' + (extra ? ' ' + extra : '') + '">' +
      '<span class="ff-key">' + label + '</span> ' +
      '<span class="ff-val">' + value + '</span></div>'
    );
  }

  function buildFastfetch(settings, sessionId) {
    var user = clean(settings.promptuser, 'dev');
    var host = clean(settings.prompthost, 'workstation');
    var motto = clean(settings.tagline, 'one keystroke at a time');
    var memory = SESSION_MEMORY[sessionId] || SESSION_MEMORY.mixed;
    var pct = Math.round((memory / 30.6) * 100);
    var title = user + '@' + host;
    var rule = '';

    for (var i = 0; i < title.length; i++) rule += '-';

    return (
      '<div class="ff">' +
        '<div class="ff-art" aria-hidden="true">' + ARCH_LOGO.join('\n') + '</div>' +
        '<div class="ff-side">' +
          '<div class="ff-title" data-ff-title>' + esc(title) + '</div>' +
          '<div class="ff-rule" data-ff-rule>' + rule + '</div>' +
          ffRow('OS:', 'Arch Linux x86_64') +
          ffRow('Host:', '<span data-ff-host>' + esc(host) + '</span>') +
          ffRow('Kernel:', '6.12.9-arch1-1') +
          ffRow('Uptime:', '3 days, 7 hours') +
          ffRow('Packages:', '1284 (pacman)') +
          ffRow('Shell:', 'zsh 5.9') +
          ffRow('Display:', '2560x1440 @ 1x, 165 Hz') +
          ffRow('WM:', 'Hyprland 0.45.2 (Wayland)') +
          ffRow('Font:', 'JetBrainsMono Nerd Font (11.5pt) [GTK2/3/4]') +
          ffRow('Terminal:', 'kitty 0.39.1') +
          ffRow('CPU:', 'AMD Ryzen 7 7840U (16) @ 3.30 GHz') +
          ffRow('GPU:', 'AMD Radeon 780M (RADV PHOENIX)') +
          ffRow('Memory:', memory.toFixed(1) + ' GiB / 30.6 GiB (' + pct + '%)') +
          ffRow('Swap:', '0 B / 8.00 GiB (0%)') +
          ffRow('Disk (/):', '128.4 GiB / 931.5 GiB (14%) - ext4') +
          ffRow('Motto:', '<span data-ff-motto>' + esc(motto) + '</span>', 'ff-row--motto') +
        '</div>' +
      '</div>'
    );
  }

  /* --------------------------------------------------------------------- */
  /* shared commands                                                       */
  /* --------------------------------------------------------------------- */

  var COMMANDS = {
    lsLong: {
      cmd: 'ls -la --color',
      out: [
        '<span class="muted">total 84</span>',
        'drwxr-xr-x  dev dev  4.0K Nov 15 22:47 <span class="a4">.</span>',
        'drwxr-xr-x  dev dev  4.0K Nov 16 18:12 <span class="a4">..</span>',
        'drwxr-xr-x  dev dev  4.0K Nov 15 23:03 <span class="a4">.git</span>',
        '-rw-r--r--  dev dev   286 Nov 11 09:40 <span class="muted">.gitignore</span>',
        'drwxr-xr-x  dev dev  4.0K Nov 15 22:51 <span class="a4">css</span>',
        '-rw-r--r--  dev dev  2.2K Nov 15 23:01 index.html',
        '-rw-r--r--  dev dev  9.1K Nov 15 22:59 package.json',
        'drwxr-xr-x  dev dev  4.0K Nov 15 23:02 <span class="a4">src</span>',
        'drwxr-xr-x  dev dev  4.0K Nov 16 20:17 <span class="a4">themes</span>',
        '-rw-r--r--  dev dev  1.1K Nov 14 16:22 <span class="a3">vite.config.ts</span>'
      ]
    },

    gitStatus: {
      cmd: 'git status -sb',
      out: [
        '<span class="a2">## main...origin/main</span>',
        '<span class="a3"> M</span> <span class="dim">src/hooks/useSparkline.ts</span>',
        '<span class="a3"> M</span> <span class="dim">src/ui/Terminal.tsx</span>',
        '<span class="a1">??</span> <span class="dim">src/ui/clock.tsx</span>'
      ]
    },

    gitLog: {
      cmd: 'git log --graph --oneline -5',
      out: [
        '<span class="a5">*</span> <span class="a3">4a2c1de</span> <span class="muted">(HEAD -&gt; main, origin/main)</span> <span class="dim">auth: rotate refresh tokens</span>',
        '<span class="a5">*</span> <span class="a3">9f31b02</span> <span class="dim">api: debounce search queries</span>',
        '<span class="a5">*</span> <span class="a3">c0ffee1</span> <span class="dim">ui: restore focus after modal close</span>',
        '<span class="a5">*</span> <span class="a3">2b7e4a9</span> <span class="dim">perf: memoize table rows</span>',
        '<span class="a5">*</span> <span class="a3">81d0f3c</span> <span class="dim">fix: timezone drift in CSV export</span>'
      ]
    },

    tsc: {
      cmd: 'tsc --noEmit',
      out: []
    },

    viteBuild: {
      cmd: 'vite build',
      out: [
        '<span class="muted">vite v6.0.7 building for production...</span>',
        '<span class="muted">✓ 1284 modules transformed.</span>',
        '<span class="dim">dist/index.html                   0.62 kB │ gzip:  0.36 kB</span>',
        '<span class="dim">dist/assets/index-DOx1h.css      14.82 kB │ gzip:  4.10 kB</span>',
        '<span class="dim">dist/assets/index-C8k2m.js      184.35 kB │ gzip: 59.21 kB</span>',
        '<span class="ok">✓ built in 1.42s</span>'
      ]
    },

    rgHooks: {
      cmd: 'rg "useEffect" src/',
      out: [
        '<span class="a4">src/ui/Terminal.tsx</span><span class="muted">:</span><span class="a2">18</span><span class="muted">:</span><span class="dim">  </span><span class="hit">useEffect</span><span class="dim">(() =&gt; {</span>',
        '<span class="a4">src/ui/Terminal.tsx</span><span class="muted">:</span><span class="a2">44</span><span class="muted">:</span><span class="dim">  }, [session]);</span>',
        '<span class="a4">src/hooks/useSparkline.ts</span><span class="muted">:</span><span class="a2">9</span><span class="muted">:</span><span class="dim">  </span><span class="hit">useEffect</span><span class="dim">(() =&gt; {</span>',
        '<span class="a4">src/hooks/useSparkline.ts</span><span class="muted">:</span><span class="a2">23</span><span class="muted">:</span><span class="dim">  }, [values]);</span>',
        '<span class="a4">src/main.tsx</span><span class="muted">:</span><span class="a2">31</span><span class="muted">:</span><span class="dim">  </span><span class="hit">useEffect</span><span class="dim">(() =&gt; {</span>'
      ]
    },

    batPrompt: {
      cmd: 'bat src/ui/prompt.tsx',
      out: [
        '<span class="muted">───────┬────────────────────────────────────────────</span>',
        '<span class="muted">       │</span> <span class="a4">File: src/ui/prompt.tsx</span>',
        '<span class="muted">───────┼────────────────────────────────────────────</span>',
        '<span class="muted">   1   │</span> <span class="a5">import</span> { <span class="a6">useEffect</span>, <span class="a6">useState</span> } <span class="a5">from</span> <span class="a2">\'react\'</span>',
        '<span class="muted">   2   │</span>',
        '<span class="muted">   3   │</span> <span class="a5">export function</span> <span class="a3">usePrompt</span>(<span class="a12">session</span>: <span class="a6">string</span>) {',
        '<span class="muted">   4   │</span>   <span class="a5">const</span> [ready, setReady] = <span class="a6">useState</span>(<span class="a11">false</span>)',
        '<span class="muted">   5   │</span>   <span class="a6">useEffect</span>(() =&gt; setReady(<span class="a11">true</span>), [session])',
        '<span class="muted">   6   │</span>   <span class="a5">return</span> { ready, session }',
        '<span class="muted">   7   │</span> }',
        '<span class="muted">───────┴────────────────────────────────────────────</span>'
      ]
    },

    devServer: {
      cmd: 'npm run dev',
      out: [
        '<span class="muted">  VITE v6.0.7  ready in 184 ms</span>',
        '',
        '<span class="dim">  ➜  Local:   </span><span class="a4">http://localhost:5173/</span>',
        '<span class="dim">  ➜  Network: </span><span class="muted">use --host to expose</span>',
        '<span class="dim">  ➜  press </span><span class="a3">h</span><span class="dim"> + enter to show help</span>'
      ]
    },

    cargoBuild: {
      cmd: 'cargo build --release',
      out: [
        '<span class="a2">   Compiling</span> <span class="dim">proc-macro2 v1.0.92</span>',
        '<span class="a2">   Compiling</span> <span class="dim">unicode-ident v1.0.14</span>',
        '<span class="a2">   Compiling</span> <span class="dim">libc v0.2.169</span>',
        '<span class="a2">   Compiling</span> <span class="dim">phosphor-core v0.1.0</span>',
        '<span class="a2">    Finished</span> <span class="dim">`release` profile [optimized] target(s) in 6.80s</span>'
      ]
    },

    cargoTest: {
      cmd: 'cargo test',
      out: [
        '<span class="a2">   Compiling</span> <span class="dim">phosphor-core v0.1.0</span>',
        '<span class="a2">    Finished</span> <span class="dim">`test` profile [unoptimized + debuginfo] target(s) in 1.12s</span>',
        '<span class="muted">     Running unittests src/lib.rs (target/debug/deps/phosphor_core-7e93a1)</span>',
        '<span class="ok">test result: ok. 84 passed; 0 failed; finished in 0.09s</span>'
      ]
    },

    cargoClippy: {
      cmd: 'cargo clippy --all-targets -- -D warnings',
      out: [
        '<span class="a2">    Checking</span> <span class="dim">phosphor-core v0.1.0</span>',
        '<span class="a2">    Finished</span> <span class="dim">`dev` profile [unoptimized + debuginfo] target(s) in 2.41s</span>'
      ]
    },

    perfStat: {
      cmd: "perf stat -e cycles,instructions,branches ./target/release/phosphor",
      out: [
        '<span class="muted"> Performance counter stats for \'./target/release/phosphor\':</span>',
        '',
        '<span class="dim">     4,281,934,112      cycles</span>',
        '<span class="dim">     9,762,118,004      instructions</span> <span class="muted">   # 2.28 insn per cycle</span>',
        '<span class="dim">       881,402,731      branches</span>',
        '',
        '<span class="dim">       1.284 seconds time elapsed</span>'
      ]
    },

    uname: {
      cmd: 'uname -a',
      out: [
        '<span class="dim">Linux workstation 6.12.9-arch1-1 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux</span>'
      ]
    },

    uvInstall: {
      cmd: 'uv pip install -r requirements.txt',
      out: [
        '<span class="muted">Resolved 42 packages in 312ms</span>',
        '<span class="muted">Prepared 12 packages in 1.24s</span>',
        '<span class="muted">Installed 12 packages in 184ms</span>',
        '<span class="a2"> +</span> <span class="dim">polars==1.17.1</span>',
        '<span class="a2"> +</span> <span class="dim">pyarrow==18.1.0</span>',
        '<span class="a2"> +</span> <span class="dim">scikit-learn==1.6.0</span>',
        '<span class="a2"> +</span> <span class="dim">tqdm==4.67.1</span>'
      ]
    },

    pytestPass: {
      cmd: 'pytest -q',
      out: [
        '<span class="a8">....................................</span> <span class="muted">[ 34%]</span>',
        '<span class="a8">....................................</span> <span class="muted">[ 68%]</span>',
        '<span class="a8">...................</span>             <span class="muted">[100%]</span>',
        '<span class="ok">213 passed</span><span class="muted">, 1 warning in 4.21s</span>'
      ]
    },

    pytestFail: {
      cmd: 'pytest -q',
      out: [
        '<span class="a8">....................................</span> <span class="muted">[ 34%]</span>',
        '<span class="a8">....................................</span> <span class="muted">[ 68%]</span>',
        '<span class="a8">....................</span><span class="err">F</span><span class="a8">...............</span> <span class="muted">[100%]</span>',
        '<span class="err">FAILED</span> <span class="dim">tests/test_retry.py::test_retry_backoff</span>',
        '<span class="muted">ModuleNotFoundError: No module named \'tenacity\'</span>',
        '<span class="err">1 failed</span><span class="muted">, 212 passed in 4.28s</span>'
      ]
    },

    uvAdd: {
      cmd: 'uv add tenacity',
      out: [
        '<span class="muted">Resolved 43 packages in 248ms</span>',
        '<span class="muted">Installed 1 package in 46ms</span>',
        '<span class="a2"> +</span> <span class="dim">tenacity==9.0.0</span>'
      ]
    },

    train: {
      cmd: 'python train.py --config configs/base.yaml',
      out: [
        '<span class="muted">epoch 1/3:  52%</span><span class="muted">|</span><span class="bar-fill">███████</span><span class="bar-track">░░░░░░░</span><span class="muted">|</span> <span class="dim">312/600</span> <span class="muted">[00:26&lt;00:24, 11.8it/s]</span>',
        '<span class="muted">epoch 2/3:  78%</span><span class="muted">|</span><span class="bar-fill">██████████</span><span class="bar-track">░░░░</span><span class="muted">|</span> <span class="dim">468/600</span> <span class="muted">[00:38&lt;00:11, 12.1it/s]</span>',
        '<span class="muted">epoch 3/3: 100%</span><span class="muted">|</span><span class="bar-fill">██████████████</span><span class="muted">|</span> <span class="dim">600/600</span> <span class="muted">[00:49&lt;00:00, 12.3it/s]</span>',
        '<span class="muted">val      100%</span><span class="muted">|</span><span class="bar-fill">██████████████</span><span class="muted">|</span> <span class="dim"> 96/96 </span> <span class="muted">[00:02&lt;00:00, 41.2it/s]</span>',
        '<span class="dim">checkpoint saved </span><span class="a2">→</span> <span class="dim">runs/48f2/best.pt</span>'
      ]
    },

    jqConfig: {
      cmd: 'jq .model configs/base.json',
      out: [
        '<span class="dim">{</span>',
        '  <span class="a4">"hidden"</span><span class="dim">:</span> <span class="a3">768</span><span class="dim">,</span>',
        '  <span class="a4">"layers"</span><span class="dim">:</span> <span class="a3">12</span><span class="dim">,</span>',
        '  <span class="a4">"params"</span><span class="dim">:</span> <span class="a3">84213760</span><span class="dim">,</span>',
        '  <span class="a4">"precision"</span><span class="dim">:</span> <span class="a2">"bf16"</span>',
        '<span class="dim">}</span>'
      ]
    },

    duSizes: {
      cmd: 'du -sh data/*',
      out: [
        '<span class="a3">1.8G</span>\t<span class="a4">data/train.parquet</span>',
        '<span class="a3">412M</span>\t<span class="a4">data/val.parquet</span>',
        '<span class="a3"> 96M</span>\t<span class="a4">data/test.parquet</span>',
        '<span class="a3"> 14M</span>\t<span class="a4">data/tokenizer.json</span>'
      ]
    },

    composeUp: {
      cmd: 'docker compose up -d',
      out: [
        '<span class="muted">[+] Running 4/4</span>',
        '<span class="ok"> ✔</span> <span class="dim">Network phosphor_default     Created      0.1s</span>',
        '<span class="ok"> ✔</span> <span class="dim">Container phosphor-db-1      Started      1.2s</span>',
        '<span class="ok"> ✔</span> <span class="dim">Container phosphor-cache-1   Started      0.9s</span>',
        '<span class="ok"> ✔</span> <span class="dim">Container phosphor-api-1     Started      1.5s</span>'
      ]
    },

    dockerPs: {
      cmd: 'docker ps',
      out: [
        '<span class="muted">NAMES                STATUS          PORTS</span>',
        '<span class="bright">phosphor-api-1</span>       <span class="a2">Up 2 minutes</span>    <span class="dim">0.0.0.0:8080-&gt;8080/tcp</span>',
        '<span class="bright">phosphor-db-1</span>        <span class="a2">Up 2 minutes</span>    <span class="dim">5432/tcp</span>',
        '<span class="bright">phosphor-cache-1</span>     <span class="a2">Up 2 minutes</span>    <span class="dim">6379/tcp</span>'
      ]
    },

    journalctl: {
      cmd: 'journalctl -u phosphor-api -f',
      out: [
        '<span class="muted">23:41:02</span> <span class="dim">api[4821]: </span><span class="a6">INFO</span><span class="dim">  server listening on :8080</span>',
        '<span class="muted">23:42:18</span> <span class="dim">api[4821]: </span><span class="a6">INFO</span><span class="dim">  GET /health </span><span class="a2">200</span><span class="dim"> 2ms</span>',
        '<span class="muted">23:43:09</span> <span class="dim">api[4821]: </span><span class="a3">WARN</span><span class="dim">  queue depth 128, draining</span>',
        '<span class="muted">23:43:52</span> <span class="dim">api[4821]: </span><span class="a6">INFO</span><span class="dim">  GET /v1/spark </span><span class="a2">200</span><span class="dim"> 4ms</span>',
        '<span class="a3">^C</span>'
      ]
    },

    sshProd: {
      cmd: 'ssh prod',
      out: [
        '<span class="muted">Last login: Sun Nov 15 23:38:44 2026 from 10.0.0.4</span>',
        '<span class="a2">dev@prod</span><span class="muted">:~$</span> <span class="dim">exit</span>',
        '<span class="muted">Connection to prod closed.</span>'
      ]
    },

    rsync: {
      cmd: 'rsync -avP dist/ prod:/srv/phosphor/',
      out: [
        '<span class="muted">sending incremental file list</span>',
        '<span class="dim">index.html                       2.61K</span> <span class="a2">100%</span> <span class="muted">  1.84MB/s    0:00:00</span>',
        '<span class="dim">assets/index-C8k2m.js          184.35K</span> <span class="a2">100%</span> <span class="muted"> 38.21MB/s    0:00:04</span>',
        '<span class="dim">assets/index-DOx1h.css          14.82K</span> <span class="a2">100%</span> <span class="muted">  9.16MB/s    0:00:00</span>',
        '<span class="dim">sent 202.11K bytes  received 84 bytes  40.44K bytes/sec</span>',
        '<span class="dim">total size is 201.78K  speedup is 1.00</span>'
      ]
    },

    pacman: {
      cmd: 'sudo pacman -Syu',
      out: [
        '<span class="a6">::</span> <span class="dim">Synchronising package databases...</span>',
        '<span class="dim"> core is up to date</span>',
        '<span class="dim"> extra is up to date</span>',
        '<span class="a6">::</span> <span class="dim">Starting full system upgrade...</span>',
        '<span class="dim">Packages (3) linux-6.12.10.arch1-1  mesa-24.3.2-1  zsh-5.9-2</span>',
        '<span class="dim">Total Installed Size:  128.42 MiB</span>',
        '<span class="a6">::</span> <span class="dim">Proceed with installation? [Y/n] </span><span class="bright">y</span>',
        '<span class="ok">(3/3) upgrading linux  mesa  zsh</span>'
      ]
    },

    systemctl: {
      cmd: 'systemctl status phosphor-api',
      out: [
        '<span class="a2">●</span> <span class="bright">phosphor-api.service</span> <span class="dim">- Phosphor API</span>',
        '<span class="muted">     Loaded:</span> <span class="dim">loaded (/etc/systemd/system/phosphor-api.service; enabled)</span>',
        '<span class="muted">     Active:</span> <span class="a2">active (running)</span> <span class="dim">since Sun 2026-11-15 23:41:02 CST</span>',
        '<span class="muted">   Main PID:</span> <span class="dim">4821 (phosphor-api)</span>',
        '<span class="muted">     Memory:</span> <span class="dim">86.4M</span>',
        '<span class="muted">      Tasks:</span> <span class="dim">9 (limit: 32768)</span>'
      ]
    },

    fastfetch: {
      cmd: 'fastfetch',
      out: []
    },

    gitCommit: {
      cmd: 'git commit -am "fix: retry backoff"',
      out: [
        '<span class="a2">[main 7f2a1c4]</span> <span class="dim">fix: retry backoff</span>',
        '<span class="dim"> 1 file changed, 12 insertions(+), 4 deletions(-)</span>'
      ]
    },

    clear: {
      cmd: 'clear',
      out: [],
      clear: true
    }
  };

  /* --------------------------------------------------------------------- */
  /* sessions                                                              */
  /* --------------------------------------------------------------------- */

  var SESSIONS = {
    web: {
      label: 'web',
      pre: ['gitStatus', 'viteBuild'],
      post: ['rgHooks', 'batPrompt'],
      postExtra: ['gitLog', 'tsc', 'lsLong', 'devServer'],
      preExtra: ['lsLong', 'gitLog', 'tsc', 'gitStatus'],
      partial: 'devServer',
      prefix: 'npm run d',
      pool: ['gitStatus', 'viteBuild', 'rgHooks', 'batPrompt', 'devServer', 'gitLog', 'tsc', 'lsLong']
    },
    systems: {
      label: 'systems',
      pre: ['cargoBuild', 'cargoTest'],
      post: ['cargoClippy', 'perfStat'],
      postExtra: ['gitLog', 'fastfetch', 'gitStatus', 'uname'],
      preExtra: ['fastfetch', 'gitLog', 'gitStatus', 'uname'],
      partial: 'uname',
      prefix: 'uname -',
      pool: ['cargoBuild', 'cargoTest', 'cargoClippy', 'perfStat', 'uname', 'gitStatus', 'gitLog', 'fastfetch']
    },
    data: {
      label: 'data',
      pre: ['uvInstall', 'pytestPass'],
      post: ['train', 'jqConfig'],
      postExtra: ['gitLog', 'gitStatus', 'duSizes'],
      preExtra: ['gitLog', 'gitStatus', 'duSizes', 'uvInstall'],
      partial: 'duSizes',
      prefix: 'du -sh da',
      pool: ['uvInstall', 'pytestPass', 'train', 'jqConfig', 'duSizes', 'gitStatus', 'gitLog']
    },
    ops: {
      label: 'ops',
      pre: ['gitLog', 'composeUp'],
      post: ['dockerPs', 'journalctl'],
      postExtra: ['fastfetch', 'gitStatus', 'sshProd', 'systemctl'],
      preExtra: ['sshProd', 'rsync', 'pacman', 'gitStatus', 'systemctl'],
      partial: 'systemctl',
      prefix: 'systemctl st',
      pool: ['gitLog', 'composeUp', 'dockerPs', 'journalctl', 'sshProd', 'rsync', 'pacman', 'systemctl', 'fastfetch']
    },
    mixed: {
      label: 'mixed',
      pre: ['gitStatus', 'viteBuild', 'pytestFail', 'uvAdd'],
      post: ['pytestPass'],
      postExtra: ['gitLog', 'tsc', 'rgHooks', 'lsLong', 'gitStatus'],
      preExtra: ['tsc', 'rgHooks', 'lsLong', 'gitLog'],
      partial: 'gitCommit',
      prefix: 'git commit -am "fix: ret',
      pool: ['gitStatus', 'viteBuild', 'pytestFail', 'uvAdd', 'pytestPass', 'gitCommit', 'gitLog', 'tsc', 'rgHooks']
    }
  };

  function getSession(id) {
    return SESSIONS[id] || SESSIONS.mixed;
  }

  function getCommand(id) {
    return COMMANDS[id] || null;
  }

  function findSessionForCommand(id) {
    for (var name in SESSIONS) {
      if (!Object.prototype.hasOwnProperty.call(SESSIONS, name)) continue;
      var pool = SESSIONS[name].pool;
      if (pool.indexOf(id) !== -1) return name;
    }
    return 'mixed';
  }

  root.PhosphorContent = {
    escape: esc,
    clean: clean,
    buildFastfetch: buildFastfetch,
    getSession: getSession,
    getCommand: getCommand,
    findSessionForCommand: findSessionForCommand,
    sessions: SESSIONS,
    commands: COMMANDS
  };
})(window);
