import assert from "node:assert/strict";
import test from "node:test";
import {
  getEmailContent,
  getRetryDelayMs,
  milestoneForRequestCount,
} from "./emailTemplates.js";

test("request milestones include only the 1st, 5th, and 10th request", () => {
  assert.equal(milestoneForRequestCount(1), 1);
  assert.equal(milestoneForRequestCount(5), 5);
  assert.equal(milestoneForRequestCount(10), 10);
  assert.equal(milestoneForRequestCount(20), null);
  assert.equal(milestoneForRequestCount(50), null);
  assert.equal(milestoneForRequestCount(100), null);
  assert.equal(milestoneForRequestCount(0), null);
});

test("email content escapes post data and includes acceptance instructions", () => {
  const content = getEmailContent({
    kind: "request_accepted",
    recipientName: "Reader",
    postTitle: "<script>alert(1)</script>",
    postUrl: "https://milbe.vercel.app/books/book",
  });

  assert.match(content.html, /&lt;script&gt;/);
  assert.doesNotMatch(content.html, /<script>/);
  assert.match(content.text, /request গ্রহণ করা হয়েছে/);
  assert.match(content.text, /যোগাযোগের তথ্য ব্যবহার/);
  assert.match(content.html, /https:\/\/milbe\.vercel\.app\/books\/book/);
});

test("email retry delay grows exponentially and is capped at one hour", () => {
  assert.equal(getRetryDelayMs(1), 30_000);
  assert.equal(getRetryDelayMs(2), 60_000);
  assert.equal(getRetryDelayMs(20), 3_600_000);
});
