# Recipeak Kroger Adapter

This package contains:

- `kroger-worker.js`: Cloudflare Worker that securely owns the Kroger client secret, resolves nearby stores, searches local products, and normalizes Kroger data into Recipeak `StoreOffer` objects.
- `kroger-adapter.js`: browser module for Recipeak. It searches, caches, ranks products, and calculates packages/cost for the grocery quantity needed.
- `wrangler.toml`: Worker config.
- `kroger-adapter.test.mjs`: local unit tests.

## 1. Register the Kroger app

Create an app in the Kroger Developer Portal and copy its client ID and client secret. Public product/location access uses OAuth client credentials with the `product.compact` scope.

## 2. Deploy the Worker

Install Wrangler, authenticate, and add the secrets:

```bash
npm install -g wrangler
wrangler login
wrangler secret put KROGER_CLIENT_ID
wrangler secret put KROGER_CLIENT_SECRET
```

Edit `ALLOWED_ORIGIN` in `wrangler.toml` to the origin of Recipeak, such as:

```toml
ALLOWED_ORIGIN = "https://bknavarre.github.io"
```

Then deploy:

```bash
wrangler deploy
```

Do not place the client secret in `index.html`, Firebase, or GitHub.

## 3. Smoke-test the Worker

Find nearby stores for Melissa ZIP 75454:

```text
https://YOUR-WORKER.workers.dev/kroger/stores?zip=75454&radiusMiles=15&limit=10
```

Copy the desired `externalLocationId`, then search localized products:

```text
https://YOUR-WORKER.workers.dev/kroger/products?term=chicken%20breast&locationId=LOCATION_ID&limit=12
```

The product response includes effective price, regular/promo prices, aisle display, stock state, package size, image, and fulfillment modes.

## 4. Add it to Recipeak

Upload `kroger-adapter.js` next to `index.html`, then add this before the main Recipeak script:

```html
<script type="module">
  import { KrogerAdapter } from "./kroger-adapter.js";
  window.krogerAdapter = new KrogerAdapter({
    baseUrl: "https://YOUR-WORKER.workers.dev"
  });
</script>
```

Use it after the user picks a Kroger store:

```js
const stores = await window.krogerAdapter.findStores({ zip: "75454", radiusMiles: 15 });

const candidates = await window.krogerAdapter.matchGroceryItem(
  {
    canonicalName: "chicken breast",
    displayName: "Chicken breast",
    quantityNeeded: 2,
    unitNeeded: "lb"
  },
  { locationId: stores[0].externalLocationId }
);

const best = candidates[0];
// best.product.name
// best.price.effective
// best.location.display
// best.purchase.packagesNeeded
// best.purchase.estimatedCost
```

## Required Recipeak preference fields

Save these per user:

```json
{
  "kroger": {
    "storeId": "kroger:03500543",
    "locationId": "03500543",
    "storeName": "Kroger ...",
    "zip": "75454"
  }
}
```

Never save the Kroger client secret in a user profile.

## Important limitations

- A `locationId` is required for meaningful local price and aisle results.
- Promo price is a straightforward Kroger promo. Clip-required coupons and complex multi-buy offers may not be represented.
- Some products omit aisle, inventory, price, images, or package size. The normalized model uses `null` rather than inventing values.
- Variable-weight meat/produce cost is an estimate. The final charged weight may differ.
