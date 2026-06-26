# Category Products Lister — Technical Documentation

## What It Does

Fetches a list of Content Fragment (CF) products from AEM via GraphQL and renders them as a grid or carousel on the page. Works in two environments:

- **Author** (AEM Universal Editor) — calls AEM GraphQL directly, shows detailed error panels on failure
- **Publish** (live site) — routes through an Adobe I/O Runtime proxy, shows "No products found." on failure

---

## Files Involved

| File | Role |
|------|------|
| `blocks/category-products-lister/category-products-lister.js` | Block logic — fetch, normalize, render |
| `blocks/category-products-lister/category-products-lister.css` | Base styles (light/default theme) |
| `blocks/category-products-lister/CHANGES.md` | Change log |
| `scripts/utils.js` | Shared helpers — endpoint config, environment detection |
| `styles/industry-specific/binji-theme/binji-theme.css` | Binji dark theme overrides (Section 5) |

---

## Data Flow

```
Author block markup (key-value table)
        │
        ▼
   decorate(block)
        │
        ├─ readBlockConfig()        → cfg (folder path, tags, style variant, etc.)
        ├─ isAuthorEnvironment()    → boolean
        │
        ▼
   fetchProducts(folderPath)
        │
        ├─ [Author]  GET {AEM hostname}{authorEndpoint}_path={folderPath}
        └─ [Publish] GET {IO Runtime proxy}?endpoint={publishKey}&_path={folderPath}
                │
                ▼
         GraphQL response JSON
                │
                ▼
         Loop DEFAULT_RESPONSE_KEYS   ← ['binjiProductModelList', 'productModelList']
         Find first matching key in json.data.*
                │
                ▼
         raw items[]
                │
                ▼
         normalizeItem(raw)           ← maps CF fields → canonical shape
                │
                ▼
         { id, sku, name, imageData, category, price, description }
                │
                ▼
         filterByCategories(items, tags)
                │
         ┌──────┴──────┐
         ▼             ▼
    renderCarousel   buildCard × N
```

---

## Key Functions

### `fetchProducts(path)` → `{ items, error }`

Fetches products from AEM or I/O Runtime. Returns a structured result — never throws.

```js
const { items, error } = await fetchProducts(folderHref);
```

**Error object shape:**

| Field | Description |
|-------|-------------|
| `type` | `NETWORK_ERROR` \| `HTTP_ERROR` \| `PARSE_ERROR` \| `KEY_MISMATCH` |
| `message` | Human-readable description |
| `url` | The URL that was called |
| `status` | HTTP status code (HTTP_ERROR only) |
| `responseShape` | Keys found in `json.data` (KEY_MISMATCH only) |

---

### `normalizeItem(raw, fieldMap?)` → canonical item

Translates raw CF fields to a fixed internal shape. All rendering code depends only on this shape — never on raw CF field names.

**Canonical shape:**

```js
{
  id:          string,
  sku:         string,
  name:        string,
  imageData:   object,   // { _authorUrl, _publishUrl, _dynamicUrl }
  category:    string[],
  price:       number | null,
  description: object,   // { html, markdown }
}
```

**How field mapping works (`DEFAULT_FIELD_MAP`):**

```js
const DEFAULT_FIELD_MAP = {
  id:          'id',
  sku:         'sku',
  name:        'name',
  image:       ['image', 'damImageURL'],  // array = try in order, first wins
  category:    'category',
  price:       'price',
  description: 'description',
};
```

If a CF model renames a field, update the map here — no rendering code changes needed.

---

### `renderAuthorError(block, error)`

**Author environment only.** Injects an inline error panel into the block with:

- Red badge showing the error type
- The error message and URL that failed
- Additional context (HTTP status / response shape keys)
- Yellow hint box with a specific fix for each error type

On **publish**, the block shows a plain `<p class="cpl-empty">No products found.</p>` instead — no technical details exposed.

---

### `buildCard(item, isAuthor, redirectUrl, enableAddToCart, addToCartEventType)`

Builds a single product card `<article>` from a normalized item. Uses `item.imageData` (not raw CF fields) for the picture element.

---

### `renderCarousel(block, items, cfg, isAuthor, redirectUrl)`

Builds a full-width carousel with prev/next buttons. Each slide uses `item.imageData` for the picture element.

---

## Error Handling

### Error types and their causes

