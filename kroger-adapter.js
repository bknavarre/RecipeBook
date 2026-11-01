/**
 * Recipeak Kroger Adapter (browser-safe)
 * Calls your server-side Kroger proxy. Never put the Kroger client secret in index.html.
 */
export class KrogerAdapter {
  constructor({ baseUrl, fetchImpl = fetch, cacheTtlMs = 15 * 60 * 1000 }) {
    if (!baseUrl) throw new Error("KrogerAdapter requires baseUrl");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
    this.cacheTtlMs = cacheTtlMs;
    this.cache = new Map();
  }

  async findStores({ zip, radiusMiles = 10, limit = 10 }) {
    if (!/^\d{5}$/.test(String(zip || ""))) throw new Error("Enter a 5-digit ZIP code");
    const q = new URLSearchParams({ zip: String(zip), radiusMiles: String(radiusMiles), limit: String(limit) });
    const data = await this.#get(`/kroger/stores?${q}`);
    return data.stores;
  }

  async searchProducts({ term, locationId, limit = 12, brand, fulfillment }) {
    if (!String(term || "").trim()) throw new Error("Product search term is required");
    if (!locationId) throw new Error("Kroger locationId is required for local prices and aisles");
    const q = new URLSearchParams({ term: term.trim(), locationId, limit: String(limit) });
    if (brand) q.set("brand", brand);
    if (fulfillment) q.set("fulfillment", fulfillment);
    const data = await this.#get(`/kroger/products?${q}`);
    return data.offers;
  }

  async getProduct({ productId, locationId }) {
    if (!productId || !locationId) throw new Error("productId and locationId are required");
    const q = new URLSearchParams({ locationId });
    const data = await this.#get(`/kroger/products/${encodeURIComponent(productId)}?${q}`);
    return data.offer;
  }

  /**
   * Returns ranked StoreOffer objects for one normalized grocery need.
   * groceryItem: { canonicalName, quantityNeeded, unitNeeded }
   */
  async matchGroceryItem(groceryItem, { locationId, limit = 12 } = {}) {
    const offers = await this.searchProducts({ term: groceryItem.canonicalName, locationId, limit });
    return offers
      .map(offer => ({ ...offer, match: scoreProductMatch(groceryItem, offer), purchase: estimatePurchase(groceryItem, offer) }))
      .filter(x => x.match.score >= 0.35)
      .sort((a, b) => b.match.score - a.match.score || nullLast(a.purchase.estimatedCost) - nullLast(b.purchase.estimatedCost));
  }

  async #get(path) {
    const key = path;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.cacheTtlMs) return hit.data;
    const res = await this.fetch(this.baseUrl + path, { headers: { Accept: "application/json" } });
    const body = await safeJson(res);
    if (!res.ok) throw new Error(body?.error || `Kroger proxy returned ${res.status}`);
    this.cache.set(key, { at: Date.now(), data: body });
    return body;
  }
}

const BAD_MATCH_WORDS = ["seasoning", "broth", "stock", "soup", "sauce", "chips", "bouillon", "nuggets", "breaded", "treat", "dressing", "mix", "powder", "jerky", "dip"];
const STOP_WORDS = new Set(["fresh", "chopped", "diced", "minced", "large", "small", "medium", "cooked", "sliced", "the", "and", "for", "of"]);

export function scoreProductMatch(groceryItem, offer) {
  const need = String(groceryItem.canonicalName || groceryItem.displayName || "").toLowerCase();
  const name = String(offer.product?.name || "").toLowerCase();
  const tokens = need.split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));
  const matched = tokens.filter(t => name.includes(t.replace(/s$/, ""))).length;
  let score = tokens.length ? matched / tokens.length : 0;
  const penalties = [];
  for (const word of BAD_MATCH_WORDS) {
    if (name.includes(word) && !need.includes(word)) { score -= 0.35; penalties.push(word); }
  }
  if (offer.inventory?.status === "out_of_stock") score -= 0.25;
  if (offer.price?.effective == null) score -= 0.15;
  if (/^kroger\b|^simple truth\b/i.test(offer.product?.name || "")) score += 0.03;
  return { score: Math.max(0, Math.min(1, Number(score.toFixed(3)))), matchedTokens: matched, totalTokens: tokens.length, penalties };
}

export function estimatePurchase(groceryItem, offer) {
  const needed = Number(groceryItem.quantityNeeded);
  const needUnit = normalizeUnit(groceryItem.unitNeeded);
  const packageValue = Number(offer.product?.package?.value);
  const packageUnit = normalizeUnit(offer.product?.package?.unit);
  const price = Number(offer.price?.effective);
  if (!(needed > 0) || !(price >= 0)) return { packagesNeeded: null, estimatedCost: null, reason: "missing_quantity_or_price" };

  if (offer.product?.package?.variableWeight && offer.unitPrice?.value != null && compatibleUnits(needUnit, offer.unitPrice.unit)) {
    const convertedNeed = convert(needed, needUnit, normalizeUnit(offer.unitPrice.unit));
    return {
      packagesNeeded: 1,
      purchaseQuantity: convertedNeed,
      purchaseUnit: normalizeUnit(offer.unitPrice.unit),
      estimatedCost: roundMoney(convertedNeed * Number(offer.unitPrice.value)),
      isEstimate: true,
      pricingMode: "variable_weight"
    };
  }

  if (packageValue > 0 && compatibleUnits(needUnit, packageUnit)) {
    const needInPackageUnits = convert(needed, needUnit, packageUnit);
    const packagesNeeded = Math.max(1, Math.ceil(needInPackageUnits / packageValue));
    return {
      packagesNeeded,
      purchaseQuantity: Number((packagesNeeded * packageValue).toFixed(3)),
      purchaseUnit: packageUnit,
      estimatedCost: roundMoney(packagesNeeded * price),
      isEstimate: false,
      pricingMode: "package"
    };
  }

  return { packagesNeeded: 1, purchaseQuantity: null, purchaseUnit: packageUnit || null, estimatedCost: roundMoney(price), isEstimate: false, pricingMode: "one_package_assumed" };
}

function normalizeUnit(unit) {
  const u = String(unit || "").trim().toLowerCase();
  return ({ lbs: "lb", pound: "lb", pounds: "lb", ounces: "oz", ounce: "oz", grams: "g", gram: "g", kilograms: "kg", kilogram: "kg", count: "ct", each: "ct" })[u] || u;
}
function compatibleUnits(a, b) { return a === b || (["lb", "oz", "g", "kg"].includes(a) && ["lb", "oz", "g", "kg"].includes(b)); }
function convert(value, from, to) {
  if (from === to) return value;
  const grams = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
  if (grams[from] && grams[to]) return value * grams[from] / grams[to];
  return value;
}
function roundMoney(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function nullLast(n) { return n == null ? Number.POSITIVE_INFINITY : n; }
async function safeJson(res) { try { return await res.json(); } catch { return null; } }
