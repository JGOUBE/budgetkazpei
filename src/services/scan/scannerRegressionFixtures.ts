import { classifyLocalOcrError, isTechnicalLocalOcrFailure } from "./ocrDiagnostics"
import { parseReceipt } from "./receiptParser"
import {
  extractDeclaredItemsCount,
  extractDeclaredItemsEvidence,
  extractReliableDateCandidates,
  extractTrustedTotal,
  isItemEligibleForSmartShopping,
  isPhoneLine,
  isSectionSubtotalLine,
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

export const LEADER_PRICE_SMALL_FUZZY_CB_REFERENCE = {
  id: "leader_price_2026_07_03_small_total_fuzzy_cb",
  expectedStore: "Leader Price Saint-Leu",
  expectedNormalizedStore: "leader price",
  expectedStoreLocation: "Saint-Leu",
  expectedDate: "2026-07-03",
  expectedTotal: 14.53,
  expectedItemsCount: 6,
  expectedItemsSource: "declared_total_articles_ocr_fuzzy",
  expectedDeclaredItemsRawText: "GRE ARTICLES : 6",
  expectedTotalSource: "explicit_total_line_ocr_fuzzy",
  expectedPaymentMethod: "carte",
  expectedAiCalls: 0,
  expectedSectionSubtotalsRejectedCount: 4,
  expectedSectionSubtotalsRejectedAmount: 14.53,
  expectedItems: [
    { name: "VEGGIE NUGGETS 300G", total: 2.49 },
    { name: "Q.CREVETTE TROP 8/12 280G", total: 3.99 },
    { name: "BROCOLI 20/40 450G", total: 2.4 },
    { name: "TLJ BARRE CEREALE CHOCO B", total: 1.7 },
    { name: "COCCIOLE RISCOSSA 500G", total: 1.5 },
    { name: "EMMENTAL RAP 45MG 200G", total: 2.45 },
  ],
  sectionSubtotalLines: [
    "SURGELES 8.88 EUR",
    "EPICERIE SUCREE 1.70 EUR",
    "EPICERIE SALEE 1.50 EUR",
    "CREMERIE 2.45 EUR",
  ],
  text: [
    "LEADER PRICE SAINT LEU",
    "150, Rue du General Lambert",
    "97436 SAINT-LEU",
    "Tel : 02.62.34.78.73",
    "BIENVENUE",
    "VOUS AVEZ ETE RECU PAR (VIRASSAMY MARIE REINE)",
    "03/07/2026 - 18:36:21",
    "OPERATION : VENTE",
    "(1)3701004823141 VEGGIE NUGGETS 300G",
    "PRIX PROMOTION 2.49 EUR",
    "(9)3503040014008 Q.CREVETTE TROP 8/12 280G",
    "PRIX PROMOTION 3.99 EUR",
    "(9)5413406121317 BROCOLI 20/40 450G 2.40 EUR",
    "SURGELES 8.88 EUR",
    "(1)3700311866469 TLJ BARRE CEREALE CHOCO B 1.70 EUR",
    "EPICERIE SUCREE 1.70 EUR",
    "(1)8011780009406 COCCIOLE RISCOSSA 500G 1.50 EUR",
    "EPICERIE SALEE 1.50 EUR",
    "(9)8436039437142 EMMENTAL RAP 45MG 200G",
    "PRIX PROMOTION 2.45 EUR",
    "CREMERIE 2.45 EUR",
    "Ry TUIAL : 14.53 EUR",
    "CARTE BLEUE 14.53 EUR",
    "GRE ARTICLES : 6",
    "CARTE FIDELITE",
  ].join("\n"),
}

export const LEADER_PRICE_SMALL_PAYMENT_ONLY_TOTAL_REFERENCE = {
  ...LEADER_PRICE_SMALL_FUZZY_CB_REFERENCE,
  id: "leader_price_2026_07_03_small_total_payment_only_hohe",
  expectedDeclaredItemsRawText: "HOHE ARTICLES : 6",
  expectedTotalSource: "payment_final_line_when_total_label_fuzzy_or_missing",
  text: LEADER_PRICE_SMALL_FUZZY_CB_REFERENCE.text
    .replace("Ry TUIAL : 14.53 EUR", "Oo 14.53 EUR")
    .replace("GRE ARTICLES : 6", "HOHE ARTICLES : 6"),
}

export const LEADER_PRICE_SMALL_UNSAFE_SMART_SHOPPING_REFERENCE = {
  ...LEADER_PRICE_SMALL_PAYMENT_ONLY_TOTAL_REFERENCE,
  id: "leader_price_2026_07_03_small_total_unsafe_smart_shopping_guard",
  text: [
    "LEADER PRICE SAINT LEU",
    "150, Rue du General Lambert",
    "97436 SAINT-LEU",
    "Tel : 02.62.34.78.73",
    "BIENVENUE",
    "03/07/2026 - 18:36:21",
    "OPERATION : VENTE",
    "(1)3701004823141 PT HEEEEEEEEE SUNGELES ecooreeeseatat 8.80 EUR",
    "(9)3503040014008 Q.CREVETTE TROP 8/12 280G 3.99 EUR",
    "(9)5413406121317 BROCOLI 20/40 450G 2.40 EUR",
    "(1)3700311866469 TLJ BARRE CEREALE CHOCO B 1.70 EUR",
    "(1)8011780009406 COCUIOLE",
    "(9)8436039437142 EPP eters, EPICERIE SUCREE : 61.70 EUR",
    "Oo 14.53 EUR",
    "CARTE BLEUE 14.53 EUR",
    "HOHE ARTICLES : 6",
    "CARTE FIDELITE",
    "ENMENTAL",
    "CREMERIE",
    "EPICERIE SALEE",
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

export const LEADER_PRICE_MEDIUM_TOTAL_CASH_REFERENCE = {
  id: "leader_price_2026_07_03_medium_total_cash",
  expectedStore: "Leader Price Saint-Leu",
  expectedNormalizedStore: "leader price",
  expectedStoreLocation: "Saint-Leu",
  expectedDate: "2026-07-03",
  expectedTotal: 55.89,
  expectedMinItems: 15,
  expectedSectionSubtotalsRejectedCount: 7,
  expectedSectionSubtotalsRejectedAmount: 55.89,
  expectedPaymentMethod: "especes",
  expectedAiCalls: 0,
  expectedItems: [
    { name: "HUILE LESIEUR TOURNESOL", quantity: 2, unitPrice: 2.79, total: 5.58 },
    { name: "FIDO FUNTASTIX BACON FROM", total: 7 },
    { name: "PEDIGREE VISCHOK 500G", total: 2.49 },
    { name: "KINDER BUENO T2 43G", total: 1.87 },
    { name: "KINDER BUENO WHITE T2 39G", total: 1.87 },
    { name: "JOKER TEINA ORAN BANAN CA", total: 3.1 },
    { name: "SAL MUSEAU TB BOT S/ ATM", total: 5.07 },
    { name: "SAUCISSES SECHE FUETEC 17", total: 3.7 },
    { name: "MATTHES15UEUFSPONDOUSPLEIN", total: 6.66 },
    { name: "PETSAI CHINOIS PIECE", total: 1.95 },
    { name: "SALADE PIECE", total: 1.5 },
    { name: "POMME DE TERRE REUNION KG", quantity: 1.082, unitPrice: 1.95, total: 2.11 },
    { name: "CHAMPIGNON PIED COUPE POL", quantity: 0.424, unitPrice: 11.8, total: 5 },
    { name: "ECHALOTE FRANCE FILET 250", total: 2.3 },
    { name: "DOLCE V. MOUSSE CHOCO NR", total: 5.69 },
  ],
  sectionSubtotalLines: [
    "EPICERIE SALEE 15.07 EUR",
    "EPICERIE SUCREE 3.74 EUR",
    "BOISSONS SANS ALCOOL 3.10 EUR",
    "CHARCUTERIE LS 8.77 EUR",
    "CREMERIE 6.66 EUR",
    "FLEURS PLANTES, FRUITS-LEGUMES 12.86 EUR",
    "ULTRA FRAIS 5.69 EUR",
  ],
  text: [
    "LEADER PRICE SAINT LEU",
    "150, Rue du General Lambert",
    "97436 SAINT-LEU",
    "Tel : 02.62.34.78.73",
    "BIENVENUE",
    "VOUS AVEZ ETE RECU PAR (VIRASSAMY MARIE REINE)",
    "03/07/2026 - 18:37:39",
    "OPERATION : VENTE",
    "(9)3265471000110 *HUILE LESIEUR TOURNESOL",
    "PRIX PROMOTION",
    "2 x 2.79 EUR 5.58 EUR",
    "(3)8445290782793 FIDO FUNTASTIX BACON FROM 7.00 EUR",
    "(3)5010394193852 PEDIGREE VISCHOK 500G",
    "PRIX PROMOTION 2.49 EUR",
    "EPICERIE SALEE 15.07 EUR",
    "(1)80052760 KINDER BUENO T2 43G 1.87 EUR",
    "(1)80761761 KINDER BUENO WHITE T2 39G 1.87 EUR",
    "EPICERIE SUCREE 3.74 EUR",
    "(1)3123349017168 JOKER TEINA ORAN BANAN CA 3.10 EUR",
    "BOISSONS SANS ALCOOL 3.10 EUR",
    "(1)3345100005324 SAL MUSEAU TB BOT S/ ATM 5.07 EUR",
    "(1)8410843077657 SAUCISSES SECHE FUETEC 17 3.70 EUR",
    "CHARCUTERIE LS 8.77 EUR",
    "(9)3282070015130 MATTHES15UEUFSPONDOUSPLEIN 6.66 EUR",
    "CREMERIE 6.66 EUR",
    "(1)9116 PETSAI CHINOIS PIECE 1.95 EUR",
    "(1)12779 SALADE PIECE 1.50 EUR",
    "(1)9639 POMME DE TERRE REUNION KG",
    "1.082 kg x 1.95 EUR/kg 2.11 EUR",
    "(1)12661 CHAMPIGNON PIED COUPE POL",
    "0.424 kg x 11.80 EUR/kg 5.00 EUR",
    "(1)11452 ECHALOTE FRANCE FILET 250 2.30 EUR",
    "FLEURS PLANTES, FRUITS-LEGUMES 12.86 EUR",
    "(1)3297560114323 DOLCE V. MOUSSE CHOCO NR",
    "PRIX PROMOTION 5.69 EUR",
    "ULTRA FRAIS 5.69 EUR",
    "TOTAL : 55.89 EUR",
    "ESPECES 55.89 EUR",
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

export const ELECLERC_LONG_REAL_OCR_REFERENCE = {
  id: "e-leclerc-le-portail-real-ocr-32-items-noisy",
  expectedStore: "E.Leclerc Le Portail",
  expectedNormalizedStore: "e.leclerc",
  expectedStoreLocation: "Le Portail",
  expectedDate: "2026-06-19",
  expectedItemsMin: 32,
  expectedSubtotalBeforeDiscount: 89.81,
  expectedDiscount: 1.00,
  expectedFinalTotalManualReference: 88.81,
  expectedTotalNeedsReview: true,
  expectedTrustedTotal: 0,
  text: [
    "E.Lecierc",
    "LE PoRTAIL",
    "02.62.71-30,.00",
    "Caisse 011-1032 19. suin 2026 17:07",
    "TT AMM",
    ">> EPICERIE",
    "R12 BASHATI STD LE FORBAN 1a 3.56 1",
    "LE paIN BaP x4 YAN 2608 2.52 2",
    "BARO CHIEN VOLATLLE, 3000 0.89 3",
    "LENTILLES CUIST, 2650 1.09 2",
    "GRESSIN RONAR OLIVE, 125q 1.90 2",
    "COFFRET APERO,1008 1.25 2",
    "RUSTICA OLGNONS 37CL 1.40 2",
    "LENTILLE GRA OTE NOTRE JARDIN 1.72 1",
    "GENOISE FRAISE NR 1.50 2",
    "SCE BOURGUIGHE POT,2506 1.415 1",
    "RAVIOLI AUX 6 LEGUHES 8008 2.25 4",
    "SOJA CUISINE 3X200HL BIO VILLA 2.49 1",
    "CHOCO STARS HARVEL 3.99 1",
    "CROQ MIX SENOIR VOL FIDO 2.5K 9.38 3",
    ">> LIQUIDE",
    "BOISSON DE NOIX DE COCO 500HL 1.16 2",
    ">> CREMERIE",
    "BLEU AUVERGN.AOP ENTREHONT 125 2.10 2",
    "LAIT CDA VIUA 1/2ECR BK 1L BOP 1.27",
    "KOKOT X12 OEUFS PLEIN AIR 5.35 1",
    "RACLETTE PAST. BAR 250GRS 4.09 2",
    "EMMENTAL RAPE 26% MG 2000 ECO+",
    "2X1.80 9 3.60 2",
    "MEULE FRUITEE 35% BLOC 2200 HR 2.90 2",
    "BOISSON COCO 1L 2.62 2",
    "PF SHOP & 100 VEG DS 4506 2.80 1",
    ">> FRUITS",
    "CAROTTE IMPORT",
    "0.654kg X 1.20 EUR/kg 0.78",
    "SO. T6kg x 2.99 EUR/kg 2.28 2",
    ">> CHARCUTERIE TRAITEUR",
    "COPPA 190G SAINT AZQ 2",
    "BON VEGET. STEAK SOJA 2.26",
    "FILETS DE COLIN",
    "POLIN PH 400GR 2.19",
    "TRUITE DE BRETAGNE 200 NAT",
    "Total 32 articles",
    "Bon immediat",
    "Code",
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

function assertLeaderPriceSmallFuzzyCbFixture(fixture = LEADER_PRICE_SMALL_FUZZY_CB_REFERENCE) {
  const parsed = parseReceipt({ text: fixture.text, ocrStatus: "success", ocrConfidence: 88 })
  const trustedTotal = extractTrustedTotal(fixture.text)
  const declaredEvidence = extractDeclaredItemsEvidence(fixture.text)
  const itemNames = parsed.items.map(item => String(item.ocr_name || item.name || ""))
  const debug = (parsed.parser_debug || {}) as Record<string, any>
  const itemTotalSum = Number(parsed.items.reduce((sum, item) => sum + Number(item.total_price ?? item.price ?? 0), 0).toFixed(2))
  const forbiddenSectionNames = /(surgeles|epicerie sucree|epicerie salee|cremerie)/i
  const eligibleSmartShoppingItems = parsed.items.filter(item => isItemEligibleForSmartShopping(item as Record<string, unknown>))
  const sectionSubtotalEligible = isItemEligibleForSmartShopping({
    name: "SURGELES",
    ocr_name: "SURGELES",
    raw_text: "SURGELES 8.80 EUR",
    source_line: "SURGELES 8.80 EUR",
    total_price: 8.8,
    item_status: "trusted",
    review_status: "trusted",
    line_type: "product",
  })

  return {
    id: fixture.id,
    passed: parsed.store_name === fixture.expectedStore
      && (parsed as any).normalized_store_name === fixture.expectedNormalizedStore
      && (parsed as any).store_location === fixture.expectedStoreLocation
      && parsed.purchase_date === fixture.expectedDate
      && parsed.date_status === "detected"
      && Math.abs(Number(parsed.total_amount || 0) - fixture.expectedTotal) <= 0.01
      && (parsed as any).total_needs_review === false
      && (parsed as any).total_source === fixture.expectedTotalSource
      && (parsed as any).total_payment_consistent === true
      && Math.abs(Number((parsed as any).payment_total_value || 0) - fixture.expectedTotal) <= 0.01
      && (parsed as any).payment_method === fixture.expectedPaymentMethod
      && parsed.expected_items_count === fixture.expectedItemsCount
      && (parsed as any).expected_items_source === fixture.expectedItemsSource
      && (parsed as any).declared_items_count === fixture.expectedItemsCount
      && (parsed as any).declared_items_raw_text === fixture.expectedDeclaredItemsRawText
      && parsed.items.length === fixture.expectedItemsCount
      && fixture.sectionSubtotalLines.every(line => isSectionSubtotalLine(line) && shouldRejectLineAsProduct(line))
      && Number(debug.section_subtotals_rejected_count || 0) === fixture.expectedSectionSubtotalsRejectedCount
      && Math.abs(Number(debug.section_subtotals_rejected_amount || 0) - fixture.expectedSectionSubtotalsRejectedAmount) <= 0.01
      && Math.abs(Number(debug.calculated_items_sum_after_section_filter || 0) - fixture.expectedTotal) <= 0.01
      && Math.abs(itemTotalSum - fixture.expectedTotal) <= 0.01
      && Math.abs(Number(debug.items_total_vs_receipt_total_delta || 0)) <= 0.01
      && Number(debug.rejected_before_item_limit_count || 0) >= fixture.expectedSectionSubtotalsRejectedCount
      && debug.item_limit_applied_after_filtering === false
      && Array.isArray(debug.lost_possible_product_lines)
      && debug.lost_possible_product_lines.length === 0
      && Number(debug.items_sent_to_smart_shopping_count || 0) === fixture.expectedItemsCount
      && Number(debug.items_excluded_from_smart_shopping_count || 0) === 0
      && debug.items_quality_status === "trusted"
      && debug.budget_status === "reliable"
      && debug.smart_shopping_safe === true
      && debug.final_scan_status === "budget_ok_articles_ok"
      && eligibleSmartShoppingItems.length === fixture.expectedItemsCount
      && !sectionSubtotalEligible
      && debug.ocr_text_has_total === true
      && debug.ocr_text_has_payment === true
      && debug.ocr_text_has_declared_items_count === true
      && debug.local_total_missing_reason === ""
      && itemNames.every(name => !forbiddenSectionNames.test(name))
      && fixture.expectedItems.every(expected => {
        const item = parsed.items.find(candidate => String(candidate.ocr_name || candidate.name || "").toUpperCase().includes(expected.name.toUpperCase().slice(0, 12)))
        return Boolean(item) && Math.abs(Number(item?.total_price || 0) - expected.total) <= 0.01
      })
      && trustedTotal.amount === fixture.expectedTotal
      && trustedTotal.source === fixture.expectedTotalSource
      && trustedTotal.paymentConsistent === true
      && declaredEvidence.count === fixture.expectedItemsCount
      && declaredEvidence.source === fixture.expectedItemsSource,
    expected: {
      store: fixture.expectedStore,
      date: fixture.expectedDate,
      total: fixture.expectedTotal,
      totalSource: fixture.expectedTotalSource,
      paymentMethod: fixture.expectedPaymentMethod,
      declaredItemsCount: fixture.expectedItemsCount,
      declaredItemsSource: fixture.expectedItemsSource,
      sectionSubtotalsRejected: fixture.expectedSectionSubtotalsRejectedCount,
      aiCalls: fixture.expectedAiCalls,
    },
    actual: {
      store: parsed.store_name,
      normalizedStore: (parsed as any).normalized_store_name,
      storeLocation: (parsed as any).store_location,
      date: parsed.purchase_date,
      total: parsed.total_amount,
      totalNeedsReview: (parsed as any).total_needs_review,
      totalSource: (parsed as any).total_source,
      totalRawText: (parsed as any).total_raw_text,
      paymentMethod: (parsed as any).payment_method,
      paymentTotalValue: (parsed as any).payment_total_value,
      paymentTotalRawText: (parsed as any).payment_total_raw_text,
      expectedItemsCount: parsed.expected_items_count,
      expectedItemsSource: (parsed as any).expected_items_source,
      declaredItemsCount: (parsed as any).declared_items_count,
      declaredItemsRawText: (parsed as any).declared_items_raw_text,
      items: parsed.items.length,
      itemTotalSum,
      sectionSubtotalsRejected: debug.section_subtotals_rejected_count,
      rejectedBeforeItemLimit: debug.rejected_before_item_limit_count,
      itemLimitAppliedAfterFiltering: debug.item_limit_applied_after_filtering,
      lostPossibleProductLines: debug.lost_possible_product_lines,
      smartShoppingEligibleItems: eligibleSmartShoppingItems.length,
      smartShoppingExcludedItems: debug.items_excluded_from_smart_shopping_count,
      itemsQualityStatus: debug.items_quality_status,
      budgetStatus: debug.budget_status,
      smartShoppingSafe: debug.smart_shopping_safe,
      sectionSubtotalsRejectedAmount: debug.section_subtotals_rejected_amount,
      calculatedItemsSumBeforeSectionFilter: debug.calculated_items_sum_before_section_filter,
      calculatedItemsSumAfterSectionFilter: debug.calculated_items_sum_after_section_filter,
      itemsTotalVsReceiptTotalDelta: debug.items_total_vs_receipt_total_delta,
      ocrTextHasTotal: debug.ocr_text_has_total,
      ocrTextHasPayment: debug.ocr_text_has_payment,
      ocrTextHasDeclaredItemsCount: debug.ocr_text_has_declared_items_count,
      localTotalMissingReason: debug.local_total_missing_reason,
      itemNames,
    },
  }
}

function assertLeaderPriceSmallUnsafeSmartShoppingFixture(fixture = LEADER_PRICE_SMALL_UNSAFE_SMART_SHOPPING_REFERENCE) {
  const parsed = parseReceipt({ text: fixture.text, ocrStatus: "success", ocrConfidence: 70 })
  const debug = (parsed.parser_debug || {}) as Record<string, any>
  const itemTotalSum = Number(parsed.items.reduce((sum, item) => sum + Number(item.total_price ?? item.price ?? 0), 0).toFixed(2))
  const eligibleSmartShoppingItems = parsed.items.filter(item => isItemEligibleForSmartShopping(item as Record<string, unknown>))
  const statuses = parsed.items.map(item => String(item.item_status || item.review_status || item.status || ""))

  return {
    id: fixture.id,
    passed: parsed.store_name === fixture.expectedStore
      && parsed.purchase_date === fixture.expectedDate
      && Math.abs(Number(parsed.total_amount || 0) - fixture.expectedTotal) <= 0.01
      && (parsed as any).total_needs_review === false
      && (parsed as any).total_payment_consistent === true
      && Math.abs(Number((parsed as any).payment_total_value || 0) - fixture.expectedTotal) <= 0.01
      && (parsed as any).declared_items_count === fixture.expectedItemsCount
      && debug.budget_status === "reliable"
      && Number(debug.items_total_vs_receipt_total_delta || 0) > 0.05
      && debug.smart_shopping_safe === false
      && debug.items_quality_status === "blocked"
      && debug.final_scan_status === "budget_ok_articles_blocked"
      && parsed.scan_status === "budget_ok_articles_blocked"
      && parsed.scan_status !== "trusted"
      && Number(debug.items_sent_to_smart_shopping_count || 0) === 0
      && Number(debug.items_excluded_from_smart_shopping_count || 0) === parsed.items.length
      && Array.isArray(debug.smart_shopping_blocked_reasons)
      && debug.smart_shopping_blocked_reasons.includes("items_total_mismatch")
      && statuses.every(status => status === "needs_review")
      && eligibleSmartShoppingItems.length === 0,
    expected: {
      store: fixture.expectedStore,
      date: fixture.expectedDate,
      total: fixture.expectedTotal,
      declaredItemsCount: fixture.expectedItemsCount,
      budgetStatus: "reliable",
      smartShoppingSafe: false,
      finalScanStatus: "budget_ok_articles_blocked",
      smartShoppingEligibleItems: 0,
      requiredBlockReason: "items_total_mismatch",
    },
    actual: {
      store: parsed.store_name,
      date: parsed.purchase_date,
      total: parsed.total_amount,
      totalNeedsReview: (parsed as any).total_needs_review,
      paymentTotalValue: (parsed as any).payment_total_value,
      declaredItemsCount: (parsed as any).declared_items_count,
      items: parsed.items.length,
      itemTotalSum,
      itemsTotalVsReceiptTotalDelta: debug.items_total_vs_receipt_total_delta,
      budgetStatus: debug.budget_status,
      itemsQualityStatus: debug.items_quality_status,
      smartShoppingSafe: debug.smart_shopping_safe,
      finalScanStatus: debug.final_scan_status,
      scanStatus: parsed.scan_status,
      scanStatusLegacy: debug.scan_status_legacy,
      smartShoppingEligibleItems: eligibleSmartShoppingItems.length,
      smartShoppingSent: debug.items_sent_to_smart_shopping_count,
      smartShoppingExcluded: debug.items_excluded_from_smart_shopping_count,
      smartShoppingBlockedReasons: debug.smart_shopping_blocked_reasons,
      statuses,
      itemNames: parsed.items.map(item => item.ocr_name || item.name),
    },
  }
}

function assertLeaderPriceMediumTotalCashFixture(fixture = LEADER_PRICE_MEDIUM_TOTAL_CASH_REFERENCE) {
  const parsed = parseReceipt({ text: fixture.text, ocrStatus: "success", ocrConfidence: 90 })
  const trustedTotal = extractTrustedTotal(fixture.text)
  const itemNames = parsed.items.map(item => String(item.ocr_name || item.name || ""))
  const forbiddenSectionNames = /(epicerie|boissons sans alcool|charcuterie|cremerie|fleurs.*legumes|ultra frais)/i
  const oilItem = parsed.items.find(item => String(item.ocr_name || item.name || "").toUpperCase().includes("HUILE LESIEUR"))
  const weightedPotato = parsed.items.find(item => String(item.ocr_name || item.name || "").toUpperCase().includes("POMME DE TERRE"))
  const weightedMushroom = parsed.items.find(item => String(item.ocr_name || item.name || "").toUpperCase().includes("CHAMPIGNON"))
  const debug = (parsed.parser_debug || {}) as Record<string, any>
  const itemTotalSum = Number(parsed.items.reduce((sum, item) => sum + Number(item.total_price ?? item.price ?? 0), 0).toFixed(2))

  return {
    id: fixture.id,
    passed: parsed.store_name === fixture.expectedStore
      && (parsed as any).normalized_store_name === fixture.expectedNormalizedStore
      && (parsed as any).store_location === fixture.expectedStoreLocation
      && parsed.purchase_date === fixture.expectedDate
      && parsed.date_status === "detected"
      && Math.abs(Number(parsed.total_amount || 0) - fixture.expectedTotal) <= 0.01
      && (parsed as any).total_needs_review === false
      && ((parsed as any).total_source === "explicit_total_line" || (parsed as any).total_payment_consistent === true)
      && Math.abs(Number((parsed as any).payment_total_value || 0) - fixture.expectedTotal) <= 0.01
      && (parsed as any).payment_method === fixture.expectedPaymentMethod
      && fixture.sectionSubtotalLines.every(line => isSectionSubtotalLine(line) && shouldRejectLineAsProduct(line))
      && Number(debug.section_subtotals_rejected_count || 0) === fixture.expectedSectionSubtotalsRejectedCount
      && Math.abs(Number(debug.section_subtotals_rejected_amount || 0) - fixture.expectedSectionSubtotalsRejectedAmount) <= 0.01
      && Math.abs(Number(debug.calculated_items_sum_after_section_filter || 0) - fixture.expectedTotal) <= 0.01
      && Math.abs(itemTotalSum - fixture.expectedTotal) <= 0.01
      && Math.abs(Number(debug.items_total_vs_receipt_total_delta || 0)) <= 0.01
      && parsed.items.length >= fixture.expectedMinItems
      && itemNames.every(name => !forbiddenSectionNames.test(name))
      && Boolean(oilItem)
      && Math.abs(Number(oilItem?.quantity || 0) - 2) <= 0.01
      && Math.abs(Number(oilItem?.unit_price || 0) - 2.79) <= 0.01
      && Math.abs(Number(oilItem?.total_price || 0) - 5.58) <= 0.01
      && Math.abs(Number(weightedPotato?.quantity || 0) - 1.082) <= 0.001
      && Math.abs(Number(weightedPotato?.unit_price || 0) - 1.95) <= 0.01
      && Math.abs(Number(weightedPotato?.total_price || 0) - 2.11) <= 0.01
      && Math.abs(Number(weightedMushroom?.quantity || 0) - 0.424) <= 0.001
      && Math.abs(Number(weightedMushroom?.unit_price || 0) - 11.8) <= 0.01
      && Math.abs(Number(weightedMushroom?.total_price || 0) - 5) <= 0.01
      && trustedTotal.amount === fixture.expectedTotal
      && trustedTotal.source === "explicit_total_line"
      && trustedTotal.paymentConsistent === true,
    expected: {
      store: fixture.expectedStore,
      date: fixture.expectedDate,
      total: fixture.expectedTotal,
      minItems: fixture.expectedMinItems,
      sectionSubtotalsRejected: fixture.expectedSectionSubtotalsRejectedCount,
      sectionSubtotalsRejectedAmount: fixture.expectedSectionSubtotalsRejectedAmount,
      paymentMethod: fixture.expectedPaymentMethod,
      aiCalls: fixture.expectedAiCalls,
    },
    actual: {
      store: parsed.store_name,
      normalizedStore: (parsed as any).normalized_store_name,
      storeLocation: (parsed as any).store_location,
      date: parsed.purchase_date,
      dateStatus: parsed.date_status,
      total: parsed.total_amount,
      totalNeedsReview: (parsed as any).total_needs_review,
      totalSource: (parsed as any).total_source,
      totalRawText: (parsed as any).total_raw_text,
      totalConfidence: (parsed as any).total_confidence,
      paymentMethod: (parsed as any).payment_method,
      paymentTotalValue: (parsed as any).payment_total_value,
      paymentTotalRawText: (parsed as any).payment_total_raw_text,
      totalPaymentConsistent: (parsed as any).total_payment_consistent,
      items: parsed.items.length,
      itemTotalSum,
      sectionSubtotalsRejected: debug.section_subtotals_rejected_count,
      sectionSubtotalsRejectedAmount: debug.section_subtotals_rejected_amount,
      calculatedItemsSumBeforeSectionFilter: debug.calculated_items_sum_before_section_filter,
      calculatedItemsSumAfterSectionFilter: debug.calculated_items_sum_after_section_filter,
      itemsTotalVsReceiptTotalDelta: debug.items_total_vs_receipt_total_delta,
      itemNames,
      oilItem,
      weightedPotato,
      weightedMushroom,
    },
  }
}

export function runScannerRegressionFixtures() {
  const leaderShort = assertLeaderPriceShortFixture(LEADER_PRICE_SHORT_REFERENCE)
  const leaderShortNoPm = assertLeaderPriceShortFixture(LEADER_PRICE_SHORT_NO_PM_REFERENCE)
  const leaderShortNoisy = assertLeaderPriceShortFixture(LEADER_PRICE_SHORT_NOISY_REFERENCE)
  const leaderSmallFuzzyCb = assertLeaderPriceSmallFuzzyCbFixture(LEADER_PRICE_SMALL_FUZZY_CB_REFERENCE)
  const leaderSmallPaymentOnlyTotal = assertLeaderPriceSmallFuzzyCbFixture(LEADER_PRICE_SMALL_PAYMENT_ONLY_TOTAL_REFERENCE)
  const leaderSmallUnsafeSmartShopping = assertLeaderPriceSmallUnsafeSmartShoppingFixture(LEADER_PRICE_SMALL_UNSAFE_SMART_SHOPPING_REFERENCE)
  const leaderMediumTotalCash = assertLeaderPriceMediumTotalCashFixture(LEADER_PRICE_MEDIUM_TOTAL_CASH_REFERENCE)

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

  const eLeclercReal = (() => {
    const fixture = ELECLERC_LONG_REAL_OCR_REFERENCE
    const parsed = parseReceipt({ text: fixture.text, ocrStatus: "success", ocrConfidence: 58 })
    const trustedTotal = extractTrustedTotal(fixture.text)
    const declaredEvidence = extractDeclaredItemsEvidence(fixture.text)
    const declaredItemsCount = extractDeclaredItemsCount(fixture.text)
    const totalLineRejectedAsProduct = shouldRejectLineAsProduct("Total 32 articles")
    const phoneDateRejected = extractReliableDateCandidates("02.62.71-30,.00").length === 0
    const recoveryRatio = Number((9 / fixture.expectedItemsMin).toFixed(2))

    return {
      id: fixture.id,
      passed: parsed.store_name === fixture.expectedStore
        && (parsed as any).normalized_store_name === fixture.expectedNormalizedStore
        && (parsed as any).store_location === fixture.expectedStoreLocation
        && parsed.purchase_date === fixture.expectedDate
        && declaredItemsCount === fixture.expectedItemsMin
        && declaredEvidence.source === "declared_total_articles"
        && trustedTotal.amount === fixture.expectedTrustedTotal
        && totalLineRejectedAsProduct
        && phoneDateRejected
        && Number(parsed.total_amount || 0) === 0
        && recoveryRatio <= 1
        && recoveryRatio === 0.28,
      expected: {
        store: fixture.expectedStore,
        normalizedStore: fixture.expectedNormalizedStore,
        storeLocation: fixture.expectedStoreLocation,
        date: fixture.expectedDate,
        expectedItemsMin: fixture.expectedItemsMin,
        expectedSubtotalBeforeDiscount: fixture.expectedSubtotalBeforeDiscount,
        expectedDiscount: fixture.expectedDiscount,
        expectedFinalTotalManualReference: fixture.expectedFinalTotalManualReference,
        trustedTotal: fixture.expectedTrustedTotal,
        totalNeedsReview: fixture.expectedTotalNeedsReview,
      },
      actual: {
        store: parsed.store_name,
        normalizedStore: (parsed as any).normalized_store_name,
        storeLocation: (parsed as any).store_location,
        date: parsed.purchase_date,
        declaredItemsCount,
        declaredItemsRawText: declaredEvidence.raw,
        declaredItemsSource: declaredEvidence.source,
        recoveryRatioFor9TrustedItems: recoveryRatio,
        trustedTotal: trustedTotal.amount,
        total: parsed.total_amount,
        items: parsed.items.length,
        itemNames: parsed.items.map(item => item.ocr_name || item.name),
      },
    }
  })()

  const eLeclercSyntheticPrintedCountRejected = (() => {
    const syntheticEvidence = extractDeclaredItemsEvidence("printed_items_count:3")
    const expectedItemsMin = syntheticEvidence.count || null
    const recoveryRatioRaw = expectedItemsMin ? 10 / expectedItemsMin : null

    return {
      id: "e-leclerc-synthetic-printed-items-count-rejected",
      passed: syntheticEvidence.count === 0
        && syntheticEvidence.source === "missing"
        && expectedItemsMin === null
        && recoveryRatioRaw === null,
      expected: {
        declaredItemsCount: null,
        expectedItemsMin: null,
        expectedItemsSource: "not_found",
        recoveryRatioStatus: "unknown_expected_items",
      },
      actual: {
        declaredItemsCount: syntheticEvidence.count || null,
        declaredItemsRawText: syntheticEvidence.raw,
        declaredItemsSource: syntheticEvidence.source === "missing" ? "not_found" : syntheticEvidence.source,
        expectedItemsMin,
        recoveryRatioRaw,
      },
    }
  })()

  const tesseractViteImportFailure = (() => {
    const error = new Error("Failed to fetch dynamically imported module: http://localhost:5173/node_modules/.vite/deps/tesseract__js.js?v=89a2de5f")
    const type = classifyLocalOcrError(error)

    return {
      id: "tesseract-vite-dynamic-import-failure-classified",
      passed: type === "module_load_failed" && isTechnicalLocalOcrFailure(type),
      expected: {
        localOcrErrorType: "module_load_failed",
        technicalFailure: true,
      },
      actual: {
        localOcrErrorType: type,
        technicalFailure: isTechnicalLocalOcrFailure(type),
      },
    }
  })()

  return [
    leaderShort,
    leaderShortNoPm,
    leaderShortNoisy,
    leaderSmallFuzzyCb,
    leaderSmallPaymentOnlyTotal,
    leaderSmallUnsafeSmartShopping,
    leaderMediumTotalCash,
    ...existing,
    eLeclercReal,
    eLeclercSyntheticPrintedCountRejected,
    tesseractViteImportFailure,
  ]
}
