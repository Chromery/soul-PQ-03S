#!/usr/bin/env python3
"""Export the non-archived analytical cohort from the isolated local snapshot."""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess as sp

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = "soul-pq-ordinamento-postgres-1"


def query(sql):
    return sp.run(["docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
                   CONTAINER, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", "research", "-d", "soul_ordinamento"],
                  input=sql, capture_output=True, text=True, check=True).stdout.strip()


def main():
    os.umask(0o077)
    inspect = json.loads(sp.check_output(["docker", "inspect", CONTAINER]))[0]
    assert inspect["Config"]["Labels"]["com.docker.compose.project"] == "soul-pq-ordinamento"
    assert inspect["HostConfig"]["NetworkMode"] == "none"
    assert query("SHOW default_transaction_read_only") == "on"
    studies = 'SELECT id FROM "FeasibilityStudy" WHERE NOT "isTest"'
    properties = f'SELECT id FROM "Property" WHERE "studyId" IN ({studies})'
    groups = f'SELECT id FROM "PropertyValuationGroup" WHERE "studyId" IN ({studies})'
    study_groups = f'SELECT "studyGroupId" FROM "FeasibilityStudy" WHERE NOT "isTest"'
    conditions = {
        "FeasibilityStudy": 'NOT "isTest"', "Property": f'"studyId" IN ({studies})',
        "StudyVersion": f'"studyId" IN ({studies})',
        "PropertyValuationGroup": f'"studyId" IN ({studies})',
        "PropertyValuationGroupRevision": f'"studyId" IN ({studies})',
        "PropertyValuationGroupAnalysisDraft": f'"valuationGroupId" IN ({groups})',
        "StudyGroup": f'id IN ({study_groups})',
        "StudyGroupAnalysisDraft": f'"studyGroupId" IN ({study_groups})',
        "PresentationDeck": f'("studyId" IN ({studies}) OR "studyGroupId" IN ({study_groups}))',
        "PresentationDraft": f'("studyId" IN ({studies}) OR "studyGroupId" IN ({study_groups}))',
    }
    for table in ["PropertyDocument", "PlanAnalysisDraft", "VisuraExtractionJob", "ScaleExtractionJob"]:
        conditions[table] = f'"propertyId" IN ({properties})'
    selects = [f"'{table}', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) FROM \"{table}\" t WHERE {where})"
               for table, where in conditions.items()]
    selects.append("'cohort_audit', (SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT \"isTest\", status, count(*) n FROM \"FeasibilityStudy\" GROUP BY 1,2 ORDER BY 1,2) t)")
    data = json.loads(query("SELECT jsonb_build_object(" + ",\n".join(selects) + ");"))
    # The restored snapshot is immutable by default; the SELECT is one MVCC statement.
    dest = ROOT / ".research" / (ROOT / ".research/LATEST").read_text().strip()
    data["exported_at_utc"] = dt.datetime.now(dt.timezone.utc).isoformat()
    (dest / "cohort.json").write_text(json.dumps(data, ensure_ascii=False) + "\n")
    print(json.dumps({"tables": {k: len(v) for k, v in data.items() if isinstance(v, list)}, "cohort_audit": data["cohort_audit"]}, indent=2))


if __name__ == "__main__":
    main()
