import { parseReceipt } from "./receiptParser"
import {
  extractDeclaredItemsCount,
  extractReliableDateCandidates,
  extractTrustedTotal,
  isPhoneLine,
  shouldRejectLineAsProduct,
} from "./receiptRules"

export const LEADER_PRICE_SHORT_REFERENCE = {
  id: "leader-price-saint-leu-2026-06-28-8-62-short",
  expectedStore: "Leader Price Saint-Leu",
  expectedNormalizedStore: "leader price",
  expectedStoreLocation: "Saint-Leu",
  expectedDate: "2026-06-28",
  expectedTotal: 8.62,
  expectedItemsCount: 3,
  expectedAiCalls: 0,
  expectedItems: [
    { name: "HUILE LESIEUR TOURNESOL", total: 2.79 },
    { name: "FILET COLIN 405G PNE CHIN", total: 2.99 },
    { name: "POMME DE TERRE REUNION KG", total: 2.84, quantity: 1.292, unitPrice: 2.2 },
  ],
  text: [
    "LEADER PRICE SAINT LEU",
    "150, Rue du General Lambert",
    "97436 SAINT-LEU",
    "Tel : 02.62.34.78.73",
    "BIENVENUE",
    "VOUS AVEZ ETE RECU PAR (RIVIA RE)",
    "28/06/2026 - 11:06:16",
    "DUPLICATA",
    "OPERATION : VENTE",
    "(9) 3265471000110 *HUILE LESIEUR TOURNESOL",
    "PRIX PROMOTION 2.79 EUR",
    "(1)3379141201865 FILET COLIN 405G PNE CHIN 2.99 EUR",
    "(1)9639 POMME DE TERRE REUNION KG",
    "(PM) 1.292 kg x 2.20 EUR/kg 2.84 EUR",
    "TOTAL : 8.62 EUR",
    "CARTE BLEUE 8.62 EUR",
    "NOMBRE ARTICLES : 3",
    "CARTE FIDELITE",
    "VENTILATION PAR TAUX TVA",
    "CODE TOT.HT TAUX T.V.A T.T.C",
    "9 2.7900 0.00% 0.0000 2.79",
    "1 5.7101 2.10% 0.1199 5.83",
    "TOTAL 0.1199 8.62",
    "MERCI DE VOTRE VISITE",
  ].join("\n"),
}

export const LEADER_PRICE_SHORT_NO_PM_REFERENCE = {
  ...LEADER_PRICE_SHORT_REFERENCE,
  id: "leader-price-saint-leu-2026-06-28-8-62-short-no-pm",
  text: LEADER_PRICE_SHORT_REFERENCE.text.replace("(PM) 1.292 kg x 2.20 EUR/kg 2.84 EUR", "1.292 kg x 2.20 EUR/kg 2.84 EUR"),
}

export const LEADER_PRICE_SHORT_NOISY_REFERENCE = {
  ...LEADER_PRICE_SHORT_REFERENCE,
  id: "leader-price-saint-leu-2026-06-28-8-62-short-noisy",
  text: [
    " leader   price   saint-leu ",
    "TEL : 02.62.34.78.73",
    "28.06.2026 - 11:06:16",
    "(9) 3265471000110   *HUILE LESIEUR TOURNESOL",
    "prix promotion 2,79 eur",
    "(1)3379141201865 FILET COLIN 405G PNE CHIN 2.99 EUR",
    "(1)9639 POMME DE TERRE REUNION KG",
    "1.292 kg x 2,20 EUR/kg 2.84 EUR",
    "TOTAL : 8,62 EUR",
    "CARTE BLEUE 8.62 EUR",
    "N O M B R E   ARTICLES : 3",
    "VENTILATION PAR TAUX TVA",
    "CODE TOT.HT TAUX T V A T T C",
    "9 2.7900 0.00% 0.0000 2.79",
    "TOTAL 0.1199 8.62",
  ].join("\n"),
}

