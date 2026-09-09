import assert from "node:assert/strict";
import test from "node:test";

import {
  createSignedSessionToken,
  readSignedSessionPayload,
  verifySignedSessionToken,
} from "../src/lib/session-token";

const payload = {
  userId: "user-1",
  username: "admin",
  role: "main" as const,
  displayName: "管理员",
  iat: 1_700_000_000,
  exp: 1_700_086_400,
};

test("signed sessions round-trip with the account secret", () => {
  const token = createSignedSessionToken(payload, "password-hash");
  assert.deepEqual(readSignedSessionPayload(token), payload);
  assert.deepEqual(verifySignedSessionToken(token, "password-hash", payload.iat * 1000), payload);
});

test("signed sessions reject wrong secrets and tampered payloads", () => {
  const token = createSignedSessionToken(payload, "password-hash");
  assert.equal(verifySignedSessionToken(token, "other-secret", payload.iat * 1000), null);

  const [prefix, encodedPayload, signature] = token.split(".");
  const tamperedPayload = `${encodedPayload.slice(0, -1)}${encodedPayload.endsWith("A") ? "B" : "A"}`;
  assert.equal(
    verifySignedSessionToken(`${prefix}.${tamperedPayload}.${signature}`, "password-hash", payload.iat * 1000),
    null,
  );
});

test("signed sessions reject expired tokens", () => {
  const token = createSignedSessionToken(payload, "password-hash");
  assert.equal(verifySignedSessionToken(token, "password-hash", payload.exp * 1000), null);
});
