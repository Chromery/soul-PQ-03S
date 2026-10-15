#!/usr/bin/env python3
"""Explore annotated space composition, with company-grouped validation.

Geometry, usage assignments and valuations are products of the technician's work.
Validation here studies the potential of those measurements, NOT an automated
document extractor. No production access, new financial appraisal or deployment.
"""
from collections import Counter, defaultdict
import csv
import json
import math
import os
from pathlib import Path
import random
import statistics as st

from analyze import auc, band, bootstrap, describe, number, selection_area, write_csv

ROOT = Path(__file__).resolve().parents[2]
COMPOSITION = ["office_fraction", "external_ratio_log", "basement_fraction", "canopy_ratio_log"]
MODELS = {
    "rent": ["log_rent"],
    "rent_category": ["log_rent", "is_d7", "is_d8"],
    "rent_category_size": ["log_rent", "is_d7", "is_d8", "log_covered"],
    "rent_category_composition": ["log_rent", "is_d7", "is_d8", *COMPOSITION],
    "rent_category_size_composition": ["log_rent", "is_d7", "is_d8", "log_covered", *COMPOSITION],
}


def solve(matrix, vector):
    """Small positive-definite systems, with pivoting; no external dependencies."""
    size = len(vector)
    a = [list(row) + [value] for row, value in zip(matrix, vector)]
    for col in range(size):
        pivot = max(range(col, size), key=lambda row: abs(a[row][col]))
        a[col], a[pivot] = a[pivot], a[col]
        if abs(a[col][col]) < 1e-12:
            raise ValueError("Singular fit")
        divisor = a[col][col]
        a[col] = [value/divisor for value in a[col]]
        for row in range(size):
            if row == col:
                continue
            factor = a[row][col]
            a[row] = [x-factor*y for x, y in zip(a[row], a[col])]
    return [row[-1] for row in a]


def sigmoid(value):
    return 1/(1+math.exp(-max(-40, min(40, value))))


def fit(rows, keys, penalty=2.0):
    # All scaling parameters are learned on the training partition only.
    means = [st.mean(row[key] for row in rows) for key in keys]
    scales = [st.pstdev(row[key] for row in rows) or 1.0 for key in keys]
    x = [[1.0] + [(row[key]-mean)/scale for key, mean, scale in zip(keys, means, scales)] for row in rows]
    dimension = len(keys)+1
    positives = sum(row["y"] for row in rows)
    beta = [math.log((positives+.5)/(len(rows)-positives+.5))] + [0.0]*len(keys)
    converged = False
    for iteration in range(50):
        gradient = [0.0]*dimension
        hessian = [[0.0]*dimension for _ in range(dimension)]
        for vector, row in zip(x, rows):
            probability = sigmoid(sum(b*v for b, v in zip(beta, vector)))
            weight = max(1e-8, probability*(1-probability))
            for i in range(dimension):
                gradient[i] += (probability-row["y"])*vector[i]
                for j in range(dimension):
                    hessian[i][j] += weight*vector[i]*vector[j]
        for i in range(1, dimension):
            gradient[i] += penalty*beta[i]
            hessian[i][i] += penalty
        # Tiny intercept ridge guarantees a finite fit for one-class folds.
        gradient[0] += 1e-6*beta[0]
        hessian[0][0] += 1e-6
        step = solve(hessian, gradient)
        # Step damping prevents overshoot on sparse, near-separable samples.
        damping = min(1.0, 5/max(5, max(abs(v) for v in step)))
        beta = [b-damping*s for b, s in zip(beta, step)]
        if max(abs(s*damping) for s in step) < 1e-7:
            converged = True
            break
    if not converged:
        raise ValueError("Logistic fit did not converge")
    return {"keys": keys, "means": means, "scales": scales, "beta": beta, "iterations": iteration+1}


def predict(model, row):
    values = [1.0] + [(row[key]-mean)/scale for key, mean, scale in zip(model["keys"], model["means"], model["scales"])]
    return sigmoid(sum(b*x for b, x in zip(model["beta"], values)))