export const LEADER_PRICE_SAINT_LEU_REFERENCE = {
  id: "leader-price-saint-leu-2026-06-25-37-46",
  expectedStore: "Leader Price Saint-Leu",
  expectedDate: "2026-06-25",
  expectedTotal: 37.46,
  expectedMinItems: 16,
  text: [
    "LEADER PRICE SAINT LEU",
    "150, Rue du General Lambert",
    "97436 SAINT-LEU",
    "25/06/2026 - 17:40:45",
    "PAQUITO ABC POMME BK 6X20 2.95 EUR",
    "JEUDI 10% MDD -0.30 EUR",
    "PETIT PAIN LAIT X10 350G 2.44 EUR",
    "PAIN MIE TRANCHE COMPLET 2.94 EUR",
    "*BOC CORNI.XT.FIN 72CL 36 2.55 EUR",
    "SALAD.MEXIC.THON 250G CO 2.40 EUR",
    "CHIPS A L ANCIENNE 150GR 2.04 EUR",
    "SARDINES HUILE VEGE.PALMA 0.84 EUR",
    "SPAGHETTI BLE COMPLET 500",
    "PRIX PROMOTION 1.25 EUR",
    "TRANCHETT PB EDAM 10+2 GT 3.10 EUR",
    "MIMOLETTE 10 TRANCHES 160 3.24 EUR",
    "BARQ SAUCISSON PISTACHES 3.04 EUR",
    "BISCUIT TAB CHOC NOIR 150 1.70 EUR",
    "225G GOUTER FOURRES CHOCO",
    "2 x 2.25 EUR 4.50 EUR",
    "T.BUDGET MOUCH.ETUIS 15X1 2.00 EUR",
    "THON ALB CARRI 360G VIET",
    "PRIX PROMOTION 2.99 EUR",
    "BANANE REUNION KG",
    "0.484 kg x 1.95 EUR/kg 0.94 EUR",
    "TOTAL : 37.46 EUR",
    "CARTE BLEUE 37.46 EUR",
  ].join("\n"),
}

export const LECLERC_HORIZONTAL_REFERENCE = {
  id: "eleclerc-le-portail-horizontal-2026-06-19-88-81",
  expectedStore: "E.Leclerc Le Portail",
  expectedDate: "2026-06-19",
  expectedTotal: 88.81,
  expectedMinItems: 32,
  text: [
    "E.Leclerc LE PORTAIL",
    "Ticket 19/06/26",
    "RIZ BASMATI ST LE FORBAN 1KG 3.56 EUR",
    "LE PAIN WRAP X4 WAHI 280G 2.52 EUR",
    "LENTILLES CUIS.265G 1.09 EUR",
    "GRESSIN ROMAR OLIVE 125G 1.90 EUR",
    "COFFRET APERO.100G 1.35 EUR",
    "RUSTICA OIGNONS 37CL 1.10 EUR",
    "LENTILLE BRA QTE NOTRE JARDIN 1.72 EUR",
    "GENOISE FRAISE 1.05 EUR",
    "SEMOULE FINE POT.250G 1.15 EUR",
    "RAVIO HAX 6 LEGUMES 800G 2.25 EUR",
    "SOJA CUISINE 3X200ML BIO VILLA 2.40 EUR",
    "CHOCO STARS MARIEL 3.99 EUR",
    "CROQ MIX SENIOR VOL-FIDO 2.5K 9.38 EUR",
    "BOISSON DE NOIX DE COCO 500ML 1.16 EUR",
    "BLEU AUVERGN AOP ENTREMONT 125 2.10 EUR",
    "CHAVROUX LAIT 1/2ECR BK 1L BOP 1.27 EUR",
    "KOOKY X12 COCO PLANETE 5.35 EUR",
    "RACLETTE PAST. BARC 250GRS 4.09 EUR",
    "EMMENTAL RAPE 28% MG 200G ECO+ 3.60 EUR",
    "MEULE FRUITE 35% BLOC 220G MR 2.90 EUR",
    "BOISSON COCO 1L 2.62 EUR",
    "PF SHPP & 100% VEG DS 450G 2.80 EUR",
    "CAROTTE IMPORT 0.652kg x 1.20 EUR/kg 0.78 EUR",
    "POMME PINK LADY 0.762kg x 2.99 EUR/kg 2.28 EUR",
    "CORDON POULET NATURE 200G PAU 4.43 EUR",
    "COPPA 10G SAINT AZA 2.48 EUR",
    "BON VIEUX STEAK SOJA BLE 226G 5.02 EUR",
    "FILETS DE COLIN PM 400GR 2.19 EUR",
    "CU D M 4 CHOCO/VANILE 8X100G 4.69 EUR",
    "SANDWICHES MINUTERIE 7.25 EUR",
    "TRUITE DE BRETAGNE 4T 120G MRT 7.25 EUR",
    "Total 32 articles 89.81 EUR",
    "Bon immediat 1.00 EUR",
    "Reste a payer 88.81 EUR",
    "CB 88.81 EUR",
  ].join("\n"),
}

