import { aliasLabelLooksSafe, money, normalizeText } from "./marketRules.ts";

type Client = any;
type Receipt = Record<string, any>;
type Line = Record<string, any>;

const CATEGORY = "Pain et boulangerie";
const UNSAFE_WORDS = /\b(total|sous total|tva|ttc|reduction|remise|paiement|reglement|rendu monnaie|carte bancaire|caisse|fidelite|consigne|coupon|avoir|retrait|securite sociale)\b/i;
const PRICE_ON_LABEL = /(?:\bEUR\b|[€]|\b[0-9]{1,3}[,.][0-9]{2}\s*$)/i;
const SOURCE_NAME = "BudgetKazPei verified receipt";
const MAX_LINES = 100;
const chains: Record<string, string> = {
  "e leclerc": "e-leclerc",
  "leader price": "leader-price",
  "super u": "super-u",
  carrefour: "carrefour",
  "carrefour market": "carrefour",
};

function retailer(store: string) {
  const value = normalizeText(store);
  if (/\b(leclerc|e leclerc)\b/.test(value)) return { key: "e leclerc", slug: "e-leclerc" };
  if (/\bleader price\b/.test(value)) return { key: "leader price", slug: "leader-price" };
  if (/\b(super u|hyper u)\b/.test(value)) return { key: "super u", slug: "super-u" };
  if (/\bcarrefour\b/.test(value)) return { key: "carrefour", slug: "carrefour" };
  return null;
}
function uniqueIds(rows: Record<string, any>[], field: string) {
  return [...new Set(rows.map(row => row[field]).filter(Boolean))];
}
function goodLabel(value: string) {
  const text = String(value || "").trim();
  const norm = normalizeText(text);
  if (text.length < 7 || text.length > 145 || norm.length < 7 || UNSAFE_WORDS.test(norm) || PRICE_ON_LABEL.test(text)) return false;
  if (!aliasLabelLooksSafe(text) || /^[0-9\s\W]+$/.test(text)) return false;
  return norm.split(" ").filter(t => t.length > 1).length >= 2;
}
function inferredSize(text: string) {
  const s = String(text || "");
  const group = s.match(/(\d{1,2})\s*[x×]\s*(\d+(?:[,.]\d+)?)\s*(kg|g|gr|l|cl|ml)\b/i);
  if (group) {
    const count = Number(group[1]), each = Number(group[2].replace(",", "."));
    const unit = group[3].toLowerCase() === "gr" ? "g" : group[3].toLowerCase();
    return count > 0 && count <= 48 && each > 0 && each <= 10000 ? { label: group[0].replace(/\s+/g, " "), value: each * count, unit, count } : null;
  }
  const pack = s.match(/\b(?:x|lot\s*de|pack\s*de)\s*(\d{1,2})\b/i);
  if (pack && Number(pack[1]) > 0 && Number(pack[1]) <= 48) return { label: "x" + pack[1], value: null, unit: null, count: Number(pack[1]) };
  const single = s.match(/\b(\d+(?:[,.]\d+)?)\s*(kg|g|gr|l|cl|ml)\b/i);
  if (single) return { label: single[0], value: Number(single[1].replace(",", ".")), unit: single[2].toLowerCase() === "gr" ? "g" : single[2].toLowerCase(), count: 1 };
  return null;
}
function displayName(value: string) {
  // OCR labels often arrive in uppercase. Keep brand lettering in the label,
  // but never invent ingredients, brands, weights or pack sizes.
  return String(value || "").trim().toLocaleLowerCase("fr").replace(/(^|[\s\-/])([a-zà-ÿ])/g, (_m, prefix, ch) => prefix + ch.toLocaleUpperCase("fr"))
    .replace(/\bX(\d+)\b/g, "x$1").replace(/\bMi'Kif\b/gi, "Mi'Kif");
}
function specificEnough(line: Line, title: string) {
  const size = inferredSize(title);
  const words = normalizeText(title).split(" ").filter(x => x.length >= 2);
  const confidence = Number(line.confidence_score || 0);
  // No completely new product is published from a generic or low-quality OCR line.
  return confidence >= 98 && size !== null && words.length >= 3 &&
    !/(\b(?:divers|article|produit|rayon|vrac|assorti|non identifie|vente libre)\b)/i.test(normalizeText(title));
}
function goodLine(line: Line) {
  const name = String(line.corrected_name || line.name || "").trim();
  const qty = line.quantity == null ? 1 : money(line.quantity);
  const total = money(line.total_price);
  return ["trusted", "user_validated"].includes(String(line.item_status || ""))
    && String(line.line_type || "product") === "product"
    && Number(line.confidence_score || 0) >= 95
    && qty > 0 && qty <= 100 && total >= 0.10 && total <= 700
    && goodLabel(name);
}
function normOne(value: any) { return normalizeText(String(value || "")); }
async function stableProductId(norm: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bkp-catalog-receipt-v1:" + norm)));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest.slice(0, 16)].map(b => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}
async function hmacTag(value: string) {
  const secret = Deno.env.get("MARKET_HASH_SECRET");
  if (!secret) throw new Error("catalog_hash_secret_unavailable");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return [...signature].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function onlyUnique(query: PromiseLike<any>, field = "id") {
  const { data, error } = await query;
  if (error) throw error;
  const ids = uniqueIds(data || [], field);
  return ids.length === 1 ? ids[0] : null;
}
async function knownShop(admin: Client, title: string, raw: string, slug: string, chain: string, resolvedMarketId?: string | null) {
  if (resolvedMarketId) {
    const marketId = await onlyUnique(admin.from("shopping_market_product_links").select("shopping_product_id").eq("market_product_id", resolvedMarketId).limit(3), "shopping_product_id");
    if (marketId) return { productId: marketId, marketId: resolvedMarketId };
  }
  // Exact full name is safe. A generic fuzzy match is NEVER used to publish a price.
  for (const label of [...new Set([title, raw].map(normOne).filter(Boolean))]) {
    const direct = await onlyUnique(admin.from("shopping_products").select("id").eq("normalized_name", label).eq("is_active", true).limit(3));
    if (direct) return { productId: direct, marketId: resolvedMarketId || null };
    const alias = await admin.from("shopping_product_aliases").select("product_id,retailer_slug").eq("normalized_alias", label).limit(8);
    if (alias.error) throw alias.error;
    const ids = uniqueIds((alias.data || []).filter((a: any) => !a.retailer_slug || a.retailer_slug === slug), "product_id");
    if (ids.length === 1) return { productId: ids[0], marketId: resolvedMarketId || null };
  }
  if (!resolvedMarketId) {
    const knownAliases = await admin.from("market_product_aliases").select("product_id,scope,store_chain_key").eq("normalized_raw_label",normOne(raw)).eq("status","active").limit(10);
    if (knownAliases.error) throw knownAliases.error;
    const ids = uniqueIds((knownAliases.data || []).filter((a: any) => a.scope === "global" || (a.scope === "chain" && a.store_chain_key === chain)), "product_id");
    if (ids.length === 1) {
      const sharedId = await onlyUnique(admin.from("shopping_market_product_links").select("shopping_product_id").eq("market_product_id",ids[0]).limit(3),"shopping_product_id");
      if (sharedId) return { productId: sharedId, marketId: ids[0] };
    }
  }
  return null;
}
async function storeLocation(admin: Client, store: string, location: string, slug: string) {
  const hint = normOne(location);
  if (!hint || hint.length < 3 || /(?:\b(?:wifi|5g|heure|batterie|%|\d\d:\d\d)\b)/.test(hint)) return null;
  const { data, error } = await admin.from("shopping_store_locations")
    .select("id,store_name,commune,locality").eq("retailer_slug", slug).eq("is_active",true).limit(75);
  if (error) throw error;
  const matches = (data || []).filter((s: any) => {
    const local = normOne(s.locality);
    const full = normOne(s.store_name);
    return hint === local || hint === normOne(s.commune) && full.endsWith(hint) ||
      (hint.length >= 5 && full.includes(hint) && (!local || local === hint || full.endsWith(hint)));
  });
  return matches.length === 1 ? matches[0] : null;
}
function categoryFor(name: string, category?: string) {
  const n = normOne(name);
  if (/\b(pains?|baguettes?|brioche|viennoiserie|pain au lait)\b/.test(n)) return ["Pain et boulangerie", "Pains et viennoiseries"];
  if (/\b(lait|yaourt|fromage|beurre)\b/.test(n)) return ["Produits laitiers", "Laits, fromages et yaourts"];
  if (/\b(biscuit|gateaux|gaufrette|chocolat|cereales)\b/.test(n)) return ["Épicerie", "Biscuits et goûters"];
  if (/\b(jus|soda|eau|nectar|boisson)\b/.test(n)) return ["Boissons", null];
  return [String(category || "").toLowerCase() === "alimentaire" ? "Alimentation" : String(category || "Alimentation"), null];
}
async function createProduct(admin: Client, title: string, line: Line) {
  const norm = normOne(title), size = inferredSize(title), [category, sub] = categoryFor(title,line.category);
  const brand = String(line.brand || "").trim() || null;
  const { data: already, error: checkError } = await admin.from("shopping_products").select("id").eq("normalized_name",norm).limit(3);
  if (checkError) throw checkError;
  if ((already || []).length === 1) return already[0].id;
  if ((already || []).length > 1) return null;
  const id = await stableProductId(norm);
  const { error } = await admin.from("shopping_products").insert({
    id, display_name: title, normalized_name: norm, brand,
    size_label: size?.label || null, category, subcategory: sub,
    is_active: true, is_local_product: false,
  });
  if (error && error.code !== "23505") throw error;
  const { data, error: reread } = await admin.from("shopping_products").select("id").eq("normalized_name",norm).limit(3);
  if (reread) throw reread;
  return (data || []).length === 1 ? data[0].id : null;
}
async function ensureMarket(admin: Client, name: string, brand: string | null, shopId: string) {
  const norm = normOne(name);
  const { data: linked, error: linkErr } = await admin.from("shopping_market_product_links").select("market_product_id").eq("shopping_product_id",shopId).limit(3);
  if (linkErr) throw linkErr;
  if ((linked || []).length === 1) return linked[0].market_product_id;
  const { data: known, error: checkErr } = await admin.from("market_products").select("id").eq("normalized_name",norm).limit(3);
  if (checkErr) throw checkErr;
  if ((known || []).length > 1) return null;
  let marketId = (known || [])[0]?.id || null;
  if (!marketId) {
    const size = inferredSize(name);
    const b = normOne(brand);
    const key = "receipt_verified_v1|"+norm+"|brand|"+b+"|format|"+(size?.label || "");
    const { error } = await admin.from("market_products").upsert({
      canonical_name:name,normalized_name:norm,brand,normalized_brand:b,
      category:categoryFor(name)[0],subcategory:categoryFor(name)[1],
      package_format:size?.label || null,package_count:size?.count || null,
      package_size_value:size?.value || null,package_size_unit:size?.unit || null,
      unit_type: ["l","cl","ml"].includes(size?.unit || "") ? "volume" : size?.unit ? "weight" : null,
      product_key:key,
    },{onConflict:"product_key",ignoreDuplicates:true});
    if (error) throw error;
    const m = await admin.from("market_products").select("id").eq("product_key",key).maybeSingle();
    if (m.error) throw m.error;
    marketId = m.data?.id || null;
  }
  if (marketId) {
    const { error: linkError } = await admin.from("shopping_market_product_links").upsert({
      market_product_id:marketId,shopping_product_id:shopId,match_method:"manual_verified"
    },{onConflict:"market_product_id,shopping_product_id",ignoreDuplicates:true});
    if (linkError) throw linkError;
  }
  return marketId;
}
async function addAlias(admin: Client, productId: string | null, raw: string, chain: string) {
  if (!productId || !goodLabel(raw)) return false;
  const norm = normOne(raw);
  const { data: already, error: checkError } = await admin.from("market_product_aliases")
    .select("id,product_id,scope,store_chain_key").eq("normalized_raw_label",norm)
    .eq("status","active").limit(12);
  if (checkError) throw checkError;
  if ((already || []).some((a: any) => a.scope === "global" || (a.scope==="chain"&&a.store_chain_key===chain))) return false;
  const { error } = await admin.from("market_product_aliases").insert({
    product_id:productId, raw_label:raw,normalized_raw_label:norm,
    scope:"chain",store_chain_key:chain,source:"receipt_scan_anonymized",status:"active",confidence:0.86,
    evidence:{ source_type:"high_confidence_validated_receipt",batch:"receipt_catalog_sync_v1",
      store_chain:chain,privacy:"no_user_or_receipt_identifiers",quality:"exact_full_label" },
    verified_at:new Date().toISOString(),
  });
  if (error && error.code !== "23505") throw error;
  return !error;
}
async function addPrice(admin: Client, productId: string, line: Line, receipt: Receipt, slug: string, store: any) {
  if (!store || !receipt.purchase_date || receipt.date_status !== "detected") return false;
  const date = String(receipt.purchase_date).slice(0,10);
  const now = new Date();
  const at = new Date(date+"T12:00:00.000Z");
  if (!Number.isFinite(at.valueOf()) || at.getTime() > now.getTime()+86400000 || at.getTime() < now.getTime()-365*86400000) return false;
  const quantity = money(line.quantity ?? 1);
  const total = money(line.total_price);
  const price = Math.round(total / quantity *100)/100;
  if (!Number.isFinite(price) || price <=0 || price >500) return false;
  const perUnit = money(line.unit_price);
  if (perUnit && Math.abs(perUnit-price) > Math.max(.02,price*.08)) return false;
  const {data: existing,error} = await admin.from("shopping_price_observations")
    .select("id").eq("product_id",productId).eq("retailer_slug",slug)
    .eq("store_location_id",store.id).eq("observed_at",at.toISOString())
    .eq("price",price).limit(1);
  if(error) throw error;
  if(existing?.length) return false;
  const reference = await hmacTag("catalog-price:"+line.id);
  const fingerprint = "receipt_catalog_v1:"+reference;
  const size = inferredSize(String(line.corrected_name || line.name || ""));
  const conversion = size && size.value && ["g","kg","ml","cl","l"].includes(size.unit || "") ?
    (["g","kg"].includes(size.unit || "") ? (size.unit === "g" ? size.value/1000 : size.value) :
    size.unit === "ml" ? size.value/1000 : size.unit === "cl" ? size.value/100 : size.value) : null;
  const unit_label = conversion ? (["g","kg"].includes(size?.unit || "") ? "€/kg" : "€/l") : null;
  const unit_price = conversion ? Math.round(price / conversion*100)/100 : null;
  const {error:insertError}=await admin.from("shopping_price_observations").insert({
    product_id:productId,retailer_slug:slug,store_location_id:store.id,
    commune:store.commune,locality:store.locality,observed_at:at.toISOString(),
    price,quantity:1,unit_label,unit_price,source_kind:"receipt",source_reference_hash:fingerprint,
    confidence_score:Math.min(1,Number(line.confidence_score)/100),is_publishable:true,verified_at:new Date().toISOString(),
  });
  if(insertError && insertError.code!=="23505") throw insertError;
  return !insertError;
}
async function queueCandidate(admin: Client, line: Line, receipt: Receipt, chain: string, reason: string) {
  const raw = String(line.ocr_name || line.name || ""), display = String(line.corrected_name || line.name || "");
  if (!goodLabel(display)) return false;
  const key = await hmacTag("candidate-label:"+chain+":"+normOne(raw));
  const {data: existing,error: checkError}=await admin.from("market_external_product_candidates")
    .select("id").eq("source_name",SOURCE_NAME).eq("source_identifier",key).limit(1);
  if(checkError) throw checkError;
  if(existing?.length) return false;
  const {error}=await admin.from("market_external_product_candidates").insert({
    source_type:"receipt_manual",source_name:SOURCE_NAME,source_identifier:key,
    raw_label:raw,normalized_raw_label:normOne(raw),
    candidate_canonical_name:display,normalized_candidate_name:normOne(display),
    brand:line.brand || null,category:line.category || null,
    package_format:inferredSize(display)?.label || null,
    observed_price:null,store_name:receipt.store_name || null,store_city:null,
    source_confidence:Math.min(1,Number(line.confidence_score || 0)/100),
    status:"candidate",matching_evidence:{
      origin:"trusted_scanned_receipt",reason,store_chain:chain,
      personal_identifiers_included:false,price_omitted:true
    }
  });
  if(error && error.code!=="23505") throw error;
  return !error;
}

export async function syncVerifiedReceiptCatalog(admin: Client, receipt: Receipt) {
  const report = { checked:0, matched:0, products_created:0, aliases_added:0, prices_published:0, review_candidates:0, skipped:0 };
  if (receipt.validation_status !== "validated" || !receipt.is_food_ticket ||
      receipt.duplicate_confirmed === true || receipt.date_status !== "detected") return report;
  const store = retailer(String(receipt.store_name || ""));
  if (!store) return report;
  const lines = Array.isArray(receipt.receipt_items) ? receipt.receipt_items.slice(0,MAX_LINES):[];
  const location = await storeLocation(admin,String(receipt.store_name || ""),String(receipt.store_location || ""),store.slug);
  const seen = new Set<string>();
  // The existing resolver is exact when observed_price is omitted.
  const eligible = lines.filter(goodLine);
  const toResolve=eligible.map((line: Line,index:number)=>({
    index,raw_name:String(line.corrected_name || line.name || ""),barcode:null,
    store_name:String(receipt.store_name || ""),store_city:String(receipt.store_location || "")
  }));
  const resolutionMap=new Map<number,any>();
  if(toResolve.length) {
    const result=await admin.rpc("market_resolve_exact_products",{p_items:toResolve});
    if(result.error) throw result.error;
    for(const r of Array.isArray(result.data)?result.data:[]) resolutionMap.set(Number(r.index),r);
  }
  for (let index=0;index<eligible.length;index++) {
    const line=eligible[index], label=String(line.corrected_name || line.name || "").trim();
    const raw=String(line.ocr_name || label).trim();
    const signature=normOne(label)+"|"+money(line.total_price)+"|"+money(line.quantity ?? 1);
    if (seen.has(signature)) continue;
    seen.add(signature);
    report.checked++;
    try {
      const resolved=resolutionMap.get(index);
      let known=await knownShop(admin,label,raw,store.slug,store.key,
        resolved?.market_matched===true && ["barcode_exact","alias_exact","normalized_name_exact"].includes(resolved.market_match_type)
        ? String(resolved.market_product_id) : null);
      let productId=known?.productId || null;
      let marketId=known?.marketId || null;
      let created=false;
      if (!productId) {
        if (!specificEnough(line,label) || !inferredSize(label)) {
          report.review_candidates+=Number(await queueCandidate(admin,line,receipt,store.key,"weak_or_ambiguous_identity"));
          continue;
        }
        const title=displayName(label);
        const existing=await admin.from("shopping_products").select("id").eq("normalized_name",normOne(title)).limit(2);
        if(existing.error) throw existing.error;
        const product=await createProduct(admin,title,line);
        if(!product) {
          report.review_candidates+=Number(await queueCandidate(admin,line,receipt,store.key,"identity_conflict"));
          continue;
        }
        productId=product;
        created=(existing.data || []).length===0;
        if(created)report.products_created++;
      } else report.matched++;
      if(!marketId)marketId=await ensureMarket(admin,productId? (created?displayName(label):label):label, String(line.brand || "").trim()||null,productId);
      if(marketId)report.aliases_added+=Number(await addAlias(admin,marketId,raw,store.key));
      // Shared prices are pack prices (never accidentally €/kg).
      if (location && productId) report.prices_published+=Number(await addPrice(admin,productId,line,receipt,store.slug,location));
    } catch(error) {
      console.warn("[catalog-sync] item skipped",error instanceof Error?error.message:"unknown");
      report.skipped++;
    }
  }
  return report;
}
