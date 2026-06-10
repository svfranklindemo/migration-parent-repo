# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Halliby** project — a multi-brand site built on **Adobe Edge Delivery Services (EDS)** (formerly AEM Franklin). The same repository is the basis for several "theme" / industry-specific sites (Bodea, Frescopa, Luma, Carvelo, Citi Signal, Wehealthcare, Fly, Securbank). It is a fork of the `@adobe/aem-boilerplate` (v1.3.0) starter.

- Backed by an AEM author instance (see `fstab.yaml`) — content is pulled from `/content/halliby/...` and served via `aem.page` / `aem.live`.
- Supports multiple locales (`/en`, `/fr`, `/es`, `/de`, `/ja`, …) wired in `helix-query.yaml` and `scripts/utils.js` (`SUPPORTED_LANGUAGES`).
- Heavy analytics & personalization: Adobe Target (`scripts/at-lsig.js`), Web SDK / Alloy (`alloyServiceWorker.js`), Launch via dynamic `head.html` loader, and a custom dataLayer (`scripts/datalayer.js`).

There is no test suite, no `dev` server script, and no build step for blocks themselves — the site is built at runtime by the browser. `npm run build:json` is the only build task and it only concatenates the model JSON.

## Common Commands

```bash
npm run lint        # runs ESLint (airbnb-base + xwalk + json) on .json/.js/.mjs
npm run lint:js     # JS only
npm run lint:css    # stylelint on blocks/**/*.css and styles/*.css
npm run build:json  # merges models/_*.json into the 3 component-*.json files
```

A husky `pre-commit` hook (`.husky/pre-commit.mjs`) auto-runs `build:json` when any `_*` model partial changes and stages the regenerated outputs.

There is no `npm test`, no `npm start`, and no bundler. Local preview happens through AEM Sidekick (Chrome extension) against the configured author host.

## High-Level Architecture

### Page boot flow (`scripts/scripts.js`)

```
loadPage()
  → loadEager()    // setPageLanguage, preconnect, decorateTemplateAndTheme,
                   // renderWBDataLayer, decorateMain(main),
                   // loadSection(first section, waitForFirstImage), loadFonts()
  → loadLazy()     // load remaining sections + all blocks
  → loadDelayed()  // setTimeout 3s → import('./delayed.js')  (AT, custom events, tweetables, embedCustomLibraries)
```

`decorateMain(main)` runs in this order — keep this order in mind when adding a new decorator:
1. `decorateButtons` (custom — wraps icon+delivery URLs in `<picture>`; then calls lib version)
2. `decorateIcons`
3. `buildAutoBlocks` (currently a no-op stub)
4. `decorateSections` (from `aem.js` — sets `data-*` attrs from `.section-metadata`)
5. `decorateTitleAlignment`
6. `decorateSectionImages` (section background from `data-image` / `data-tab-image` / `data-mob-image`)
7. `decorateBlocks` (auto-discovers `div.section > div > div`)
8. `decorateDMImages` (Dynamic Media Open API `<a>` → `<picture>` with smartcrop)

### Block loader contract (`scripts/aem.js` → `loadBlock`)

Each block lives in `blocks/<name>/` and exports `default async function decorate(block)`. The loader dynamic-imports `blocks/<name>/<name>.js` and side-loads `blocks/<name>/<name>.css` in parallel. `data-block-status` is set to `loading`/`loaded`. If you add a new block folder you must also:
- Add it to `models/_component-filters.json` under the relevant parent.
- Add a `_*.json` partial in the block folder and a definitions entry in `models/_component-definition.json` (or run `npm run build:json` after editing).
- Reference it in any `helix-query.yaml` if it's used as a section divider.

A few blocks split their JS into siblings — e.g. `blocks/header/{header.js, navigation.js, constants.js}` and `blocks/form/{form.js, …}`. The default export stays in the folder-named file.

### Authoring model (split JSON)

`models/_*.json` partials are merged by `merge-json-cli` into:
- `component-models.json` (field schemas — visible in UE inspector)
- `component-definition.json` (block / section definitions — UE allowed components)
- `component-filters.json` (parent → child component allow-lists)

`models/_page.json` and `models/_section.json` are universal. Block-level models are usually defined inline in `blocks/<name>/_<name>.json` and pulled in via `"...": "./_cards.json#/models"` style references. Editing a partial triggers the husky hook to rebuild and re-stage the merged outputs.

### Section metadata → CSS hooks

`decorateSections` reads `div.section-metadata` siblings inside each `div.section` and copies key/value pairs onto the section as `data-*` attributes (camelCased). Common ones: `style`, `sec-bg-image`, `sec-color`, `sec-custom-styles`, `sec-alignment`, `sec-spacing`, `data-image`. CSS in `styles/styles.css` keys off those `data-*` attributes (e.g. `.section[data-sec-spacing="section-tiny"]`).

### Dynamic Media integration

`isDMOpenAPIUrl(src)` matches `/adobe/assets/urn:aaid:aem:<uuid>` URLs. `decorateDMImages` and `decorateDMVideos` (in `scripts/scripts.js`) rewrite `<a>` tags in `.dm-openapi` / `.dynamic-media-image` / `.dynamic-media-video` blocks into responsive `<picture>` / `<iframe>` (or `<video>`) with smartcrop-aware sources. Metadata is fetched from `<delivery-host>/<urn>/metadata` and merged with author-controlled advance-modifier params (preset, blur, rotate, extend, background-color, grayscale, etc.). Three block folders cover DM rendering: `dynamic-media-image`, `dynamic-media-video`, `dynamicmedia-image` (legacy/alias), `dynamicmedia-template`.