| Type | Cause | Author hint |
|------|-------|-------------|
| `NETWORK_ERROR` | `fetch()` threw — AEM down, CORS, no network | Check AEM is running; verify CORS config |
| `HTTP_ERROR` | Response not OK (`resp.ok === false`) | Check GraphQL endpoint URL and AEM permissions |
| `PARSE_ERROR` | Response body not valid JSON | Check if AEM returned an HTML error page |
| `KEY_MISMATCH` | `json.data` exists but none of `DEFAULT_RESPONSE_KEYS` matched | Add the correct key to `DEFAULT_RESPONSE_KEYS` |

### Author vs Publish behavior

```
fetchProducts returns error
        │
        ├─ isAuthor === true  →  renderAuthorError(block, error)
        │                        (red panel with full details)
        │
        └─ isAuthor === false →  <p class="cpl-empty">No products found.</p>
                                 (safe, generic)
```

---

## Schema Resilience

### Handling a new GraphQL type name

If AEM returns a new persisted query type (e.g. `binjiProductModelV2List`), add it to the array:

```js
// category-products-lister.js
const DEFAULT_RESPONSE_KEYS = [
  'binjiProductModelList',
  'binjiProductModelV2List',   // ← add here
  'productModelList',
];
```

The block tries each key in order and uses the first match.

### Handling a renamed CF field

If the CF model renames `image` to `posterImage`:

```js
const DEFAULT_FIELD_MAP = {
  ...
  image: ['posterImage', 'image', 'damImageURL'],  // ← add new name first
  ...
};
```

No changes needed in `buildCard` or `renderCarousel`.

### Handling a new CF field (end-to-end)

1. Add to `DEFAULT_FIELD_MAP`:
   ```js
   rating: 'contentRating',
   ```
2. Add to `normalizeItem` return:
   ```js
   rating: resolveField('rating') || '',
   ```
3. Use in `buildCard` via `item.rating`.

---

## Endpoint Configuration

Endpoints are configurable via the Placeholders spreadsheet (no code deploy needed).

| Placeholder key | Default value | Used by |
|----------------|---------------|---------|
| `author-products-endpoint` | `/graphql/execute.json/dsn-eds-configuration/productsListByPath;` | Author fetch URL |
| `publish-products-endpoint-key` | `productsListByPath` | Publish proxy `?endpoint=` param |

Keys absent from the spreadsheet → defaults apply. Existing deployments are unaffected.

**Helper functions in `scripts/utils.js`:**

```js
getAuthorProductsEndpoint()      // reads placeholder, falls back to default
getPublishProductsEndpointKey()  // reads placeholder, falls back to default
```

Both apply `.trim()` before the fallback check — whitespace-only placeholder values (truthy) correctly fall back to defaults.

---

## Theming (Binji Dark Theme)

Section 5 of `binji-theme.css` scopes all CPL overrides under `body.binji-theme`.

| What changes | Why |
|-------------|-----|
| `.cpl-card` → transparent, no border/shadow | Card box removed — image sits directly on black page |
| `.cpl-card-media` → `aspect-ratio: 3/2`, `object-fit: cover` | Consistent image height; fills frame without letterboxing |
| `.cpl-card-media` → `border-radius: 6px` | Rounded corners on image (not card box) |
| `.cpl-card:hover` → `scale(1.03)` | Subtle pop instead of `translateY` |
| `.cpl-card-meta` → left-aligned | Matches screenshot — text under image, not centered |
| `.cpl-card-category` → `#a0a0a0`, weight 600 | Muted label above title |
| `.cpl-card-title` → `#fff`, weight 700 | Bold white title |
| Carousel arrows → white `border-color` | Visible on dark background |
| Carousel headings/name → `#fff` | Matches dark page |

Default theme (light) is unchanged — all rules are gated by `body.binji-theme`.

---

## Block Configuration (Author Spreadsheet / UE Block Model)

| Field | Key | Purpose |
|-------|-----|---------|
| Products Folder | `folder` | CF folder path (`/content/dam/…`) |
| Tags | `cq:tags` | Category filter chips |
| Cards Per Row | `cards-per-row` | `3` / `4` / `5` (default: 5) |
| Style Variant | `style` | `""` (grid) / `carousel` / `no-border` |
| Enable Add to Cart | `enableaddtocartattileview` | Shows Add to Cart button on each card |
| Add to Cart Event | `addtocarteventtype` | Adobe Launch event name on cart click |
| Carousel Heading | `heading` | Heading above carousel |
| Learn More Label | `learn-more-label` | Carousel CTA button text |
| No Background | `no-background` | Removes image brightness filter |
| Custom Class | `custom-class` | Extra CSS classes on the block element |
