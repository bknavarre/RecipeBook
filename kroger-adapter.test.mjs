import assert from "node:assert/strict";
import { KrogerAdapter, estimatePurchase, scoreProductMatch } from "./kroger-adapter.mjs";

const offer = {
  product: { name: "Kroger Boneless Skinless Chicken Breasts", package: { value: 1.25, unit: "lb", variableWeight: false } },
  price: { effective: 5.49 }, inventory: { status: "available" }
};
assert.deepEqual(estimatePurchase({ quantityNeeded: 2, unitNeeded: "lb" }, offer), {
  packagesNeeded: 2, purchaseQuantity: 2.5, purchaseUnit: "lb", estimatedCost: 10.98, isEstimate: false, pricingMode: "package"
});
assert(scoreProductMatch({ canonicalName: "chicken breast" }, offer).score > 0.9);
assert(scoreProductMatch({ canonicalName: "chicken breast" }, { ...offer, product: { ...offer.product, name: "Chicken Broth" } }).score < 0.7);

const variable = { product: { package: { value: 2.85, unit: "lb", variableWeight: true } }, price: { effective: 14.22 }, unitPrice: { value: 4.99, unit: "lb" } };
assert.deepEqual(estimatePurchase({ quantityNeeded: 2, unitNeeded: "lb" }, variable), {
  packagesNeeded: 1, purchaseQuantity: 2, purchaseUnit: "lb", estimatedCost: 9.98, isEstimate: true, pricingMode: "variable_weight"
});

let calls = 0;
const adapter = new KrogerAdapter({ baseUrl: "https://proxy.example", fetchImpl: async () => { calls++; return new Response(JSON.stringify({ offers: [offer] }), { status: 200, headers: { "content-type": "application/json" } }); } });
const ranked = await adapter.matchGroceryItem({ canonicalName: "chicken breast", quantityNeeded: 2, unitNeeded: "lb" }, { locationId: "03500543" });
assert.equal(ranked[0].purchase.estimatedCost, 10.98);
await adapter.searchProducts({ term: "chicken breast", locationId: "03500543" });
assert.equal(calls, 1, "identical search should be cached");
console.log("All Kroger adapter tests passed.");