def space_rows(units, data):
    drafts = {d["propertyId"]: d for d in data["PlanAnalysisDraft"]}
    drafts.update({d["valuationGroupId"]: d for d in data["PropertyValuationGroupAnalysisDraft"]})
    rows = []
    for unit in units:
        if number(unit["rent_per_covered_sqm"]) is None:
            continue
        areas = json.loads(unit["usage_areas"])
        covered = float(unit["covered_area"])
        rent, total = float(unit["rent"]), float(unit["area"])
        outside = float(unit["outside_area"])
        office, canopy = areas.get("uffici", 0), areas.get("tettoie", 0)
        basement = areas.get("interrato", 0)+areas.get("parcheggio-interrato", 0)
        row = {**unit, "y": int(unit["y"]), "rent": rent, "covered_area": covered,
               "rent_per_covered_sqm": rent/covered,
               "log_rent": math.log(rent), "log_covered": math.log(covered),
               "is_d7": float(unit["category"] == "D/7"), "is_d8": float(unit["category"] == "D/8"),
               "office_fraction": office/covered, "external_fraction": outside/total,
               "external_ratio_log": math.log1p(outside/covered),
               "basement_fraction": basement/covered, "canopy_ratio_log": math.log1p(canopy/covered),
               "shed_fraction": areas.get("capannone", 0)/covered,
               "has_offices": office >= 1, "has_basement": basement >= 1, "has_canopies": canopy >= 1,
               "has_commercial": areas.get("commerciale", 0) >= 1,
               "has_green": areas.get("verde", 0) >= 1,
               "outside_majority": outside/total >= .5, "office_ge10percent": office/covered >= .1,
               "shed_majority": areas.get("capannone", 0)/covered >= .5,
               "usage_count": sum(a >= 1 for a in areas.values()),
               "category": unit["category"]}
        payload = drafts[unit["id"]]["payload"]
        values = defaultdict(float)
        manual_area = 0.0
        for selection in payload.get("selections", []):
            area = selection_area(selection, payload)
            if area is None:
                raise ValueError("Eligible geometry has an unmeasurable selection")
            if number(selection.get("areaOverrideM2")) is not None:
                manual_area += area
            value = number(selection.get("amountOverride"))
            if value is None:
                rate = number(selection.get("rate"))
                if rate is None:
                    raise ValueError("Missing rate in value decomposition")
                value = area*rate
            values[selection.get("usageId", "unknown")] += value
        base = number(payload.get("totalBaseAmount"))
        if base is None or abs(sum(values.values())-base) > .1:
            raise ValueError("Value decomposition does not reconcile")
        lot = number(payload.get("totalLotValue")) or 0
        oneri = number(payload.get("totalOneriAmount")) or 0
        outside_value = sum(values[k] for k in ["sistemazione-esterna", "verde", "parcheggio-esterno"])
        row.update(manual_area_fraction=manual_area/total,
                   diagnostic_external_value_fraction=outside_value/base if base else None,
                   diagnostic_office_value_fraction=values["uffici"]/base if base else None,
                   diagnostic_lot_value_fraction=lot/(base+lot+oneri) if base+lot+oneri else None,
                   diagnostic_base_per_covered=base/covered,
                   diagnostic_rent_to_draft=rent/(.02*(base+lot+oneri)) if base+lot+oneri else None,
                   value_by_usage=dict(values), usage_areas=areas)
        rows.append(row)
    return rows


def describe_sample(rows):
    return {"n": len(rows), "positive": sum(r["y"] for r in rows),
            "studies": len({r["study_id"] for r in rows}), "clusters": len({r["cluster"] for r in rows}),
            "positive_fraction": sum(r["y"] for r in rows)/len(rows) if rows else None}


def binary_table(rows, key):
    return {str(value): describe_sample([r for r in rows if r[key] == value]) for value in [False, True]}


def cv(rows, penalty=2.0, repeats=10):
    predictions, folds = [], []
    for repeat in range(repeats):
        clusters = sorted({r["cluster"] for r in rows})
        random.Random(20261016+repeat).shuffle(clusters)
        assignment = {cluster: i % 5 for i, cluster in enumerate(clusters)}
        for fold in range(5):
            train = [r for r in rows if assignment[r["cluster"]] != fold]
            test = [r for r in rows if assignment[r["cluster"]] == fold]
            if not train or not test:
                continue
            assert not ({r["cluster"] for r in train} & {r["cluster"] for r in test})
            models = {name: fit(train, keys, penalty) for name, keys in MODELS.items()}
            scored = [{"unit_id": row["id"], "study_id": row["study_id"], "cluster": row["cluster"],
                       "y": row["y"], "repeat": repeat, "fold": fold,
                       **{name: predict(model, row) for name, model in models.items()}} for row in test]
            predictions.extend(scored)
            folds.append(scored)
    metrics = {}
    for name in MODELS:
        fold_auc = [v for fold in folds if (v := auc(fold, lambda r: r[name])) is not None]
        hits = slots = 0
        for fold in folds:
            ordered = sorted(fold, key=lambda r: -r[name])
            k = max(1, math.ceil(len(ordered)*.2))
            cutoff = ordered[k-1][name]
            above = [r for r in ordered if r[name] > cutoff]
            tied = [r for r in ordered if r[name] == cutoff]
            hits += sum(r["y"] for r in above)+(k-len(above))*st.mean(r["y"] for r in tied)
            slots += k
        metrics[name] = {"mean_fold_auc": st.mean(fold_auc) if fold_auc else None,
                         "brier": st.mean((r[name]-r["y"])**2 for r in predictions),
                         "top20percent_precision": hits/slots}
    return metrics, predictions


