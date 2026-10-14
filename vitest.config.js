// vitest.config.js — test harness configuration.
//
// The runtime game is buildless: it is opened directly via index.html and loads
// `src/**` as native ES modules. Vitest/fast-check/jsdom here are TEST-ONLY dev
// dependencies and are never imported by runtime game code in `src/**`.
//
// Environment strategy:
// - Pure simulation-core tests (physics, pipes, scoring, collision, clouds,
//   highscore, config, display) run under the default `node` environment, where
//   the DOM-free `src/**` ES modules import cleanly.
// - Adapter/render tests (input, audio, storage, assets, render) need a browser
//   environment, so any test file matching `*.render.test.js` /
//   `*.dom.test.js`, or living under a `render`/`adapters`/`dom` folder, runs in
//   jsdom. Per-file override is also available via a leading
//   `// @vitest-environment jsdom` docblock comment.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default to Node so pure ES modules under src/** import without a DOM.
    environment: 'node',

    // Opt specific files into jsdom for adapter/render tests.
    environmentMatchGlobs: [
      ['**/*.{render,dom}.test.js', 'jsdom'],
      ['**/{render,adapters,dom}/**/*.test.js', 'jsdom'],
    ],

    // Discover tests co-located with sources and in a tests/ folder.
    include: ['src/**/*.test.js', 'tests/**/*.test.js'],

    // The harness must exit cleanly before any test files exist (task 1.1).
    passWithNoTests: true,

    globals: false,
  },
});
