#!/usr/bin/env python3
"""Audit financial proposals at the exact unit/group level in saved presentations.

These are dated feasibility proposals, NOT accepted revisions, realized savings,
or predicted values for unanalysed properties. No imputation of absent figures.
"""
from collections import Counter
import csv
import json
import os
from pathlib import Path
from analyze import describe, number, write_csv

ROOT = Path(__file__).resolve().parents[2]


def main():
    os.umask(0o077)
    base = ROOT / ".research"
    dest = base / (base / "LATEST").read_text().strip()
    data = json.loads((dest / "cohort.json").read_text())
    units = list(csv.DictReader((dest / "evaluated-units.csv").open()))
    positive_units = [u for u in units if u["y"] == "1"]
    latest_decks = {}
    for deck in data["PresentationDeck"]:
        if deck.get("deletedAt"):
            continue
        key = (deck.get("studyId"), deck.get("studyGroupId"))
        if key not in latest_decks or latest_decks[key]["createdAt"] < deck["createdAt"]:
            latest_decks[key] = deck
    rows = []
    for unit in positive_units:
        ids = set(json.loads(unit["member_ids"]))
        matches = []
        for deck in latest_decks.values():
            snapshot = deck["snapshot"]
            for row in snapshot.get("tableRows", snapshot.get("immobili", [])):
                member_ids = set(row.get("memberIds") or [row.get("id")])
                if member_ids == ids:
                    matches.append((deck, row))
        if not matches:
            rows.append({"unit_id": unit["id"], "member_ids": sorted(ids), "study_id": unit["study_id"],
                         "company": unit["company"], "status": "no_exact_membership_match_in_latest_presentations"})
            continue
        # Own-study presentation takes precedence; otherwise latest shared-group deck.
        deck, row = max(matches, key=lambda pair: (pair[0].get("studyId") == unit["study_id"], pair[0]["createdAt"]))
        current_rent, proposed_rent, current_imu, proposed_imu = (number(row.get(k)) for k in
                     ["renditaAttuale", "renditaAttribuibile", "imuAttuale", "imuOttenibile"])
        rent_reduction = current_rent - proposed_rent if current_rent is not None and proposed_rent is not None and proposed_rent > 0 else None
        imu_reduction = current_imu - proposed_imu if current_imu is not None and proposed_imu is not None and proposed_imu > 0 else None
        rows.append({"unit_id": unit["id"], "member_ids": sorted(ids), "study_id": unit["study_id"], "company": unit["company"],
                     "status": "dated_proposal_not_realized", "snapshot_at": deck["createdAt"], "deck_id": deck["id"],
                     "reduction_basis": row.get("reductionBasis", deck["snapshot"].get("reductionBasis", "not_recorded")),
                     "snapshot_category": row.get("categoria"), "current_rent": current_rent, "proposed_rent": proposed_rent,
                     "proposed_rent_reduction": rent_reduction, "current_annual_imu": current_imu, "proposed_annual_imu": proposed_imu,
                     "proposed_annual_imu_reduction": imu_reduction,
                     "current_db_rent_differs_from_snapshot": abs(float(unit["rent"]) - current_rent) > .02 if current_rent is not None else True,
                     "snapshot_outcome": row.get("outcome", "not_recorded"),
                     "rent_reduction_fraction": rent_reduction/current_rent if rent_reduction is not None and current_rent else None})
    rows.sort(key=lambda r: -(r.get("proposed_annual_imu_reduction") or 0))
    write_csv(dest / "positive-unit-proposals.csv", rows)
    summary = {"positive_units": len(positive_units), "status_counts": dict(Counter(r["status"] for r in rows)),
               "annual_imu_proposal_reduction": describe([r.get("proposed_annual_imu_reduction") for r in rows]),
               "rent_reduction_fraction": describe([r.get("rent_reduction_fraction") for r in rows]),
               "snapshot_current_rent_disagreements": sum(r.get("current_db_rent_differs_from_snapshot", False) for r in rows),
               "imu_benefit_without_rent_reduction": [{k:r[k] for k in ["member_ids", "current_rent", "proposed_rent", "proposed_annual_imu_reduction", "reduction_basis"]}
                     for r in rows if (r.get("proposed_annual_imu_reduction") or 0) > 0 and r.get("proposed_rent_reduction") is not None and r["proposed_rent_reduction"] <= .02],
               "limitation": "Latest saved presentations can predate current edits; no financial totals or national profit projection are inferred."}
    (dest / "economics-findings.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False)+"\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
