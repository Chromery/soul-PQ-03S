#!/usr/bin/env python3
"""Reproducible exploratory analysis; outputs remain private in .research.

No fitted national probability or realized financial benefit is claimed. Explicit
property outcomes are labels; neutral/suspended rows are never negative examples.
"""
from collections import Counter, defaultdict
import csv
import json
import math
import os
from pathlib import Path
import random
import re
import statistics as st

ROOT = Path(__file__).resolve().parents[2]
SHEETS = {"A0": (841, 1189), "A1": (594, 841), "A2": (420, 594), "A3": (297, 420), "A4": (210, 297)}
OUTSIDE = {"sistemazione-esterna", "verde", "parcheggio-esterno"}


def number(value):
    if value is None or value == "" or isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.strip().replace("€", "").replace(" ", "")
        if "," in value:
            value = value.replace(".", "").replace(",", ".")
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def category(raw):
    match = re.search(r"([A-F])\s*/\s*(\d+)", (raw or "").upper())
    return f"{match[1]}/{int(match[2])}" if match else "UNKNOWN"


def label(raw):
    return {"positivo": 1, "negativo": 0}.get((raw or "").lower().strip())


def band(rent):
    if rent is None or rent <= 0:
        return "missing"
    return "<20k" if rent < 20000 else "20-50k" if rent < 50000 else "50-100k" if rent < 100000 else ">=100k"


def selection_area(selection, payload):
    override = number(selection.get("areaOverrideM2"))
    if override is not None:
        return override
    pixels = number(selection.get("totalPixels"))
    if not pixels or pixels <= 0:
        return 0
    page = (payload.get("pageScales") or {}).get(str(selection.get("page")), {})
    sheet = page.get("sheetSize") or payload.get("sheetSize")
    scale = number(page.get("scaleDenominator") or payload.get("scaleDenominator"))
    if sheet not in SHEETS or not scale:
        return None
    width, height = SHEETS[sheet]
    return selection.get("region", {}).get("count", 0) / pixels * width * height / 1e6 * scale ** 2


def geometry(draft):
    if not draft:
        return {}
    payload = draft["payload"]
    areas = defaultdict(float)
    for sel in payload.get("selections", []):
        area = selection_area(sel, payload)
        if area is None:
            return {"geometry_error": True}
        areas[sel.get("usageId", "unknown")] += area
    total = sum(areas.values())
    outside = sum(a for k, a in areas.items() if k in OUTSIDE)
    # Tettoie and custom usages remain separate: no universal conversion to covered area.
    covered = sum(a for k, a in areas.items() if k not in OUTSIDE | {"tettoie", "custom", "unknown"})
    payload_total = number(payload.get("totalArea"))
    selected_pages = {str(sel.get("page")) for sel in payload.get("selections", [])}
    pages = [(payload.get("pageScales") or {}).get(page, payload) for page in selected_pages]
    custom_labels = {u.get("id"): u.get("label") or "" for u in payload.get("customUsages", [])}
    # Historical fields named areaOverrideM2 also store rooms, seats and volumes.
    # Detect explicit quantity labels even when their unit price is below 2,000.
    explicit_non_sqm = any(re.search(r"\b(?:mc|m3|m³|posti|camere)\b|\ba\s+camera\b",
        " ".join([s.get("customUsageLabel") or "", custom_labels.get(s.get("customUsageId"), "")]), re.I)
        for s in payload.get("selections", []))
    return {"area": total, "covered_area": covered, "outside_area": outside,
            "outside_share": outside / total if total else None,
            "office_share": areas["uffici"] / covered if covered else None,
            "shed_share": areas["capannone"] / covered if covered else None,
            "custom_share": areas["custom"] / total if total else None,
            "usage_areas": dict(areas),
            "possible_non_sqm_units": explicit_non_sqm or any((number(s.get("rate")) or 0) > 2000 and number(s.get("areaOverrideM2")) is not None for s in payload.get("selections", [])),
            "area_reconciliation_error": abs(total - payload_total) if payload_total is not None else None,
            "scale_sources": sorted({p.get("scaleSource", "UNKNOWN") for p in pages}),
            "scale_vs_ai_mismatch": any(number(p.get("aiScaleDenominator")) and
                abs(float(p["scaleDenominator"]) / float(p["aiScaleDenominator"]) - 1) > .1 for p in pages)}


