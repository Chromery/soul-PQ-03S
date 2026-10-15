#!/usr/bin/env python3
"""Compare candidate signals on the same documented cohort, with grouped folds.

Exploratory follow-up to the first analysis: neither causal effects nor calibrated
national probabilities. Documents and geometry may postdate the original decision.
Private row-level outputs stay in .research. No production access is performed.
"""
from collections import Counter, defaultdict
import csv
import json
import math
import os
from pathlib import Path
import random
import statistics as st

from analyze import auc, band, number, proportion, write_csv

ROOT = Path(__file__).resolve().parents[2]


def documented_units(units, features):
    by_property = defaultdict(list)
    for feature in features:
        by_property[str(feature["property_id"])].append(feature)
    rows = []
    incomplete = []
    for unit in units:
        ids = json.loads(unit["member_ids"])
        documents = [f for pid in ids for f in by_property[pid]]
        # An absent/undecodable document is not evidence of an absent indicator.
        if not all(by_property[pid] and all(f["current_state_found"] for f in by_property[pid]) for pid in ids):
            incomplete.append(unit["id"])
            continue
        rows.append({**unit, "y": int(unit["y"]), "rent": float(unit["rent"]),
                     "rectified": any(f["current_rent_rectified"] for f in documents),
                     "rurality_mention": any(f["history_rurality_mention"] for f in documents),
                     "article22_revision": any(f["history_article22_revision"] for f in documents),
                     "litigation_mention": any(f["history_litigation_mention"] for f in documents)})
    return rows, incomplete


def counts(rows):
    return {"n": len(rows), "positive": sum(r["y"] for r in rows),
            "studies": len({r["study_id"] for r in rows}),
            "clusters": len({r["cluster"] for r in rows}), "positive_fraction": proportion(rows)}


def by_feature(rows, feature):
    return {str(value): counts([r for r in rows if r[feature] == value]) for value in [False, True]}


def stratified_rectification(rows):
    """Descriptive Mantel-Haenszel odds ratio; sparse strata remain visible.

    This adjustment does not remove selection bias, establish causation, or
    account for dependence within company clusters. No inferential p-value.
    """
    strata = []
    numerator = denominator = 0.0
    for cat, rent_band in sorted({(r["category"], band(r["rent"])) for r in rows}):
        group = [r for r in rows if (r["category"], band(r["rent"])) == (cat, rent_band)]
        yes, no = ([r for r in group if r["rectified"] == value] for value in [True, False])
        a, b = sum(r["y"] for r in yes), sum(1-r["y"] for r in yes)
        c, d = sum(r["y"] for r in no), sum(1-r["y"] for r in no)
        if yes and no:
            numerator += a*d/len(group)
            denominator += b*c/len(group)
        strata.append({"category": cat, "rent_band": rent_band,
                       "rectified_positive": a, "rectified_negative": b,
                       "other_positive": c, "other_negative": d})
    return {"strata": strata, "descriptive_mh_odds_ratio": numerator/denominator if denominator else None}


