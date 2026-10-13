import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionSmtpConfiguration,
  getMissingSmtpVariables,
  getSmtpConfiguration,
} from "./emailConfig.js";

test("SMTP configuration requires host, user, and password", () => {
  assert.deepEqual(
    getMissingSmtpVariables({
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "sender@example.com",
      SMTP_PASS: "secret",
    }),
    [],
  );
  assert.deepEqual(
    getMissingSmtpVariables({
      SMTP_HOST: " ",
      SMTP_USER: "sender@example.com",
    }),
    ["SMTP_HOST", "SMTP_PASS"],
  );
});

test("SMTP configuration defaults to secure port 465", () => {
  assert.deepEqual(
    getSmtpConfiguration({
      SMTP_HOST: " smtp.example.com ",
      SMTP_USER: " sender@example.com ",
      SMTP_PASS: " secret ",
    }),
    {
      host: "smtp.example.com",
      port: 465,
      secure: true,
      connectionTimeout: 10_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      auth: { user: "sender@example.com", pass: " secret " },
    },
  );
});

test("SMTP configuration uses STARTTLS-compatible transport for non-465 ports", () => {
  assert.equal(
    getSmtpConfiguration({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: 587,
      SMTP_USER: "sender@example.com",
      SMTP_PASS: "secret",
    })?.secure,
    false,
  );
  assert.equal(
    getSmtpConfiguration({
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "sender@example.com",
      SMTP_PASS: " ",
    }),
    null,
  );
});

test("production SMTP validation rejects missing configuration but local modes may omit it", () => {
  assert.throws(
    () => assertProductionSmtpConfiguration("production", { SMTP_HOST: "smtp.example.com" }),
    /SMTP_USER, SMTP_PASS/,
  );
  assert.doesNotThrow(() =>
    assertProductionSmtpConfiguration("development", {}),
  );
  assert.doesNotThrow(() =>
    assertProductionSmtpConfiguration("production", {
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "sender@example.com",
      SMTP_PASS: "secret",
    }),
  );
});