def estimate(p, draft, group_has_draft, overrides):
    # Mirrors current service precedence, but zero/missing proposals are not savings.
    explicit = f'{p["id"]}:renditaAttribuibile'
    if explicit in overrides:
        return number(overrides[explicit]), "presentation_override"
    if not draft or group_has_draft:
        value = number(p["estimatedRendita"])
        return (value if value and value > 0 else None), "stored_group_or_property"
    payload = draft["payload"]
    base, oneri, lot = (number(payload.get(k)) for k in ["totalBaseAmount", "totalOneriAmount", "totalLotValue"])
    if base is not None:
        value = .02 * (base + (oneri if oneri is not None else base * .4 if p["oneri"] else 0) + (lot or 0))
    elif p["oneri"] and number(payload.get("totalEstimatedAmount")) is not None:
        value = .02 * (max(0, number(payload["totalEstimatedAmount"]) - (lot or 0)) * 1.4 + (lot or 0))
    else:
        value = number(payload.get("totalEstimatedRendita"))
        if value is None and number(payload.get("totalEstimatedAmount")) is not None:
            value = .02 * number(payload["totalEstimatedAmount"])
        if value is None:
            value = number(draft.get("totalEstimatedValue"))
    return (value if value and value > 0 else None), "analysis_draft"


def describe(values):
    values = sorted(v for v in values if v is not None and math.isfinite(v))
    if not values:
        return {"n": 0}
    return {"n": len(values), "min": min(values), "median": st.median(values), "max": max(values)}


def auc(rows, score):
    pairs = sorted((score(r), r["y"]) for r in rows if r["y"] is not None and score(r) is not None)
    positive = sum(y for _, y in pairs)
    negative = len(pairs) - positive
    if not positive or not negative:
        return None
    credit = 0
    seen_negatives = 0
    index = 0
    while index < len(pairs):
        end = index
        while end < len(pairs) and pairs[end][0] == pairs[index][0]:
            end += 1
        pos = sum(y for _, y in pairs[index:end])
        neg = end - index - pos
        credit += pos * (seen_negatives + neg / 2)
        seen_negatives += neg
        index = end
    return credit / (positive * negative)


def bootstrap(rows, statistic, repetitions=1000):
    clusters = defaultdict(list)
    for row in rows:
        clusters[row["cluster"]].append(row)
    groups = [clusters[key] for key in sorted(clusters)]
    if len(groups) < 2:
        return None
    rng = random.Random(20261015)
    values = []
    for _ in range(repetitions):
        sample = [r for g in rng.choices(groups, k=len(groups)) for r in g]
        value = statistic(sample)
        if value is not None and math.isfinite(value):
            values.append(value)
    if not values:
        return None
    values.sort()
    return [values[int(.025 * (len(values) - 1))], values[int(.975 * (len(values) - 1))]]


def proportion(rows):
    return sum(r["y"] for r in rows) / len(rows) if rows else None


def table(rows, key):
    result = []
    for value in sorted({str(key(r)) for r in rows}):
        selected = [r for r in rows if str(key(r)) == value]
        result.append({"value": value, "n": len(selected), "positive": sum(r["y"] for r in selected),
                       "clusters": len({r["cluster"] for r in selected}), "positive_rate": proportion(selected),
                       "cluster_bootstrap_95": bootstrap(selected, proportion, 500) if len({r["y"] for r in selected}) > 1 else None})
    return result