def evaluate_models(rows):
    names = ["rent", "rent_rectified", "rent_category", "rent_category_rectified"]
    folds = []
    for repeat in range(10):
        clusters = sorted({r["cluster"] for r in rows})
        random.Random(20261015 + repeat).shuffle(clusters)
        assignment = {cluster: i % 5 for i, cluster in enumerate(clusters)}
        for fold in range(5):
            train = [r for r in rows if assignment[r["cluster"]] != fold]
            test = [r for r in rows if assignment[r["cluster"]] == fold]
            if not train or not test:
                continue
            assert not ({r["cluster"] for r in train} & {r["cluster"] for r in test})
            prior = (sum(r["y"] for r in train)+1)/(len(train)+2)
            predicted = []
            for row in test:
                by_rent = [r for r in train if band(r["rent"]) == band(row["rent"])]
                by_cat = [r for r in by_rent if r["category"] == row["category"]]
                by_rent_rectified = [r for r in by_rent if r["rectified"] == row["rectified"]]
                by_cat_rectified = [r for r in by_cat if r["rectified"] == row["rectified"]]
                def shrink(sample, parent):
                    return (sum(r["y"] for r in sample) + 10*parent)/(len(sample)+10)
                rent = shrink(by_rent, prior)
                rent_cat = shrink(by_cat, rent)
                predicted.append({**row, "repeat": repeat, "fold": fold,
                                  "rent_score": rent,
                                  "rent_rectified_score": shrink(by_rent_rectified, rent),
                                  "rent_category_score": rent_cat,
                                  "rent_category_rectified_score": shrink(by_cat_rectified, rent_cat)})
            folds.append(predicted)
    metrics = {}
    for name in names:
        key = name + "_score"
        values = [v for fold in folds if (v := auc(fold, lambda r: r[key])) is not None]
        hits = slots = 0
        for fold in folds:
            ordered = sorted(fold, key=lambda r: -r[key])
            k = max(1, math.ceil(.2*len(ordered)))
            cutoff = ordered[k-1][key]
            above = [r for r in ordered if r[key] > cutoff]
            tied = [r for r in ordered if r[key] == cutoff]
            hits += sum(r["y"] for r in above) + (k-len(above))*proportion(tied)
            slots += k
        metrics[name] = {"mean_held_out_fold_auc": st.mean(values) if values else None,
                         "brier": st.mean((r[key]-r["y"])**2 for fold in folds for r in fold),
                         "top20percent_precision_tie_weighted": hits/slots}
    return metrics, [r for fold in folds for r in fold]


def comparable_geometry_pairs(units):
    """Illustrations, not independent validation: same study/category, rent <=1.5x.

    The covered areas come from manual evaluation, not blind plan extraction.
    Retain all eligible pairs, including counterexamples; never pick by ratio gap.
    """
    eligible = [u for u in units if number(u["rent_per_covered_sqm"]) is not None and float(u["rent"]) > 0]
    pairs = []
    for positive in eligible:
        if positive["y"] != "1":
            continue
        for negative in eligible:
            if negative["y"] != "0" or (positive["study_id"], positive["category"]) != (negative["study_id"], negative["category"]):
                continue
            rent_ratio = max(float(positive["rent"]), float(negative["rent"]))/min(float(positive["rent"]), float(negative["rent"]))
            if rent_ratio > 1.5:
                continue
            row = {"study_id": positive["study_id"], "category": positive["category"], "rent_ratio": rent_ratio,
                   "same_municipality": positive["municipality"] == negative["municipality"],
                   "ratio_of_rent_per_sqm": float(positive["rent_per_covered_sqm"])/float(negative["rent_per_covered_sqm"])}
            for prefix, unit in [("positive", positive), ("negative", negative)]:
                for key in ["id", "rent", "covered_area", "rent_per_covered_sqm", "municipality", "member_ids"]:
                    row[f"{prefix}_{key}"] = unit[key]
            pairs.append(row)
    return sorted(pairs, key=lambda r: (r["rent_ratio"], r["positive_id"], r["negative_id"]))


