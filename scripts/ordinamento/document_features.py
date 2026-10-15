#!/usr/bin/env python3
"""Candidate indicators with page evidence; no legal conclusions from keyword hits."""
from collections import Counter
import json
import os
from pathlib import Path
import re
from analyze import category, write_csv

ROOT = Path(__file__).resolve().parents[2]
PATTERNS = {
    "rurality_mention": r"ruralit[àa]",
    "article22_revision": r"rideterminazione\s+della\s+rendita[\s\S]{0,140}?208\s*/\s*(?:2015|15)\b",
    "litigation_mention": r"contenzioso|presentato\s+ricorso|sentenza",
    "rent_proposed": r"classamento\s+e\s+rendita\s+propost[ai]",
    "rent_rectified": r"classamento\s+e\s+rendita\s+rettificat[ai]",
    "rent_not_rectified": r"rendita\s+non\s+rettificat[ai]",
    "demolition_or_change_use": r"demolizione|variazione\s+della\s+destinazione|cambio\s+di\s+destinazione",
}
STATE = re.compile(r"(?:Unit[àa]\s+immobiliare|Situazione\s+dell['’]unit[àa]\s+immobiliare(?:\s+che\s+ha\s+originato\s+il\s+precedente)?)\s+dal\s+(\d{2}/\d{2}/\d{4})", re.I)


def extract(text):
    # Preserve page boundaries so evidence refers to the original PDF.
    text = re.sub(r"[^\S\f]+", " ", text)
    states = list(STATE.finditer(text))
    current = text[states[0].start():states[1].start() if len(states) > 1 else len(text)] if states else None
    result = {"current_state_found": bool(states), "current_state_date": states[0][1] if states else None,
              "state_count": len(states), "evidence": {}}
    for name, pattern in PATTERNS.items():
        for scope, body in [("history", text), ("current", current)]:
            key = f"{scope}_{name}"
            match = re.search(pattern, body, re.I) if body is not None else None
            result[key] = bool(match) if body is not None else None
            if match:
                offset = states[0].start() if scope == "current" else 0
                position = offset + match.start()
                result["evidence"][key] = {"page": text[:position].count("\f") + 1,
                    "snippet": re.sub(r"\s+", " ", body[max(0, match.start()-70):match.end()+170])}
    return result


def main():
    os.umask(0o077)
    base = ROOT / ".research"
    dest = base / (base / "LATEST").read_text().strip()
    data = json.loads((dest / "cohort.json").read_text())
    docs = json.loads((dest / "document-manifest.json").read_text())
    texts = json.loads((dest / "document-text.json").read_text())
    properties = {p["id"]: p for p in data["Property"]}
    rows = []
    for doc in docs:
        if doc["type"] != "VISURA":
            continue
        p = properties[doc["propertyId"]]
        rows.append({"property_id": p["id"], "study_id": p["studyId"], "unit_id": p["valuationGroupId"] or p["id"],
                     "category": category(p["categoria"]), "outcome": p["outcome"],
                     "document_id": doc["id"], "sha256": doc["sha256"], **extract(texts[doc["sha256"]]["text"])})
    summary = {"visure": len(rows), "current_state_found": sum(r["current_state_found"] for r in rows),
               "text_layer_only_no_visual_plan_analysis": True,
               "text_coverage": {kind: {"references": sum(d["type"] == kind for d in docs),
                    "references_with_100_characters": sum(d["type"] == kind and texts[d["sha256"]]["characters"] >= 100 for d in docs)}
                    for kind in ["VISURA", "PLANIMETRIA", "ELENCO_SUBALTERNI"]}, "signals": {}}
    for name in PATTERNS:
        for scope in ["history", "current"]:
            key = f"{scope}_{name}"
            matching = [r for r in rows if r[key]]
            units = {}
            for row in matching:
                units[row["unit_id"]] = row
            summary["signals"][key] = {"property_count": len(matching),
                "property_outcomes": dict(Counter(r["outcome"] for r in matching)),
                "studies": len({r["study_id"] for r in matching}), "unit_count": len(units),
                "unit_outcomes": dict(Counter(r["outcome"] for r in units.values())),
                "categories": dict(Counter(r["category"] for r in matching))}
    write_csv(dest / "visura-features.csv", rows)
    (dest / "visura-features.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False)+"\n")
    (dest / "document-findings.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False)+"\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