def same_study_comparisons(rows):
    results = []
    for study in sorted({r["study_id"] for r in rows}):
        sample = [r for r in rows if r["study_id"] == study]
        if len({r["y"] for r in sample}) != 2:
            continue
        results.append({"study_id": study, "units": len(sample),
                        **{key: auc(sample, lambda r: r[key]) for key in ["rent", "rent_per_covered_sqm", "office_fraction", "external_fraction"]}})
    return results


def capture_audit(data):
    labelled = [p for p in data["Property"] if p["outcome"] in {"Positivo", "Negativo"}]
    selections = [s for table in ["PlanAnalysisDraft", "PropertyValuationGroupAnalysisDraft"]
                  for draft in data[table] for s in draft["payload"].get("selections", [])]
    return {"labelled_properties": len(labelled),
            "labelled_property_notes_nonempty": sum(bool(p["notes"].strip()) for p in labelled),
            "labelled_property_current_imu_zero": sum(p["currentImu"] == 0 for p in labelled),
            "draft_statuses": dict(Counter(d["status"] for d in data["PlanAnalysisDraft"])),
            "study_version_count_distribution": dict(Counter(Counter(v["studyId"] for v in data["StudyVersion"]).values())),
            "valuation_group_revisions": len(data["PropertyValuationGroupRevision"]),
            "selections": len(selections), "with_price_provenance": sum(bool(s.get("priceProvenance")) for s in selections),
            "with_explicit_quantity_unit": sum(any(k in s for k in ["quantityUnit", "unit", "unitOfMeasure"]) for s in selections)}


def main():
    os.umask(0o077)
    base = ROOT/".research"
    dest = base/(base/"LATEST").read_text().strip()
    data = json.loads((dest/"cohort.json").read_text())
    with (dest/"evaluated-units.csv").open() as handle:
        units = list(csv.DictReader(handle))
    rows = space_rows(units, data)
    write_csv(dest/"space-features.csv", rows)
    summary = {"design": {"manual_measurements": True, "not_a_blind_extractor_validation": True,
                          "sample_selection": "D1/D7/D8, measured covered area, custom share <10%, no flagged non-sqm quantities",
                          "grouping": "connected study/company/cadastral-asset cluster",
                          "model": "ridge logistic, train-only standardization, fixed penalty 2",
                          "penalty_sensitivity": [1, 5], "folds": 5, "repeats": 10, "seed": 20261016,
                          "models": MODELS, "no_value_components_or_notes_as_predictors": True,
                          "hypotheses_selected_on_same_dataset": True}, "samples": {}}
    for name, sample in [("eligible", rows), ("shed_majority", [r for r in rows if r["shed_majority"]]),
                         ("study_created_2026", [r for r in rows if r["created_year"] == "2026"]),
                         ("mostly_geometric", [r for r in rows if r["manual_area_fraction"] <= .1])]:
        metrics, predictions = cv(sample)
        write_csv(dest/f"space-cv-{name}.csv", predictions)
        binary = ["has_offices", "office_ge10percent", "has_basement", "has_canopies", "has_commercial", "has_green", "outside_majority", "shed_majority"]
        continuous = ["rent", "covered_area", "rent_per_covered_sqm", "office_fraction", "external_fraction", "basement_fraction",
                      "diagnostic_external_value_fraction", "diagnostic_office_value_fraction", "diagnostic_lot_value_fraction"]
        summary["samples"][name] = {"counts": describe_sample(sample),
            "binary": {key: binary_table(sample, key) for key in binary},
            "medians": {str(y): {key: describe([r[key] for r in sample if r["y"] == y]) for key in continuous} for y in [0, 1]},
            "by_rent_band": {b: {key: binary_table([r for r in sample if band(r["rent"]) == b], key) for key in binary}
                             for b in ["<20k", "20-50k", "50-100k", ">=100k"]},
            "exploratory_cv": metrics}
        print(name, json.dumps({"counts": describe_sample(sample), "cv": metrics}))
    summary["penalty_sensitivity_eligible"] = {str(penalty): cv(rows, penalty=penalty)[0] for penalty in [1, 5]}
    comparisons = same_study_comparisons(rows)
    write_csv(dest/"space-within-study.csv", comparisons)
    summary["within_study"] = {"studies": len(comparisons),
        "mean_auc": {key: st.mean(row[key] for row in comparisons) for key in ["rent", "rent_per_covered_sqm", "office_fraction", "external_fraction"]}}
    summary["rent_per_sqm_auc"] = {"value": auc(rows, lambda r: r["rent_per_covered_sqm"]),
        "cluster_bootstrap_95": bootstrap(rows, lambda rs: auc(rs, lambda r: r["rent_per_covered_sqm"]))}
    summary["full_sample_coefficients_diagnostic_only"] = {name: dict(zip(["intercept", *model["keys"]], model["beta"]))
        for name, model in [(name, fit(rows, keys)) for name, keys in MODELS.items()]}
    summary["capture_audit"] = capture_audit(data)
    (dest/"space-findings.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2)+"\n")


if __name__ == "__main__":
    main()
