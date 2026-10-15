import unittest

from analyze import auc, band, category, estimate, geometry, label, number, selection_area
from document_features import extract


class AnalysisTests(unittest.TestCase):
    def test_category_keeps_subcategory_and_removes_zone(self):
        self.assertEqual(category("ZONA2CAT.D/10"), "D/10")
        self.assertEqual(category("ZONA1D/1"), "D/1")
        self.assertEqual(category("F/1"), "F/1")
        self.assertEqual(category(""), "UNKNOWN")

    def test_unlabelled_is_never_negative(self):
        for value in ["Neutro", "Sospeso", "", None]:
            self.assertIsNone(label(value))
        self.assertEqual(label("Positivo"), 1)
        self.assertEqual(label("Negativo"), 0)

    def test_money_and_empty_values(self):
        self.assertAlmostEqual(number("137.335,66"), 137335.66)
        self.assertAlmostEqual(number("312929.00"), 312929)
        self.assertIsNone(number(""))
        self.assertIsNone(number("nan"))
        self.assertIsNone(number(False))
        self.assertEqual(band(None), "missing")
        self.assertEqual(band(100000), ">=100k")

    def test_actual_page_scale_and_manual_area_take_precedence(self):
        payload = {"sheetSize": "A4", "scaleDenominator": 100, "pageScales": {"2": {"sheetSize": "A3", "scaleDenominator": 200}}}
        sel = {"page": 2, "totalPixels": 100, "region": {"count": 50}}
        self.assertAlmostEqual(selection_area(sel, payload), .5 * .297 * .420 * 200 ** 2)
        self.assertEqual(selection_area(dict(sel, areaOverrideM2=0), payload), 0)

    def test_empty_estimate_is_not_full_saving_and_overrides_win(self):
        p = {"id": "x", "estimatedRendita": 0, "oneri": False}
        self.assertIsNone(estimate(p, None, False, {})[0])
        self.assertEqual(estimate(p, None, False, {"x:renditaAttribuibile": "1.200,00"})[0], 1200)
        self.assertIsNone(estimate(p, None, False, {"x:renditaAttribuibile": ""})[0])
        draft = {"payload": {"totalBaseAmount": 10000, "totalOneriAmount": 1000, "totalLotValue": 2000}}
        self.assertEqual(estimate(p, draft, False, {})[0], 260)
        self.assertIsNone(estimate(p, draft, True, {})[0])

    def test_geometry_distinguishes_outside_and_possible_room_counts(self):
        draft = {"payload": {"totalArea": 110, "selections": [
            {"usageId": "capannone", "areaOverrideM2": 10},
            {"usageId": "verde", "areaOverrideM2": 100}]}}
        result = geometry(draft)
        self.assertEqual(result["covered_area"], 10)
        self.assertEqual(result["area_reconciliation_error"], 0)
        self.assertFalse(result["possible_non_sqm_units"])
        draft["payload"]["selections"][0]["rate"] = 92000
        self.assertTrue(geometry(draft)["possible_non_sqm_units"])

    def test_auc_ties(self):
        rows = [{"y": 0, "score": 1}, {"y": 1, "score": 1}]
        self.assertEqual(auc(rows, lambda r: r["score"]), .5)
        self.assertIsNone(auc(rows[:1], lambda r: r["score"]))

    def test_visura_separates_current_from_history_and_negation(self):
        text = ("Unità immobiliare dal 01/01/2025 Annotazioni: classamento e rendita non rettificati "
                "\fSituazione dell'unità immobiliare dal 01/01/2016 "
                "classamento e rendita rettificati; RIDETERMINAZIONE DELLA RENDITA AI SENSI "
                "DELL'ART. 1, COMMA 22, L.N. 208/15")
        result = extract(text)
        self.assertFalse(result["current_rent_rectified"])
        self.assertTrue(result["current_rent_not_rectified"])
        self.assertTrue(result["history_rent_rectified"])
        self.assertFalse(result["current_article22_revision"])
        self.assertTrue(result["history_article22_revision"])
        self.assertEqual(result["evidence"]["history_article22_revision"]["page"], 2)
        self.assertIsNone(extract("unreadable PDF")["current_rurality_mention"])


if __name__ == "__main__":
    unittest.main()
