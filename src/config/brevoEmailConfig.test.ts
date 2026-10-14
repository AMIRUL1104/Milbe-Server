import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionBrevoConfiguration,
  getBrevoConfiguration,
  getMissingBrevoVariables,
} from "./brevoEmailConfig.js";

test("Brevo configuration requires an API key and sender", () => {
  assert.deepEqual(
    getMissingBrevoVariables({
      BREVO_API_KEY: "secret",
      EMAIL_FROM: "Milbe <sender@example.com>",
    }),
    [],
  );
  assert.deepEqual(
    getMissingBrevoVariables({
      BREVO_API_KEY: " ",
    }),
    ["BREVO_API_KEY", "EMAIL_FROM"],
  );
});

test("Brevo configuration parses a named sender and trims the API key", () => {
  assert.deepEqual(
    getBrevoConfiguration({
      BREVO_API_KEY: " secret ",
      EMAIL_FROM: " Milbe Notifications <sender@example.com> ",
    }),
    {
      apiKey: "secret",
      sender: { name: "Milbe Notifications", email: "sender@example.com" },
    },
  );
});

test("Brevo configuration accepts a bare email and rejects malformed senders", () => {
  assert.equal(
    getBrevoConfiguration({
      BREVO_API_KEY: "secret",
      EMAIL_FROM: "sender@example.com",
    })?.sender.name,
    "Milbe",
  );
  assert.throws(
    () =>
      getBrevoConfiguration({
        BREVO_API_KEY: "secret",
        EMAIL_FROM: "not-an-email",
      }),
    /EMAIL_FROM must be a valid email address/,
  );
});

test("production Brevo validation requires configuration but local modes may omit it", () => {
  assert.throws(
    () =>
      assertProductionBrevoConfiguration("production", {
        BREVO_API_KEY: "secret",
      }),
    /EMAIL_FROM/,
  );
  assert.doesNotThrow(() =>
    assertProductionBrevoConfiguration("development", {}),
  );
  assert.doesNotThrow(() =>
    assertProductionBrevoConfiguration("production", {
      BREVO_API_KEY: "secret",
      EMAIL_FROM: "Milbe <sender@example.com>",
    }),
  );
});
