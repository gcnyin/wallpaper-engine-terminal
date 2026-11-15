/*
 * properties.js — single source of truth for the wallpaper's user properties.
 *
 * This file is used in two places:
 *   1. In the browser (as a classic script) it exposes `window.WE_PROJECT_PROPERTIES`
 *      so `js/we-api.js` can normalize incoming Wallpaper Engine values.
 *   2. In Node (`node tools/gen-project-json.mjs`) it is required to generate
 *      `project.json`, so the Wallpaper Engine property UI can never drift from
 *      the runtime defaults.
 *
 * After editing: run `npm run gen` (or `node tools/gen-project-json.mjs`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WE_PROJECT_PROPERTIES = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    project: {
      title: 'Phosphor Terminal',
      description:
        'A live Linux terminal on a phosphor CRT. zsh, tmux, fastfetch, builds, logs and git ' +
        'all type themselves while a quiet system rail keeps time. Twelve terminal palettes — ' +
        'green phosphor, warm ambers, muted darks and a paper-light mode — with adjustable glow ' +
        'and scanlines and four sessions to watch.',
      file: 'index.html',
      preview: 'preview.jpg',
      contentrating: 'Everyone'
    },

    // Enables window.wallpaperRegisterAudioListener for the bass-reactive glow.
    supportsAudioProcessing: true,

    properties: [
      {
        key: 'theme',
        type: 'combo',
        text: 'Color theme',
        order: 1,
        value: 'phosphor',
        options: [
          { value: 'phosphor', label: 'Phosphor (green CRT)' },
          { value: 'amber', label: 'Amber CRT (warm)' },
          { value: 'gruvbox', label: 'Gruvbox (warm)' },
          { value: 'everforest', label: 'Everforest (warm)' },
          { value: 'kanagawa', label: 'Kanagawa (warm ink)' },
          { value: 'rosepine', label: 'Rosé Pine (warm dusk)' },
          { value: 'catppuccin', label: 'Catppuccin Mocha' },
          { value: 'tokyo', label: 'Tokyo Night' },
          { value: 'dracula', label: 'Dracula' },
          { value: 'nord', label: 'Nord' },
          { value: 'paper', label: 'Paper (warm light)' },
          { value: 'mono', label: 'Monochrome' }
        ]
      },
      {
        key: 'schemecolor',
        type: 'color',
        text: 'Accent color (Wallpaper Engine UI)',
        order: 2,
        value: '0.20 1 0.53'
      },
      {
        key: 'session',
        type: 'combo',
        text: 'Session',
        order: 3,
        value: 'mixed',
        options: [
          { value: 'mixed', label: 'Mixed (everything)' },
          { value: 'web', label: 'Frontend / dev server' },
          { value: 'systems', label: 'Rust / systems' },
          { value: 'data', label: 'Python / data' },
          { value: 'ops', label: 'Containers / git' }
        ]
      },
      {
        key: 'fontscale',
        type: 'slider',
        text: 'UI scale (%)',
        order: 4,
        value: 100,
        min: 70,
        max: 140
      },
      {
        key: 'typingspeed',
        type: 'slider',
        text: 'Typing speed',
        order: 5,
        value: 5,
        min: 1,
        max: 10
      },
      {
        key: 'showclock',
        type: 'bool',
        text: 'Show clock',
        order: 6,
        value: true
      },
      {
        key: 'clockformat',
        type: 'combo',
        text: 'Clock format',
        order: 7,
        value: '24h',
        condition: 'showclock.value == true',
        options: [
          { value: '24h', label: '24-hour' },
          { value: '12h', label: '12-hour' }
        ]
      },
      {
        key: 'showsidebar',
        type: 'bool',
        text: 'Show system panel',
        order: 8,
        value: true
      },
      {
        key: 'showbanner',
        type: 'bool',
        text: 'Show banner and tagline',
        order: 9,
        value: true
      },
      {
        key: 'promptuser',
        type: 'textinput',
        text: 'Prompt user',
        order: 10,
        value: 'dev'
      },
      {
        key: 'prompthost',
        type: 'textinput',
        text: 'Prompt host',
        order: 11,
        value: 'workstation'
      },
      {
        key: 'tagline',
        type: 'textinput',
        text: 'Tagline',
        order: 12,
        value: 'one keystroke at a time'
      },
      {
        key: 'scanlines',
        type: 'slider',
        text: 'CRT scanlines and grain',
        order: 13,
        value: 35,
        min: 0,
        max: 100
      },
      {
        key: 'glow',
        type: 'slider',
        text: 'Phosphor glow',
        order: 14,
        value: 60,
        min: 0,
        max: 100
      },
      {
        key: 'parallax',
        type: 'bool',
        text: 'Mouse parallax',
        order: 15,
        value: false
      },
      {
        key: 'audioglow',
        type: 'bool',
        text: 'Bass-reactive glow (needs audio processing)',
        order: 16,
        value: true
      }
    ]
  };
});
