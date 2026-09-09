import assert from "node:assert/strict";
import test from "node:test";

import {
  NULL_FILTER_VALUE,
  FILE_FILTER_FACETS,
  buildNullableOrExpression,
  createUniqueArchivePath,
  matchesNullableSelection,
  normalizeFileFilters,
  sanitizeArchiveSegment,
  withoutFileFilterFacet,
} from "../src/lib/query-builder";

test("normalizes aliases, removes duplicates and preserves AND-ready groups", () => {
  const filters = normalizeFileFilters({
    shopId: "a, b,a",
    platforms: ["Shopee", "Shopee", "Lazada"],
    includeHistory: true,
    displayNameContains: "  对账  ",
  });

  assert.deepEqual(filters.shopIds, ["a", "b"]);
  assert.deepEqual(filters.platforms, ["Shopee", "Lazada"]);
  assert.equal(filters.view, "history");
  assert.equal(filters.displayNameContains, "对账");
});

test("nullable selections support explicit missing values", () => {
  assert.equal(matchesNullableSelection(null, [NULL_FILTER_VALUE]), true);
  assert.equal(matchesNullableSelection("2026-08", [NULL_FILTER_VALUE, "2026-08"]), true);
  assert.equal(matchesNullableSelection("2026-09", [NULL_FILTER_VALUE, "2026-08"]), false);
  assert.equal(
    buildNullableOrExpression("period_label", [NULL_FILTER_VALUE, "2026-08"]),
    'period_label.is.null,period_label.in.("2026-08")',
  );
});

test("every multi-select facet ignores only its own selected values", () => {
  const filters = normalizeFileFilters({
    shopIds: ["shop-a"],
    platforms: ["Shopee"],
    sites: ["PH"],
    exportTypes: ["订单"],
    displayNames: ["订单.xlsx"],
    periodLabels: ["2026-08"],
    managers: ["张三"],
  });

  for (const facet of FILE_FILTER_FACETS) {
    const candidateFilters = withoutFileFilterFacet(filters, facet);
    assert.deepEqual(candidateFilters[facet], [], `${facet} should ignore itself`);
    for (const otherFacet of FILE_FILTER_FACETS) {
      if (otherFacet !== facet) {
        assert.deepEqual(
          candidateFilters[otherFacet],
          filters[otherFacet],
          `${facet} should preserve ${otherFacet}`,
        );
      }
    }
  }

  assert.deepEqual(filters.exportTypes, ["订单"]);
});

test("archive names cannot escape directories and remain unique case-insensitively", () => {
  assert.equal(sanitizeArchiveSegment("../财务:报表.xlsx"), "_财务_报表.xlsx");
  const used = new Set<string>();
  assert.equal(createUniqueArchivePath("店铺/Report.xlsx", used), "店铺/Report.xlsx");
  assert.equal(createUniqueArchivePath("店铺/report.xlsx", used), "店铺/report_2.xlsx");
});