def validate(rows):
    """Repeated 5-fold grouped validation; rank within held-out folds.

    Pooled leave-one-out rankings are inappropriate here: tiny changes in a bin's
    training prevalence can reverse the ranking inside that bin. Each validation
    fold is scored by ONE model; no outcome-dependent tie-breaking is used.
    """
    predictions = []
    folds = []
    for repeat in range(10):
        clusters = sorted({r["cluster"] for r in rows})
        random.Random(20261015 + repeat).shuffle(clusters)
        assignment = {c: i % 5 for i, c in enumerate(clusters)}
        for fold in range(5):
            train = [r for r in rows if assignment[r["cluster"]] != fold]
            validation = [r for r in rows if assignment[r["cluster"]] == fold]
            assert not ({r["cluster"] for r in train} & {r["cluster"] for r in validation})
            prior = (sum(r["y"] for r in train) + 1) / (len(train) + 2)
            fold_predictions = []
            for row in validation:
                by_rent = [r for r in train if band(r["rent"]) == band(row["rent"])]
                by_cat = [r for r in train if r["category"] == row["category"]]
                joint = [r for r in by_rent if r["category"] == row["category"]]
                rent_score = (sum(r["y"] for r in by_rent) + 10 * prior) / (len(by_rent) + 10)
                category_score = (sum(r["y"] for r in by_cat) + 10 * prior) / (len(by_cat) + 10)
                combined = (sum(r["y"] for r in joint) + 10 * rent_score) / (len(joint) + 10)
                fold_predictions.append(dict(row, repeat=repeat, fold=fold, prior_score=prior, rent_score=rent_score, category_score=category_score, combined_score=combined))
            predictions.extend(fold_predictions)
            folds.append(fold_predictions)
    metrics = {}
    for name in ["prior", "rent", "category", "combined"]:
        key = f"{name}_score"
        values = [v for fold in folds if (v := auc(fold, lambda r: r[key])) is not None]
        expected_positive = slots = 0
        for fold in folds:
            ordered = sorted(fold, key=lambda r: -r[key])
            k = max(1, math.ceil(.2 * len(ordered)))
            cutoff = ordered[k-1][key]
            above = [r for r in ordered if r[key] > cutoff]
            tied = [r for r in ordered if r[key] == cutoff]
            expected_positive += sum(r["y"] for r in above) + (k-len(above))*proportion(tied)
            slots += k
        metrics[name] = {"mean_held_out_fold_auc": st.mean(values),
                         "brier": st.mean((r[key] - r["y"]) ** 2 for r in predictions),
                         "top20percent_precision_tie_weighted": expected_positive / slots}
    metrics["design"] = {"folds": 5, "repeats": 10, "group": "connected study/company/cadastral-asset cluster", "base_rate": proportion(rows), "thresholds": [20000, 50000, 100000], "pseudocount": 10}
    return metrics, predictions


def write_csv(path, rows):
    if not rows:
        return
    fields = list(dict.fromkeys(k for row in rows for k in row))
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v for k, v in row.items()})


