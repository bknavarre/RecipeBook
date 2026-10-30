/**
 * OPTIONAL automatic price lookup for the Family Recipe app (Cloudflare Worker template - UNTESTED).
 * App calls: GET <worker-url>?store=<store>&q=<ingredient>&zip=<zip>  ->  { "products": [ { name, price, unitPrice, size, aisle, url, image } ] }
 * Kroger -> official Products API (secrets KROGER_CLIENT_ID, KROGER_CLIENT_SECRET from developer.kroger.com)
 * H-E-B  -> paid third-party scraper on Apify (secret APIFY_TOKEN). Check its output fields and H-E-B's terms.
 */
const HEB_ACTOR = "stealth_mode~heb-product-search-scraper";
const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, ...extra } });
export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: { ...CORS, "Access-Control-Allow-Methods": "GET" } });
    const u = new URL(request.url);
    const q = (u.searchParams.get("q") || "").trim();
    const store = (u.searchParams.get("store") || "").toLowerCase();
    const zip = (u.searchParams.get("zip") || env.DEFAULT_ZIP || "").trim();
    if (!q) return json({ products: [] });
    const cache = caches.default, cacheKey = new Request(u.toString());
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    let products;
    try {
      if (store.includes("kroger")) products = await kroger(q, zip, env);
      else if (/h-?e-?b/.test(store)) products = await heb(q, env);
      else return json({ error: "No price source set up for this store yet", products: [] }, 400);
    } catch (e) { return json({ error: String(e.message || e), products: [] }, 502); }
    const out = json({ products }, 200, { "Cache-Control": "max-age=43200" });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  }
};
async function krogerToken(env) {
  const res = await fetch("https://api.kroger.com/v1/connect/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(`${env.KROGER_CLIENT_ID}:${env.KROGER_CLIENT_SECRET}`) }, body: "grant_type=client_credentials&scope=product.compact" });
  if (!res.ok) throw new Error("Kroger auth failed " + res.status);
  return (await res.json()).access_token;
}
async function kroger(q, zip, env) {
  if (!env.KROGER_CLIENT_ID) throw new Error("Kroger keys not configured");
  const H = { Authorization: "Bearer " + await krogerToken(env), Accept: "application/json" };
  let locationId = env.KROGER_LOCATION_ID || "";
  if (!locationId && zip) locationId = (await (await fetch(`https://api.kroger.com/v1/locations?filter.zipCode.near=${zip}&filter.limit=1`, { headers: H })).json())?.data?.[0]?.locationId || "";
  if (!locationId) throw new Error("Set a ZIP in the app (or KROGER_LOCATION_ID) so Kroger can return store prices");
  const r = await fetch(`https://api.kroger.com/v1/products?filter.term=${encodeURIComponent(q)}&filter.locationId=${locationId}&filter.limit=15`, { headers: H });
  if (!r.ok) throw new Error("Kroger products failed " + r.status);
  return ((await r.json()).data || []).map(p => {
    const item = (p.items || [])[0] || {};
    const price = item.price ? (item.price.promo || item.price.regular) : null;
    const aisle = (p.aisleLocations || [])[0];
    const front = (p.images || []).find(i => i.perspective === "front") || (p.images || [])[0];
    const img = front?.sizes?.find(s => s.size === "medium") || front?.sizes?.[0];
    return { name: p.description, price: price || null, unitPrice: null, size: item.size || "", aisle: aisle ? (aisle.description || ("Aisle " + aisle.number)) : "", url: p.productId ? `https://www.kroger.com/p/item/${p.productId}` : "", image: img?.url || "" };
  }).filter(p => p.name);
}
async function heb(q, env) {
  if (!env.APIFY_TOKEN) throw new Error("H-E-B lookup not configured (APIFY_TOKEN)");
  const res = await fetch(`https://api.apify.com/v2/acts/${HEB_ACTOR}/run-sync-get-dataset-items?token=${env.APIFY_TOKEN}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: [`https://www.heb.com/search?q=${encodeURIComponent(q)}`], ignore_url_failures: true, max_items_per_url: 15 }) });
  if (!res.ok) throw new Error("H-E-B lookup failed " + res.status);
  const items = await res.json();
  const num = (v) => { if (v == null) return null; const m = String(typeof v === "object" ? v.amount ?? v.value ?? "" : v).match(/[\d.]+/); return m ? Number(m[0]) : null; };
  return (Array.isArray(items) ? items : []).map(x => ({ name: x.name || x.title || x.productName || x.displayName || "", price: num(x.price ?? x.currentPrice ?? x.salePrice ?? x.listPrice ?? x.pricing?.price), unitPrice: num(x.unitPrice ?? x.pricePerUnit), size: x.size || x.packageSize || "", aisle: x.aisle || x.aisleLocation || x.productLocation || x.location || "", url: x.url || x.productUrl || "", image: x.image || x.imageUrl || (Array.isArray(x.images) ? x.images[0] : "") || "" })).filter(p => p.name);
}
