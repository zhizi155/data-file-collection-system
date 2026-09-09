import assert from "node:assert/strict";
import test from "node:test";

import { parseDateFromFilename, parseUserInputDate } from "../src/lib/date-parser";

test("parses a full Chinese date range", () => {
  const parsed = parseDateFromFilename("店铺A_2026年08月01日-2026年08月31日.xlsx");
  assert.equal(parsed.status, "success");
  assert.equal(parsed.start, "2026-08-01");
  assert.equal(parsed.end, "2026-08-31");
});

test("unrecognized names are marked as failed without inventing dates", () => {
  const parsed = parseDateFromFilename("最终版报表.xlsx");
  assert.equal(parsed.status, "failed");
  assert.equal(parsed.start, null);
});

test("blank user input is pending instead of inventing a period", () => {
  assert.equal(parseUserInputDate("   ").status, "pending");
});