def main():
    os.umask(0o077)
    base = ROOT / ".research"
    dest = base / (base / "LATEST").read_text().strip()
    data = json.loads((dest / "cohort.json").read_text())
    studies = {s["id"]: s for s in data["FeasibilityStudy"]}
    assert all(not s["isTest"] for s in studies.values())
    drafts = {d["propertyId"]: d for d in data["PlanAnalysisDraft"]}
    group_drafts = {d["valuationGroupId"]: d for d in data["PropertyValuationGroupAnalysisDraft"]}
    overrides = {d["studyId"]: d["overrides"] for d in data["PresentationDraft"] if d.get("studyId")}
    group_overrides = {d["studyGroupId"]: d["overrides"] for d in data["PresentationDraft"] if d.get("studyGroupId")}
    documents = defaultdict(list)
    for doc in data["PropertyDocument"]:
        documents[doc["propertyId"]].append(doc)

    # Connected components prevent shared cadastral assets, VATs and explicit study
    # groups from appearing in both training and validation. Undocumented corporate
    # relationships remain a limitation and must be collected for the next dataset.
    parents = {sid: sid for sid in studies}
    def find(sid):
        while parents[sid] != sid:
            parents[sid] = parents[parents[sid]]
            sid = parents[sid]
        return sid
    def merge(a, b):
        first, second = sorted([find(a), find(b)])
        parents[second] = first
    seen = {}
    for s in studies.values():
        for field in ["vat", "studyGroupId"]:
            if s.get(field):
                key = (field, s[field])
                if key in seen:
                    merge(s["id"], seen[key])
                seen[key] = s["id"]
    asset_studies = defaultdict(set)
    for p in data["Property"]:
        if p.get("codiceComuneCatastale") and p.get("foglio") and p.get("particella") and p.get("subalterno") is not None:
            key = tuple(str(p.get(f) or "").strip().upper() for f in ["codiceComuneCatastale", "sezioneCatastale", "foglio", "particella", "subalterno"])
            asset_studies[key].add(p["studyId"])
    for sids in asset_studies.values():
        for sid in sids:
            merge(min(sids), sid)

    # Optional human-verified family links from the source notes. They control only
    # validation partitions, never prediction features. Keep this evidence private.
    manual_path = dest / "cluster-overrides.json"
    manual_groups = json.loads(manual_path.read_text()) if manual_path.exists() else []
    for group in manual_groups:
        sids = group["study_ids"]
        if not sids or any(sid not in studies for sid in sids):
            raise ValueError("Invalid manually verified cluster membership")
        for sid in sids:
            merge(min(sids), sid)

    rows = []
    for p in data["Property"]:
        s = studies[p["studyId"]]
        own = overrides.get(p["studyId"], {})
        proposal, proposal_source = estimate(p, drafts.get(p["id"]), p["valuationGroupId"] in group_drafts, own)
        rent = number(p["currentRendita"])
        presentation_current = number(own.get(f'{p["id"]}:renditaAttuale', p["currentRendita"]))
        # Never fill a missing proposed value with zero.
        saving = presentation_current - proposal if proposal is not None and proposal > 0 and presentation_current is not None else None
        geom = geometry(drafts.get(p["id"])) if not p["valuationGroupId"] else {}
        row = {"id": p["id"], "study_id": p["studyId"], "company": s["company"], "vat": s["vat"],
               "cluster": find(p["studyId"]), "created_year": s["createdAt"][:4], "study_status": s["status"],
               "category": category(p["categoria"]), "category_raw": p["categoria"], "province": p["provincia"],
               "municipality": p["comune"], "group_id": p["valuationGroupId"], "outcome": p["outcome"], "y": label(p["outcome"]),
               "rent": rent, "proposed_rent": proposal, "proposal_source": proposal_source, "rent_reduction": saving,
               "reduction_fraction": saving / presentation_current if saving is not None and presentation_current else None,
               "has_study": p["hasStudy"], "has_visura": any(d["type"] == "VISURA" for d in documents[p["id"]]),
               "has_plan": any(d["type"] == "PLANIMETRIA" for d in documents[p["id"]]),
               "study_group_override_present": bool(group_overrides.get(s.get("studyGroupId"))), **geom}
        row["rent_per_covered_sqm"] = rent / geom["covered_area"] if geom.get("covered_area", 0) > 0 and (geom.get("custom_share") or 0) < .1 else None
        rows.append(row)

    evaluated = [r for r in rows if r["y"] is not None]
    units = []
    members = defaultdict(list)
    for r in rows:
        members[r["group_id"] or r["id"]].append(r)
    for uid, group in members.items():
        if any(r["y"] is None for r in group) or len({r["y"] for r in group}) != 1:
            continue
        first = group[0]
        geom = geometry(group_drafts.get(uid)) if len(group) > 1 else {k: first[k] for k in geometry(drafts.get(first["id"])) if k in first}
        cats = sorted({r["category"] for r in group})
        units.append({**first, **geom, "id": uid, "member_ids": [r["id"] for r in group], "members": len(group),
                      "rent": sum(r["rent"] or 0 for r in group), "category": "+".join(cats)})
        if len(group) > 1:
            # The first member's proposal is not the group's proposal. Financial
            # group figures require the exact-member matching in economics.py.
            units[-1].update(proposed_rent=None,
                             proposal_source="requires_exact_membership_presentation",
                             rent_reduction=None, reduction_fraction=None)
    for r in units:
        r["rent_per_covered_sqm"] = r["rent"] / r["covered_area"] if r.get("covered_area", 0) > 0 and (r.get("custom_share") or 0) < .1 and not r.get("possible_non_sqm_units") and r["category"] in {"D/1", "D/7", "D/8"} else None
    cv, predictions = validate(units)
    recent_units = [r for r in units if r["created_year"] == "2026"]
    cv_recent, _ = validate(recent_units)
    within = []
    for sid in studies:
        sample = [r for r in units if r["study_id"] == sid]
        value = auc(sample, lambda r: r["rent"])
        if value is not None:
            within.append(value)

    positive = [r for r in rows if r["y"] == 1]
    study_notes = {sid: s["notes"] for sid, s in studies.items()}
    findings = {
        "snapshot": json.loads((dest / "manifest.json").read_text()),
        "cohort_audit": data["cohort_audit"],
        "counts": {"studies": len(studies), "properties": len(rows), "labelled_properties": len(evaluated),
                   "labelled_units": len(units), "labelled_unit_positive": sum(r["y"] for r in units),
                   "study_clusters": len({find(sid) for sid in studies}),
                   "manual_corporate_family_groups": len(manual_groups),
                   "distinct_cadastral_keys_repeated_across_studies": sum(len(sids) > 1 for sids in asset_studies.values()),
                   "outcomes": dict(Counter(r["outcome"] for r in rows)),
                   "positive_properties_in_positive_studies": sum(r["study_status"] == "Positiva" for r in positive),
                   "positive_studies_without_positive_properties": sum(s["status"] == "Positiva" and not any(r["study_id"] == s["id"] for r in positive) for s in studies.values()),
                   "noncanonical_categories": sum(p["categoria"] != category(p["categoria"]) for p in data["Property"]),
                   "documents": len(data["PropertyDocument"]), "document_types": dict(Counter(d["type"] for d in data["PropertyDocument"])),
                   "plan_drafts": len(drafts), "group_drafts": len(group_drafts), "visura_jobs": len(data["VisuraExtractionJob"])},
        "property_by_rent": table(evaluated, lambda r: band(r["rent"])),
        "property_by_category": table(evaluated, lambda r: r["category"]),
        "unit_by_rent": table(units, lambda r: band(r["rent"])),
        "unit_by_category": table(units, lambda r: r["category"]),
        "unit_2026_by_rent": table(recent_units, lambda r: band(r["rent"])),
        "unit_by_created_year": table(units, lambda r: r["created_year"]),
        "rent_median_by_outcome": {name: describe([r["rent"] for r in rows if r["outcome"] == name]) for name in ["Positivo", "Negativo"]},
        "unit_rent_auc": auc(units, lambda r: r["rent"]),
        "unit_rent_auc_cluster_bootstrap_95": bootstrap(units, lambda rs: auc(rs, lambda r: r["rent"])),
        "unit_2026_rent_auc": auc(recent_units, lambda r: r["rent"]),
        "within_study_rent_auc": {"studies_with_both_outcomes": len(within), "mean_auc": st.mean(within) if within else None},
        "exploratory_grouped_validation": cv, "exploratory_2026_grouped_validation": cv_recent,
        "geometry_by_outcome": {str(y): {key: describe([r.get(key) for r in units if r["y"] == y])
                 for key in ["covered_area", "rent_per_covered_sqm", "outside_share", "office_share", "shed_share"]} for y in [0, 1]},
        "rent_per_covered_sqm_auc": auc(units, lambda r: r.get("rent_per_covered_sqm")),
        "draft_geometry_audit": {"max_area_reconciliation_error": max((r.get("area_reconciliation_error") or 0 for r in rows), default=0),
              "drafts_with_used_scale_vs_ai_mismatch": sum(bool(r.get("scale_vs_ai_mismatch")) for r in rows),
              "scale_sources": dict(Counter(src for r in rows for src in r.get("scale_sources", [])))},
        "positive_property_proposals": {"known_arithmetic_not_additive_across_groups": sum(r["rent_reduction"] is not None for r in positive),
              "missing_property_allocations": sum(r["rent_reduction"] is None for r in positive),
              "source_counts": dict(Counter(r["proposal_source"] for r in positive)),
              "standalone_reduction_fraction": describe([r["reduction_fraction"] for r in positive if not r["group_id"]]),
              "grouped_property_rows_not_suitable_for_financial_sums": sum(bool(r["group_id"]) for r in positive)},
        "notes_keyword_counts_are_post_decision": {term: dict(Counter(studies[sid]["status"] for sid, text in study_notes.items() if re.search(pattern, text, re.I)))
              for term, pattern in {"ruralita": "rural", "scorporo": "scorpor", "contenzioso": "cont[ea]nz", "rettifica": "rettific", "black_list": r"black\s*list", "superfici_da_verificare": r"verificar.{0,30}sup|approfondir.{0,30}sup"}.items()},
        "limitations": ["Selected feasibility outcomes, not accepted cadastral changes or sales.",
              "Manual geometry, rates, proposals and notes are post-decision; excluded from the validation predictors.",
              "Current rows are not historical as-of snapshots. Current rent/category may have been edited.",
              "Created year denotes study origin, not date of independent outcome observation.",
              "Corporate families missing from explicit study groups may still cross clusters.",
              "Validation is exploratory on a selected small sample; scores are not calibrated national probabilities.",
              "Presentation group overrides are flagged, not silently allocated to individual subalterni."]}
    (dest / "findings.json").write_text(json.dumps(findings, ensure_ascii=False, indent=2) + "\n")
    write_csv(dest / "properties.csv", rows)
    write_csv(dest / "evaluated-units.csv", units)
    write_csv(dest / "exploratory-cv.csv", predictions)
    write_csv(dest / "positive-property-audit.csv", positive)
    # Explicit baseline queue for collecting evidence, NOT a probability ranking.
    candidates = sorted([r for r in rows if r["outcome"] == "Neutro" and r["category"].startswith("D/") and r["category"] != "D/10" and (r["rent"] or 0) > 0], key=lambda r: (-r["rent"], r["id"]))
    write_csv(dest / "baseline-document-review-queue.csv", [{"rank_by_current_rent": i+1, "property_id": r["id"], "study_id": r["study_id"], "company": r["company"], "category": r["category"], "rent": r["rent"], "has_visura": r["has_visura"], "has_plan": r["has_plan"], "probability": "", "expected_saving": "", "next_action": "verify eligibility, ownership, rurality, existing revisions and document coverage"} for i, r in enumerate(candidates)])
    findings["baseline_queue_count"] = len(candidates)
    (dest / "findings.json").write_text(json.dumps(findings, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: findings[k] for k in ["counts", "unit_by_rent", "unit_2026_by_rent", "unit_rent_auc", "unit_rent_auc_cluster_bootstrap_95", "within_study_rent_auc", "exploratory_grouped_validation", "exploratory_2026_grouped_validation", "positive_property_proposals", "baseline_queue_count"]}, indent=2))


if __name__ == "__main__":
    main()
