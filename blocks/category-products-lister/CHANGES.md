# category-products-lister — Change Log

## [2026-06-25] Endpoints configurable via placeholders.json

### Why
`AUTHOR_PRODUCTS_ENDPOINT` and `PUBLISH_PRODUCTS_ENDPOINT_KEY` were hardcoded
module-level constants. Different AEM environments (stage/prod/multi-tenant) need
different persisted query paths without a code deploy.

### What changed

#### `scripts/utils.js`
- Added `DEFAULT_AUTHOR_PRODUCTS_ENDPOINT` and `DEFAULT_PUBLISH_PRODUCTS_ENDPOINT_KEY` constants
- Added `getAuthorProductsEndpoint()` — reads `authorProductsEndpoint` from placeholders, falls back to default
- Added `getPublishProductsEndpointKey()` — reads `publishProductsEndpointKey` from placeholders, falls back to default

#### `blocks/category-products-lister/category-products-lister.js`
- Removed module-level `AUTHOR_PRODUCTS_ENDPOINT` constant
- Removed module-level `PUBLISH_PRODUCTS_ENDPOINT_KEY` constant
- Added imports: `getAuthorProductsEndpoint`, `getPublishProductsEndpointKey` from `utils.js`
- `fetchProducts()`: replaced two `const` refs with `Promise.all` resolving all four async deps in parallel

### Placeholder keys (add to Placeholders spreadsheet)

| Key | Default value |
|-----|---------------|
| `author-products-endpoint` | `/graphql/execute.json/dsn-eds-configuration/productsListByPath;` |
| `publish-products-endpoint-key` | `productsListByPath` |

Keys absent from spreadsheet → defaults apply. Zero behaviour change on existing deployments.

### Rollback steps
1. In `utils.js`: remove the two `DEFAULT_*` consts and two exported functions
2. In `category-products-lister.js`:
   - Remove `getAuthorProductsEndpoint`, `getPublishProductsEndpointKey` from import
   - Restore at top of file:
     ```js
     const AUTHOR_PRODUCTS_ENDPOINT = "/graphql/execute.json/dsn-eds-configuration/productsListByPath;";
     const PUBLISH_PRODUCTS_ENDPOINT_KEY = "productsListByPath";
     ```
   - In `fetchProducts()`: replace `Promise.all` block with:
     ```js
     const authorBase = await getCategoryProductsAuthorBase();
     const environment = await getCategoryProductsPublishEnvironment();
     ```
   - Restore template literals to use `AUTHOR_PRODUCTS_ENDPOINT` / `PUBLISH_PRODUCTS_ENDPOINT_KEY`
3. Remove placeholder rows from spreadsheet (optional — ignored if functions absent)

---

## [2026-06-25] Hotfix — corrupted default constants + whitespace guard

### Root cause
During CRLF normalization (PowerShell write), the two default constant values in
`scripts/utils.js` were written incorrectly:

```js
// WRONG (what was on disk)
const DEFAULT_AUTHOR_PRODUCTS_ENDPOINT = '/graphql/execute.json/dsn-eds-configuration/productsListByPath';  // missing trailing ;
const DEFAULT_PUBLISH_PRODUCTS_ENDPOINT_KEY = '       ';  // 7 spaces instead of 'productsListByPath'
```

`ph?.publishProductsEndpointKey` was `undefined` (key not yet in spreadsheet)
→ fell back to `DEFAULT_PUBLISH_PRODUCTS_ENDPOINT_KEY = '       '` (truthy spaces)
→ IO Runtime received `endpoint=%20%20%20%20%20%20%20`
→ 500 error, "No products found."

### What changed

#### `scripts/utils.js`
- `DEFAULT_AUTHOR_PRODUCTS_ENDPOINT`: restored missing trailing `;` (AEM persisted query param separator)
- `DEFAULT_PUBLISH_PRODUCTS_ENDPOINT_KEY`: restored correct value `'productsListByPath'`
- Both helpers: added `.trim()` before `||` — whitespace-only placeholder values (truthy) now correctly fall back to default

```js
// AFTER (correct)
return ph?.authorProductsEndpoint?.trim() || DEFAULT_AUTHOR_PRODUCTS_ENDPOINT;
return ph?.publishProductsEndpointKey?.trim() || DEFAULT_PUBLISH_PRODUCTS_ENDPOINT_KEY;
```

### Why `.trim()` matters
`||` only triggers on falsy values. A string of spaces (`"       "`) is truthy —
it bypasses the fallback. `.trim()` collapses whitespace-only strings to `""` (falsy)
so the default kicks in. Defensive against bad placeholder sheet entries.

---

### Known duplicate
`product-detail.js` has identical hardcoded constants (`AUTHOR_PRODUCTS_ENDPOINT`,
`PUBLISH_PRODUCTS_ENDPOINT_KEY`, plus `AUTHOR_PRODUCT_DETAIL_ENDPOINT` /
`PUBLISH_PRODUCT_DETAIL_ENDPOINT_KEY`). Same treatment needed separately.

---

## [2026-06-25] Fix — data not rendered despite successful API call

### Root cause (2 bugs)

**Bug 1 — GraphQL response key mismatch (primary cause: "No products found")**
`fetchProducts()` read `json.data.productModelList.items` but Binji's persisted
query (`productListByPathBodea`) returns `json.data.binjiProductModelList.items`.
Result was always `undefined` → always fell back to `[]` → "No products found."

**Bug 2 — Image field mismatch (cards rendered but no images)**
`buildCard()` and `renderCarousel()` destructured `damImageURL` from each item.
Binji CF model returns `image` (and `poster`) — not `damImageURL`. So `damImageURL`
was always `{}` → image check failed → `<picture>` never created.

### What changed (`category-products-lister.js`)

- `fetchProducts()` line 174: try `binjiProductModelList` first, fall back to `productModelList`
  ```js
  return json?.data?.binjiProductModelList?.items ?? json?.data?.productModelList?.items ?? [];
  ```
- `buildCard()`: destructure both `damImageURL` and `image`; resolve to `imgData`
  ```js
  const { id, sku, name, damImageURL, image, ... } = item || {};
  const imgData = damImageURL || image || {};
  ```
- All `damImageURL` refs in `buildCard` → `imgData`
- `renderCarousel()`: same pattern (`image: itemImage` alias to avoid name clash)

### Backwards compatible
`damImageURL` takes priority if present. `image` is the fallback.
Existing CFs that use `damImageURL` field are unaffected.