### Localization & routing

- `utils.js#getLanguage` parses the URL prefix against `SUPPORTED_LANGUAGES` (16 locales).
- `getSiteName()` reads `siteName` placeholder, or falls back to `/content/<site>/...` parsing when on author.
- `computeLocalizedUrl(targetLang)` builds language-prefixed URLs from placeholders.
- `paths.json` declares `/content/halliby/{language-masters, configuration, metadata, redirects, placeholders}` mappings to root and metadata JSON endpoints; the AEM author delivery host is in `fstab.yaml` (URL is environment-specific — `merge=ours` so per-developer edits don't conflict).
- `helix-query.yaml` builds per-locale `/<lang>/query-index.json` indices that the on-site search / nav rely on.

### Analytics & Launch

- `head.html` dynamically loads Launch from `placeholders.json` (`launch` key), dispatching a `launchReady` event on success. If the placeholder is missing, it warns and continues without Launch.
- `scripts/datalayer.js` initializes a project `dataLayer` from `placeholders.json`'s `data-elements` map, persists to `sessionStorage` (`project_dataLayer`/`project_dataLayer_timestamp`, 30-day TTL), and exposes `_dataLayerQueue` for safe pre-`launchReady` events.
- `scripts/custom-events.js` provides `dispatchCustomEvent(name)` which queues events to `sessionStorage` (`project_launch_event_queue`, 30-min TTL, max 100) until Launch is ready, then dispatches `document` CustomEvents. Many commerce blocks (`add-external`, `checkout`, `checkout-shipping`, `child-account-application`, `category-products-lister`, etc.) call this with an authored `eventType` prop.
- `scripts/delayed.js` (loaded 3 s after page load): triggers `initializeCustomEvents` (page-view), runs `embedCustomLibraries` from `js-files` metadata, and loads Adobe Target `at-lsig.js` with the at_property `549d426b-0bcc-be60-ce27-b9923bfcad4f` when not on localhost and not inside a Canvas (`/canvas/`) iframe.

### Authoring vs publish runtime

`isAuthorEnvironment()` (in `scripts/scripts.js`) checks `window.location.origin.includes('author')`. Used to flip behavior in `normalizeAemPath` (adds `.html`) and `getSiteName` (parses `/content/<site>`). `scripts/editor-support.js` is only loaded in UE preview and patches the DOM in response to `aue:ui-edit` / `aue:ui-patch` events so editing a block doesn't require a full reload.

## Conventions & Gotchas

- **Block name == folder name.** The loader builds the import path from `block.dataset.blockName` (first class name), so always keep CSS/JS filenames matching the block's authoring name.
- **`.js` extensions on imports** are mandatory — enforced by ESLint (`'import/extensions': ['error', { js: 'always' }]`).
- **Unix linebreaks** required (`linebreak-style: 'unix'`). On Windows, set `core.autocrlf=false` in git or your editor will trip the linter.
- **`scripts/aem.js` is the boilerplate** — prefer not to edit it unless you're fixing a real bug; the project-specific extensions live in `scripts/scripts.js` and `scripts/utils.js`.
- **`scripts/dom-helpers.js`** exports short-helper constructors for every common element (`div`, `a`, `button`, `picture`, `source`, `img`, …). Prefer these over `document.createElement` — they're tree-shakable in editors and self-documenting.
- **Sections start `display: none`** in `aem.js#decorateSections`; they only become visible after `loadSection` runs (`updateSectionsStatus`). Don't try to style a section before its data-section-status flips.
- **Section images** are implemented twice: `applySectionBackgroundImage` in `aem.js` reads `sec-bg-image`, and `decorateSectionImages` in `scripts/scripts.js` reads `data-image` / `data-tab-image` / `data-mob-image` and is idempotent (skips if `.section-bg` already exists). Use the latter for responsive overrides.
- **No build of JS** — anything you put in `scripts/` is shipped as-is to the browser. New shared helpers go in `scripts/utils.js` (and re-exported from `scripts/scripts.js` only if they're used inside a `decorate*` function).
- **Theme CSS lives in `styles/industry-specific/<theme>/<theme>-theme.css`** and is opted into via the `theme` page metadata; `decorateTemplateAndTheme()` (from `aem.js`) is what loads it. New themes: add a folder, a `*-theme.css`, and document the metadata key.

## Common Files to Touch

| Concern | File(s) |
| --- | --- |
| New block | `blocks/<name>/<name>.{js,css}` + `models/_component-definition.json` + `models/_component-filters.json` |
| New field on existing block | `blocks/<name>/_<name>.json` |
| New page/section metadata attribute | `scripts/aem.js#decorateSections` + CSS in `styles/styles.css` |
| New shared helper | `scripts/utils.js` (export) → re-export from `scripts/scripts.js` only if needed by decorators |
| New locale | `scripts/utils.js#SUPPORTED_LANGUAGES` + new entry in `helix-query.yaml` |
| New Launch event | `scripts/custom-events.js` (re-use `dispatchCustomEvent`); consume via `addEventListener` in target block |
| New dataLayer property | edit `data-elements` in `placeholders.json` (author side) — code reads from it dynamically via `scripts/datalayer.js` |
