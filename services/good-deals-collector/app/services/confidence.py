from __future__ import annotations

from datetime import datetime, timezone

from app.models.candidate import Candidate


def score_candidate(candidate: Candidate) -> tuple[int, list[str], list[str], str]:
    score = 0
    reasons: list[str] = []
    errors: list[str] = []

    if candidate.source_url.startswith("https://"):
        score += 25
        reasons.append("source_officielle_https")
    else:
        errors.append("source_non_officielle")

    if candidate.title or candidate.product_name:
        score += 15
        reasons.append("intitule_identifie")
    else:
        errors.append("titre_ou_produit_absent")

    if candidate.starts_at:
        score += 10
        reasons.append("date_debut_fiable")

    if candidate.ends_at:
        score += 15
        reasons.append("date_fin_fiable")
    elif candidate.content_kind in {"promotion", "event"}:
        errors.append("date_fin_absente")

    if candidate.commune or candidate.scope_type == "island":
        score += 10
        reasons.append("portee_geographique_fiable")
    else:
        errors.append("portee_geographique_absente")

    if candidate.content_kind != "promotion":
        score += 15
        reasons.append("prix_non_requis")
    elif candidate.promo_price is not None:
        score += 15
        reasons.append("prix_promo_fiable")
    else:
        errors.append("prix_promo_ambigu")

    if candidate.original_price is not None:
        if candidate.promo_price is not None and candidate.original_price >= candidate.promo_price:
            score += 5
            reasons.append("ancien_prix_coherent")
        else:
            errors.append("ancien_prix_incoherent")

    if candidate.duplicate_key:
        score += 5
        reasons.append("cle_doublon_calculee")

    now = datetime.now(timezone.utc)
    if candidate.ends_at and candidate.ends_at.replace(tzinfo=timezone.utc) < now:
        errors.append("contenu_deja_expire")

    if candidate.content_kind == "promotion" and not candidate.normalized_product_name:
        errors.append("produit_non_identifie")

    if candidate.content_kind == "event" and not candidate.starts_at:
        errors.append("date_evenement_imprecise")

    if candidate.discount_percent is not None and not (0 <= candidate.discount_percent <= 100):
        errors.append("reduction_incoherente")

    hard_reject_errors = {
        "contenu_deja_expire",
        "ancien_prix_incoherent",
        "reduction_incoherente",
        "source_non_officielle",
    }
    review_blocking_errors = {
        "date_fin_absente",
        "portee_geographique_absente",
        "prix_promo_ambigu",
        "produit_non_identifie",
        "date_evenement_imprecise",
    }

    if any(error in hard_reject_errors for error in errors):
        status = "rejected"
    elif any(error in review_blocking_errors for error in errors):
        status = "needs_review"
    elif errors:
        status = "needs_review" if score >= 75 else "rejected"
    else:
        status = "approved" if score >= 95 else "needs_review"
    return score, reasons, errors, status
