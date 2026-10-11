import type { EmailOutboxPayload } from "./emailOutbox.types.js";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const getEmailContent = (
  payload: EmailOutboxPayload,
): { subject: string; html: string; text: string } => {
  const safeTitle = escapeHtml(payload.postTitle);
  const safeName = escapeHtml(payload.recipientName);
  const safeUrl = escapeHtml(payload.postUrl);

  if (payload.kind === "request_milestone") {
    const count = payload.requestCount;
    const subject = `Milbe: আপনার বইয়ের পোস্টে ${count}টি request এসেছে`;
    const text = `প্রিয় ${payload.recipientName},\n\n"${payload.postTitle}" পোস্টে মোট ${count}টি request এসেছে। আপনার প্রাপ্ত request-গুলো দেখতে Milbe dashboard-এর "প্রাপ্ত রিকোয়েস্ট" অংশে যান: ${payload.postUrl}\n\nMilbe`;

    return {
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937"><h1 style="color:#35858E">Milbe</h1><p>প্রিয় ${safeName},</p><p>আপনার <strong>${safeTitle}</strong> পোস্টে মোট <strong>${count}টি request</strong> এসেছে।</p><p>প্রাপ্ত request-গুলো দেখতে dashboard-এর "প্রাপ্ত রিকোয়েস্ট" অংশে যান।</p><p><a href="${safeUrl}">Request dashboard খুলুন</a></p></div>`,
    };
  }

  const subject = `Milbe: আপনার বইয়ের request গ্রহণ করা হয়েছে`;
  const text = `প্রিয় ${payload.recipientName},\n\n"${payload.postTitle}" বইটির জন্য আপনার request গ্রহণ করা হয়েছে। এখন Milbe dashboard-এর পাঠানো request-এ দেখানো যোগাযোগের তথ্য ব্যবহার করে বইয়ের মালিকের সঙ্গে যোগাযোগ করুন এবং হস্তান্তরের সময় ও পদ্ধতি ঠিক করুন: ${payload.postUrl}\n\nMilbe`;

  return {
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937"><h1 style="color:#35858E">Milbe</h1><p>প্রিয় ${safeName},</p><p>আপনার <strong>${safeTitle}</strong> বইটির জন্য পাঠানো request <strong>গ্রহণ করা হয়েছে</strong>।</p><p>এখন dashboard-এর পাঠানো request-এ দেখানো যোগাযোগের তথ্য ব্যবহার করে বইয়ের মালিকের সঙ্গে যোগাযোগ করুন এবং হস্তান্তরের সময় ও পদ্ধতি ঠিক করুন।</p><p><a href="${safeUrl}">পাঠানো request-গুলো দেখুন</a></p></div>`,
  };
};

export const milestoneForRequestCount = (
  count: number,
): 1 | 5 | 10 | null => {
  return count === 1 || count === 5 || count === 10 ? count : null;
};

export const getRetryDelayMs = (attempt: number): number =>
  Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 60 * 60 * 1000);