def presentation_study_summary(data):
    """Reconcile T3's study-level figures, allocating shared decks by membership."""
    properties = {p["id"]: p for p in data["Property"]}
    latest = {}
    for deck in data["PresentationDeck"]:
        if deck.get("deletedAt"):
            continue
        key = (deck.get("studyId"), deck.get("studyGroupId"))
        if key not in latest or deck["createdAt"] > latest[key]["createdAt"]:
            latest[key] = deck
    result = []
    keys = ["renditaAttuale", "renditaAttribuibile", "imuAttuale", "imuOttenibile"]
    for study in data["FeasibilityStudy"]:
        if study["status"] != "Positiva":
            continue
        deck = latest.get((study["id"], None))
        if deck is None and study.get("studyGroupId"):
            deck = latest.get((None, study["studyGroupId"]))
        if deck is None:
            continue
        ids = {pid for pid in deck["propertyIds"] if properties[pid]["studyId"] == study["id"]}
        rows = []
        for row in deck["snapshot"].get("tableRows", deck["snapshot"].get("immobili", [])):
            members = set(row.get("memberIds") or [row["id"]])
            if members & ids and not members <= ids:
                raise ValueError("A presentation row spans studies; explicit financial allocation is required")
            if members <= ids:
                rows.append(row)
        covered = {pid for row in rows for pid in (row.get("memberIds") or [row["id"]])}
        if covered != ids or not rows or any(number(row.get(k)) is None for row in rows for k in keys):
            raise ValueError("Incomplete presentation figures or membership")
        if any(number(row[k]) <= 0 for row in rows for k in ["renditaAttribuibile", "imuOttenibile"]):
            raise ValueError("Missing/zero proposal requires explicit review")
        totals = {k: sum(number(row[k]) for row in rows) for k in keys}
        result.append({"study_id": study["id"], "deck_id": deck["id"], "snapshot_at": deck["createdAt"],
                       "selected_properties": len(ids),
                       "proposed_annual_imu_reduction": totals["imuAttuale"]-totals["imuOttenibile"],
                       "proposed_rent_reduction": totals["renditaAttuale"]-totals["renditaAttribuibile"],
                       "rent_reduction_fraction": 1-totals["renditaAttribuibile"]/totals["renditaAttuale"]})
    return {"studies": len(result), "selected_property_counts": dict(Counter(r["selected_properties"] for r in result)),
            "median_proposed_annual_imu_reduction": st.median(r["proposed_annual_imu_reduction"] for r in result),
            "minimum_proposed_annual_imu_reduction": min(r["proposed_annual_imu_reduction"] for r in result),
            "median_proposed_rent_reduction": st.median(r["proposed_rent_reduction"] for r in result),
            "median_rent_reduction_fraction": st.median(r["rent_reduction_fraction"] for r in result)}, result


def main():
    os.umask(0o077)
    base = ROOT / ".research"
    dest = base/(base/"LATEST").read_text().strip()
    with (dest/"evaluated-units.csv").open() as handle:
        units = list(csv.DictReader(handle))
    features = json.loads((dest/"visura-features.json").read_text())
    data = json.loads((dest/"cohort.json").read_text())
    rows, excluded = documented_units(units, features)
    summary = {"design": {"snapshot": dest.name, "folds": 5, "repeats": 10, "seed": 20261015,
                          "rent_bands": [20000, 50000, 100000], "pseudocount": 10,
                          "group": "existing connected company/study/cadastral-asset clusters",
                          "rectified_group_rule": "any current member state; require readable current state for every member",
                          "selection": "hypotheses chosen after inspecting this same cohort; exploratory CV only",
                          "excludes_unlabelled": True, "no_feature_from_geometry_or_notes_in_cv": True},
               "excluded_for_incomplete_current_visura": len(excluded), "samples": {}}
    for name, sample in [("all_documented", rows), ("study_created_2026", [r for r in rows if r["created_year"] == "2026"])]:
        metrics, predictions = evaluate_models(sample)
        summary["samples"][name] = {"counts": counts(sample),
            "features": {key: by_feature(sample, key) for key in ["rectified", "rurality_mention", "article22_revision", "litigation_mention"]},
            "rectified_by_rent_band": {b: by_feature([r for r in sample if band(r["rent"]) == b], "rectified") for b in ["<20k", "20-50k", "50-100k", ">=100k"]},
            "stratified": stratified_rectification(sample), "exploratory_cv": metrics}
        write_csv(dest/f"refined-cv-{name}.csv", predictions)
    pairs = comparable_geometry_pairs(units)
    write_csv(dest/"comparable-geometry-pairs.csv", pairs)
    summary["geometry_pairs"] = {"pairs": len(pairs), "studies": len({p["study_id"] for p in pairs}),
                                 "same_municipality_pairs": sum(p["same_municipality"] for p in pairs),
                                 "manual_geometry_not_predictive_validation": True}
    summary["t3_positive_presentations"], presentation_rows = presentation_study_summary(data)
    write_csv(dest/"t3-study-presentations.csv", presentation_rows)
    (dest/"refined-findings.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False)+"\n")
    print(json.dumps({"counts": counts(rows), "geometry_pairs": summary["geometry_pairs"],
                      "cv": {name: sample["exploratory_cv"] for name, sample in summary["samples"].items()}}, indent=2))


if __name__ == "__main__":
    main()
