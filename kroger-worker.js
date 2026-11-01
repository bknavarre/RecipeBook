/**
 * Recipeak Kroger proxy for Cloudflare Workers.
 * Secrets: KROGER_CLIENT_ID, KROGER_CLIENT_SECRET
 * Optional variables: ALLOWED_ORIGIN, DEFAULT_KROGER_LOCATION_ID
 */
const KROGER_BASE = "https://api.kroger.com/v1";
let tokenCache = { token: null, expiresAt: 0 };

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Accept",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, cors);

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "");
      const token = await getToken(env);

      if (path.endsWith("/kroger/stores")) {
        const zip = requireParam(url, "zip");
        const radiusMiles = clampInt(url.searchParams.get("radiusMiles"), 1, 100, 10);
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 10);
        const qs = new URLSearchParams({ "filter.zipCode.near": zip, "filter.radiusInMiles": String(radiusMiles), "filter.limit": String(limit) });
        const data = await krogerGet(`/locations?${qs}`, token);
        const stores = (data.data || []).map(normalizeStore);
        return cachedJson({ stores }, 900, cors);
      }

      const detailMatch = path.match(/\/kroger\/products\/([^/]+)$/);
      if (detailMatch) {
        const locationId = url.searchParams.get("locationId") || env.DEFAULT_KROGER_LOCATION_ID;
        if (!locationId) throw httpError(400, "locationId is required for store price and aisle data");
        const productId = decodeURIComponent(detailMatch[1]);
        const data = await krogerGet(`/products/${encodeURIComponent(productId)}?filter.locationId=${encodeURIComponent(locationId)}`, token);
        return cachedJson({ offer: normalizeOffer(data.data, locationId) }, 900, cors);
      }

      if (path.endsWith("/kroger/products")) {
        const term = requireParam(url, "term");
        const locationId = url.searchParams.get("locationId") || env.DEFAULT_KROGER_LOCATION_ID;
        if (!locationId) throw httpError(400, "locationId is required for store price and aisle data");
        const limit = clampInt(url.searchParams.get("limit"), 1, 50, 12);
        const qs = new URLSearchParams({ "filter.term": term, "filter.locationId": locationId, "filter.limit": String(limit) });
        if (url.searchParams.get("brand")) qs.set("filter.brand", url.searchParams.get("brand"));
        if (url.searchParams.get("fulfillment")) qs.set("filter.fulfillment", url.searchParams.get("fulfillment"));
        const data = await krogerGet(`/products?${qs}`, token);
        const offers = (data.data || []).map(p => normalizeOffer(p, locationId));
        return cachedJson({ offers }, 900, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (e) {
      return json({ error: e.message || "Unexpected error", upstreamStatus: e.upstreamStatus }, e.status || 500, cors);
    }
  }
};

