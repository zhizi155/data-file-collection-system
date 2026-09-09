import assert from "node:assert/strict";
import test from "node:test";
import { getUserPermissions, hasPermission } from "../src/lib/rbac";
import type { SessionData } from "../src/lib/session";

function session(role: SessionData["role"]): SessionData {
  return {
    userId: "test-user",
    username: "tester",
    role,
    displayName: "测试账号",
    iat: 0,
    exp: Number.MAX_SAFE_INTEGER,
  };
}

test("sub administrators can manage collection data but not accounts", () => {
  const user = session("sub_admin");

  assert.equal(hasPermission(user, "files:view"), true);
  assert.equal(hasPermission(user, "files:delete"), true);
  assert.equal(hasPermission(user, "rules:manage"), true);
  assert.equal(hasPermission(user, "shops:manage"), true);
  assert.equal(hasPermission(user, "variables:manage"), true);
  assert.equal(hasPermission(user, "account:manage"), false);
});

test("ordinary sub accounts retain read and export-only access", () => {
  assert.deepEqual(getUserPermissions(session("sub")), ["files:export", "files:view"]);
});
