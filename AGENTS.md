# AGENTS.md

## Scope

These instructions apply to the whole repository.

## Project Snapshot

- Adobe Edge Delivery Services reference/demo codebase for DSN Public migrations.
- Main implementation areas:
  - `blocks/`: block-level JS/CSS and optional XWalk metadata.
  - `scripts/`: shared page bootstrapping, utilities, DOM helpers, and authoring support.
  - `styles/`: global styles plus theme-specific overrides under `styles/industry-specific/`.
  - `models/`: source JSON fragments merged into top-level component metadata files.
- Start with [README.md](README.md) for the product-level overview.

## Commands Agents Should Prefer

- `npm run lint`: run JS and CSS linting.
- `npm run lint:js`: lint JS and JSON.
- `npm run lint:css`: lint block and global CSS.
- `npm run build:json`: rebuild component metadata after changes under `models/_component-*.json`.

There is no `npm test` or local app server script in `package.json`. Treat linting and targeted file validation as the default checks.

## Repo-Specific Working Rules

- When editing block behavior, work in the owning block directory first: `blocks/<name>/<name>.js` and `blocks/<name>/<name>.css`.
- Preserve the EDS block contract: blocks export `decorate(block)` or `async decorate(block)` as the entry point.
- If a DOM rewrite replaces authored markup, preserve authoring metadata with `moveInstrumentation(...)` from `scripts/scripts.js`.
- Prefer existing helpers from `scripts/aem.js`, `scripts/dom-helpers.js`, and `scripts/utils.js` over adding new low-level utilities.
- Keep CSS scoped to the block class. Global CSS changes in `styles/styles.css` can easily bleed into many blocks.
- If you edit `models/_component-models.json`, `models/_component-definition.json`, or `models/_component-filters.json`, rebuild the generated top-level JSON files before finishing.

## Patterns Worth Reusing

- Simple block example: [blocks/accordion/accordion.js](blocks/accordion/accordion.js).
- Shared page and authoring helpers: [scripts/scripts.js](scripts/scripts.js).
- Language, path, and environment helpers: [scripts/utils.js](scripts/utils.js).
- Theme/page metadata source: [models/_component-models.json](models/_component-models.json).

## Pitfalls In This Codebase

- Theme selection from page metadata takes priority over content-fragment theme settings.
- Multilingual routing is sensitive to EDS paths versus AEM `/content/...` paths; reuse existing helpers before changing URL logic.
- `styles/industry-specific/` contains theme overrides, but loading a theme is controlled by page metadata and page bootstrapping, not by CSS file presence alone.
- Author/preview/live behavior can differ. Check environment-sensitive code in `scripts/utils.js` and `scripts/scripts.js` before normalizing AEM paths.
- Generated files at the repo root (`component-models.json`, `component-definition.json`, `component-filters.json`) should stay in sync with their `models/_...` sources.

## Change Validation

- For block/script changes: run `npm run lint:js`.
- For CSS changes: run `npm run lint:css`.
- For metadata model changes: run `npm run build:json`, then lint if JS/CSS also changed.
- Prefer the narrowest validation that covers the touched files.

## Documentation Links

- Project overview: [README.md](README.md)
- External reference demo docs: <https://adobe.com/go/refdemo>
- EDS block patterns used throughout this repo: <https://www.hlx.live/developer/block-collection/>