async function getToken(env) {
  if (!env.KROGER_CLIENT_ID || !env.KROGER_CLIENT_SECRET) throw httpError(500, "Kroger credentials are not configured");
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const basic = btoa(`${env.KROGER_CLIENT_ID}:${env.KROGER_CLIENT_SECRET}`);
  const res = await fetch(`${KROGER_BASE}/connect/oauth2/token`, {
    method: "POST",
    headers: { "Authorization": `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body: "grant_type=client_credentials&scope=product.compact"
  });
  const body = await safeJson(res);
  if (!res.ok) throw upstreamError(res.status, body?.error_description || body?.error || "Kroger authentication failed");
  tokenCache = { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 1800) * 1000 };
  return tokenCache.token;
}

async function krogerGet(path, token) {
  const res = await fetch(KROGER_BASE + path, { headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" } });
  const body = await safeJson(res);
  if (!res.ok) throw upstreamError(res.status, body?.error_description || body?.errors?.[0]?.reason || body?.error || `Kroger request failed (${res.status})`);
  return body;
}

function normalizeStore(s) {
  return {
    id: `kroger:${s.locationId}`,
    retailerId: "kroger",
    externalLocationId: s.locationId,
    name: s.name || "Kroger",
    chain: s.chain || "Kroger",
    phone: s.phone || null,
    address: s.address ? { line1: s.address.addressLine1 || null, city: s.address.city || null, state: s.address.state || null, zip: s.address.zipCode || null } : null,
    geolocation: s.geolocation ? { latitude: s.geolocation.latitude, longitude: s.geolocation.longitude } : null,
    departments: (s.departments || []).map(d => d.name).filter(Boolean)
  };
}

function normalizeOffer(p, locationId) {
  const item = chooseItem(p.items || []);
  const price = item?.price || null;
  const regular = numberOrNull(price?.regular);
  const promo = numberOrNull(price?.promo);
  const effective = promo != null && (regular == null || promo < regular) ? promo : regular;
  const aisle = chooseAisle(p.aisleLocations || []);
  const image = chooseImage(p.images || []);
  const size = parsePackage(item?.size || "");
  return {
    id: `kroger:${locationId}:${p.productId}`,
    product: {
      id: `kroger:${p.productId}`,
      retailerId: "kroger",
      externalProductId: p.productId,
      upc: p.upc || p.productId || null,
      name: p.description || "Kroger product",
      brand: p.brand || null,
      categories: p.categories || [],
      imageUrl: image,
      productUrl: p.productId ? `https://www.kroger.com/p/item/${p.productId}` : null,
      package: { display: item?.size || null, value: size.value, unit: size.unit, variableWeight: isVariableWeight(item, price) }
    },
    store: { id: `kroger:${locationId}`, retailerId: "kroger", externalLocationId: locationId },
    price: { regular, promo, effective, currency: "USD", onSale: promo != null && regular != null && promo < regular, savings: promo != null && regular != null && promo < regular ? roundMoney(regular - promo) : null },
    unitPrice: inferUnitPrice(item, effective),
    location: aisle,
    inventory: { status: normalizeStock(item?.inventory?.stockLevel), rawStatus: item?.inventory?.stockLevel || null },
    fulfillment: { inStore: !!item?.fulfillment?.inStore, pickup: !!item?.fulfillment?.curbside, delivery: !!item?.fulfillment?.delivery, shipToHome: !!item?.fulfillment?.shipToHome },
    source: { provider: "kroger_api", retrievedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() }
  };
}

function chooseItem(items) {
  if (!items.length) return null;
  return [...items].sort((a, b) => scoreItem(b) - scoreItem(a))[0];
}
function scoreItem(i) { return (i?.price ? 4 : 0) + (i?.fulfillment?.inStore ? 3 : 0) + (i?.fulfillment?.curbside ? 2 : 0) + (i?.inventory?.stockLevel && i.inventory.stockLevel !== "TEMPORARILY_OUT_OF_STOCK" ? 1 : 0); }
function chooseAisle(arr) {
  const a = arr.find(x => x.number || x.description || x.bayNumber) || null;
  if (!a) return { display: null, aisle: null, bay: null, side: null, description: null };
  const display = a.description || [a.number != null ? `Aisle ${a.number}` : null, a.bayNumber != null ? `Bay ${a.bayNumber}` : null].filter(Boolean).join(" · ") || null;
  return { display, aisle: a.number != null ? String(a.number) : null, bay: a.bayNumber != null ? String(a.bayNumber) : null, side: a.numberOfFacings != null ? String(a.numberOfFacings) : null, description: a.description || null };
}
function chooseImage(images) {
  const front = images.find(x => String(x.perspective || "").toLowerCase() === "front") || images[0];
  if (!front) return null;
  const sizes = front.sizes || [];
  return (sizes.find(x => String(x.size).toLowerCase() === "medium") || sizes.find(x => String(x.size).toLowerCase() === "large") || sizes[0])?.url || null;
}
function parsePackage(display) {
  const m = String(display).match(/([\d.]+)\s*(lb|lbs|oz|fl oz|ct|count|g|kg|gal|qt|pt)\b/i);
  if (!m) return { value: null, unit: null };
  const unit = ({ lbs: "lb", count: "ct" })[m[2].toLowerCase()] || m[2].toLowerCase();
  return { value: Number(m[1]), unit };
}
function isVariableWeight(item, price) { const s = String(item?.size || ""); return /avg|random weight|per lb|\/\s*lb/i.test(`${s} ${JSON.stringify(price || {})}`); }
function inferUnitPrice(item, effective) {
  const size = parsePackage(item?.size || "");
  if (effective == null || !(size.value > 0)) return { value: null, unit: null };
  return { value: roundMoney(effective / size.value), unit: size.unit };
}
function normalizeStock(s) { return ({ HIGH: "available", LOW: "low_stock", TEMPORARILY_OUT_OF_STOCK: "out_of_stock" })[s] || "unknown"; }
function numberOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function roundMoney(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function clampInt(v, min, max, fallback) { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function requireParam(url, key) { const v = url.searchParams.get(key); if (!v) throw httpError(400, `${key} is required`); return v; }
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function upstreamError(upstreamStatus, message) { const e = new Error(message); e.status = upstreamStatus === 429 ? 429 : 502; e.upstreamStatus = upstreamStatus; return e; }
function json(data, status, headers) { return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } }); }
function cachedJson(data, seconds, headers) { return new Response(JSON.stringify(data), { status: 200, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${seconds}` } }); }
async function safeJson(res) { try { return await res.json(); } catch { return null; } }
