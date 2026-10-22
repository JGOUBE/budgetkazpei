package com.budgetkazpei.app;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "GooglePlayBilling")
public class GooglePlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient billingClient;
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .build()
            )
            .build();
    }

    private void withBillingReady(PluginCall call, Runnable action) {
        if (billingClient != null && billingClient.isReady()) {
            action.run();
            return;
        }

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    action.run();
                } else {
                    call.reject("Google Play Billing indisponible: " + billingResult.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // La prochaine action relancera automatiquement une connexion.
            }
        });
    }

    @PluginMethod
    public void getSubscriptionOffers(PluginCall call) {
        final String productId = call.getString("productId");
        if (productId == null || productId.trim().isEmpty()) {
            call.reject("productId requis");
            return;
        }

        withBillingReady(call, () -> queryProductDetails(productId, call, false));
    }

    @PluginMethod
    public void purchaseSubscription(PluginCall call) {
        final String productId = call.getString("productId");
        final String basePlanId = call.getString("basePlanId");
        final String obfuscatedAccountId = call.getString("obfuscatedAccountId");

        if (productId == null || productId.trim().isEmpty()) {
            call.reject("productId requis");
            return;
        }
        if (basePlanId == null || basePlanId.trim().isEmpty()) {
            call.reject("basePlanId requis");
            return;
        }

        if (pendingPurchaseCall != null) {
            call.reject("Un achat est déjà en cours");
            return;
        }

        withBillingReady(call, () -> {
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()
                ))
                .build();

            billingClient.queryProductDetailsAsync(params, (billingResult, result) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Impossible de charger l'abonnement: " + billingResult.getDebugMessage());
                    return;
                }

                ProductDetails product = null;
                for (ProductDetails candidate : result.getProductDetailsList()) {
                    if (productId.equals(candidate.getProductId())) {
                        product = candidate;
                        break;
                    }
                }

                if (product == null || product.getSubscriptionOfferDetails() == null) {
                    call.reject("Abonnement Google Play introuvable");
                    return;
                }

                ProductDetails.SubscriptionOfferDetails selectedOffer = null;
                for (ProductDetails.SubscriptionOfferDetails offer : product.getSubscriptionOfferDetails()) {
                    if (basePlanId.equals(offer.getBasePlanId())) {
                        selectedOffer = offer;
                        break;
                    }
                }

                if (selectedOffer == null) {
                    call.reject("Formule Google Play introuvable: " + basePlanId);
                    return;
                }

                BillingFlowParams.ProductDetailsParams productParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(product)
                        .setOfferToken(selectedOffer.getOfferToken())
                        .build();

                BillingFlowParams.Builder flowBuilder = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(productParams));

                if (obfuscatedAccountId != null && !obfuscatedAccountId.trim().isEmpty()) {
                    flowBuilder.setObfuscatedAccountId(obfuscatedAccountId);
                }

                pendingPurchaseCall = call;
                BillingResult launchResult = billingClient.launchBillingFlow(getActivity(), flowBuilder.build());

                if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    pendingPurchaseCall = null;
                    call.reject("Achat Google Play non lancé: " + launchResult.getDebugMessage());
                }
            });
        });
    }

    @PluginMethod
    public void restoreSubscriptions(PluginCall call) {
        withBillingReady(call, () -> {
            QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build();

            billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Impossible de restaurer les achats: " + billingResult.getDebugMessage());
                    return;
                }

                JSObject ret = new JSObject();
                JSArray purchaseArray = new JSArray();
                for (Purchase purchase : purchases) {
                    purchaseArray.put(purchaseToJson(purchase));
                }
                ret.put("purchases", purchaseArray);
                call.resolve(ret);
            });
        });
    }

    private void queryProductDetails(String productId, PluginCall call, boolean unused) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            ))
            .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, result) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("Impossible de charger Google Play: " + billingResult.getDebugMessage());
                return;
            }

            JSArray offers = new JSArray();
            for (ProductDetails details : result.getProductDetailsList()) {
                List<ProductDetails.SubscriptionOfferDetails> subscriptionOffers = details.getSubscriptionOfferDetails();
                if (subscriptionOffers == null) continue;

                for (ProductDetails.SubscriptionOfferDetails offer : subscriptionOffers) {
                    JSObject item = new JSObject();
                    item.put("productId", details.getProductId());
                    item.put("title", details.getTitle());
                    item.put("name", details.getName());
                    item.put("description", details.getDescription());
                    item.put("basePlanId", offer.getBasePlanId());
                    item.put("offerId", offer.getOfferId());
                    item.put("offerToken", offer.getOfferToken());

                    List<ProductDetails.PricingPhase> phases =
                        offer.getPricingPhases().getPricingPhaseList();
                    if (phases != null && !phases.isEmpty()) {
                        ProductDetails.PricingPhase phase = phases.get(phases.size() - 1);
                        item.put("formattedPrice", phase.getFormattedPrice());
                        item.put("priceAmountMicros", phase.getPriceAmountMicros());
                        item.put("priceCurrencyCode", phase.getPriceCurrencyCode());
                        item.put("billingPeriod", phase.getBillingPeriod());
                    }

                    offers.put(item);
                }
            }

            JSObject ret = new JSObject();
            ret.put("offers", offers);
            call.resolve(ret);
        });
    }

    private JSObject purchaseToJson(Purchase purchase) {
        JSObject item = new JSObject();
        item.put("purchaseToken", purchase.getPurchaseToken());
        item.put("orderId", purchase.getOrderId());
        item.put("purchaseState", purchase.getPurchaseState());
        item.put("acknowledged", purchase.isAcknowledged());
        item.put("autoRenewing", purchase.isAutoRenewing());
        item.put("purchaseTime", purchase.getPurchaseTime());

        JSArray products = new JSArray();
        for (String product : purchase.getProducts()) {
            products.put(product);
        }
        item.put("products", products);
        return item;
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            pendingPurchaseCall = null;
            if (call != null) call.reject("Achat annulé");
            return;
        }

        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            pendingPurchaseCall = null;
            if (call != null) {
                call.reject("Erreur Google Play: " + billingResult.getDebugMessage());
            }
            return;
        }

        if (purchases == null || purchases.isEmpty()) {
            return;
        }

        Purchase purchase = purchases.get(0);
        JSObject result = purchaseToJson(purchase);
        result.put(
            "status",
            purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased" : "pending"
        );

        notifyListeners("purchaseUpdated", result);

        if (call != null) {
            pendingPurchaseCall = null;
            call.resolve(result);
        }
    }
}
