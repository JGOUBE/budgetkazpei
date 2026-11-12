import { loadSharedShoppingCatalog, loadSharedShoppingPrices } from "../../../services/shoppingList/sharedCatalogLoader.js"
import { loadPublishedRetailObservedPriceOffers } from "../../../services/retail/retailObservedPriceService.js"
import { supabase } from "../../../services/supabase.js"

// Public, publishable observations only; cache them across the two shopping
// tabs so that one navigation does not repeat the paginated catalogue fetch.
// Personal purchase history is never cached here.
const MAX_CACHE_AGE_MS = 5 * 60 * 1000
let cache = null
let fetchedAt = 0
let inFlight = null

export async function loadRegionalHabitReferences({ client = supabase } = {}) {
  if (client === supabase && cache && Date.now() - fetchedAt < MAX_CACHE_AGE_MS) return cache
  if (client === supabase && inFlight) return inFlight

  const request = Promise.allSettled([
    loadSharedShoppingCatalog({ client }),
    loadSharedShoppingPrices({ client }),
    loadPublishedRetailObservedPriceOffers({ client }),
  ]).then(results => {
    const data = {
      sharedProducts: results[0].status === "fulfilled" ? results[0].value : [],
      sharedPrices: results[1].status === "fulfilled" ? results[1].value : [],
      retailPrices: results[2].status === "fulfilled" ? results[2].value : [],
    }
    if (client === supabase && Object.values(data).some(rows => rows.length > 0)) {
      cache = data
      fetchedAt = Date.now()
    }
    return data
  })

  if (client !== supabase) return request
  inFlight = request
  try {
    return await request
  } finally {
    inFlight = null
  }
}