export const TICKET_MOYEN_01_FIXTURE_TEMPLATE = {
  id: "ticket-moyen-01-template",
  ready: false,
  note: "Template reserve au prochain ticket moyen reel. Ne pas utiliser dans les tests tant que les donnees attendues ne sont pas fournies.",
  expectedStore: "",
  expectedDate: "",
  expectedTotal: null,
  expectedItemsCount: null,
  text: "",
}

function assertLeaderPriceShortFixture(fixture = LEADER_PRICE_SHORT_REFERENCE) {
  const parsed = parseReceipt({ text: fixture.text, ocrStatus: "success", ocrConfidence: 88 })
  const forbidden = /\b(tel|telephone|tva|carte bleue|nombre articles|ventilation|total)\b/i
  const itemNames = parsed.items.map(item => item.ocr_name || item.name)

  return {
    id: fixture.id,
    passed: extractDeclaredItemsCount(fixture.text) === fixture.expectedItemsCount
      && Math.abs(extractTrustedTotal(fixture.text).amount - fixture.expectedTotal) <= 0.01
      && extractReliableDateCandidates(fixture.text)[0]?.normalized === fixture.expectedDate
      && isPhoneLine("Tel : 02.62.34.78.73")
      && shouldRejectLineAsProduct("Tel : 02.62.34.78.73")
      && shouldRejectLineAsProduct("CARTE BLEUE 8.62 EUR")
      && shouldRejectLineAsProduct("CARTE FIDELITE")
      && shouldRejectLineAsProduct("VENTILATION PAR TAUX TVA")
      && parsed.store_name === fixture.expectedStore
      && parsed.purchase_date === fixture.expectedDate
      && parsed.date_status === "detected"
      && Math.abs(Number(parsed.total_amount || 0) - fixture.expectedTotal) <= 0.01
      && parsed.expected_items_count === fixture.expectedItemsCount
      && parsed.items.length === fixture.expectedItemsCount
      && itemNames.every(name => !forbidden.test(String(name || ""))),
    expected: {
      store: fixture.expectedStore,
      date: fixture.expectedDate,
      total: fixture.expectedTotal,
      items: fixture.expectedItemsCount,
      aiCalls: fixture.expectedAiCalls,
    },
    actual: {
      store: parsed.store_name,
      normalizedStore: (parsed as any).normalized_store_name,
      storeLocation: (parsed as any).store_location,
      date: parsed.purchase_date,
      dateStatus: parsed.date_status,
      total: parsed.total_amount,
      expectedItemsCount: parsed.expected_items_count,
      items: parsed.items.length,
      scanStatus: parsed.scan_status,
      itemNames,
      itemTotals: parsed.items.map(item => item.total_price),
      firstWeightedItem: parsed.items.find(item => String(item.name).includes("POMME DE TERRE")),
    },
  }
}

export function runScannerRegressionFixtures() {
  const leaderShort = assertLeaderPriceShortFixture(LEADER_PRICE_SHORT_REFERENCE)
  const leaderShortNoPm = assertLeaderPriceShortFixture(LEADER_PRICE_SHORT_NO_PM_REFERENCE)
  const leaderShortNoisy = assertLeaderPriceShortFixture(LEADER_PRICE_SHORT_NOISY_REFERENCE)

  const existing = [LEADER_PRICE_SAINT_LEU_REFERENCE, LECLERC_HORIZONTAL_REFERENCE].map((fixture) => {
    const parsed = parseReceipt({ text: fixture.text, ocrStatus: "success", ocrConfidence: 85 })
    return {
      id: fixture.id,
      passed: parsed.store_name === fixture.expectedStore
        && parsed.purchase_date === fixture.expectedDate
        && Math.abs(Number(parsed.total_amount || 0) - fixture.expectedTotal) <= 0.01
        && parsed.items.length >= Math.min(fixture.expectedMinItems, 12),
      expected: {
        store: fixture.expectedStore,
        date: fixture.expectedDate,
        total: fixture.expectedTotal,
        minItems: fixture.expectedMinItems,
      },
      actual: {
        store: parsed.store_name,
        date: parsed.purchase_date,
        total: parsed.total_amount,
        items: parsed.items.length,
        itemNames: parsed.items.map(item => item.ocr_name || item.name),
      },
    }
  })

  return [leaderShort, leaderShortNoPm, leaderShortNoisy, ...existing]
}
