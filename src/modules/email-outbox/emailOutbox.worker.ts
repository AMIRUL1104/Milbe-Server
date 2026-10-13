import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { ObjectId } from "mongodb";
import { env } from "../../config/env.js";
import { getSmtpConfiguration } from "../../config/emailConfig.js";
import { emailOutboxCollection, postsCollection } from "../../database/collections.js";
import type { EmailOutboxEvent } from "./emailOutbox.types.js";
import { getEmailContent, getRetryDelayMs } from "./emailTemplates.js";

const OUTBOX_LEASE_MS = 60_000;
const MAX_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 2_000;

const smtpConfig = getSmtpConfiguration(env);

const transporter = smtpConfig
  ? nodemailer.createTransport({
      ...smtpConfig,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    })
  : null;

const claimNextEvent = async (): Promise<EmailOutboxEvent | null> => {
  const now = new Date();
  const leaseToken = randomUUID();

  return emailOutboxCollection.findOneAndUpdate(
    {
      $or: [
        { status: "pending", nextAttemptAt: { $lte: now } },
        { status: "processing", leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "processing",
        leaseUntil: new Date(now.getTime() + OUTBOX_LEASE_MS),
        leaseToken,
      },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  );
};

const suppressEvent = async (
  event: EmailOutboxEvent,
  leaseToken: string,
): Promise<void> => {
  await emailOutboxCollection.updateOne(
    { _id: event._id, status: "processing", leaseToken },
    {
      $set: { status: "suppressed" },
      $unset: { leaseUntil: "", leaseToken: "" },
    },
  );
};

const deferEvent = async (
  event: EmailOutboxEvent,
  leaseToken: string,
): Promise<void> => {
  await emailOutboxCollection.updateOne(
    { _id: event._id, status: "processing", leaseToken },
    {
      $set: {
        status: "pending",
        nextAttemptAt: new Date(Date.now() + 2_000),
      },
      $unset: { leaseUntil: "", leaseToken: "" },
    },
  );
};

const acquireMilestoneLease = async (
  event: EmailOutboxEvent,
  token: string,
): Promise<"acquired" | "accepted" | "busy"> => {
  const now = new Date();
  const result = await postsCollection.updateOne(
    {
      _id: new ObjectId(event.postId),
      acceptedEver: { $ne: true },
      $or: [
        { "milestoneEmailLease.leaseUntil": { $exists: false } },
        { "milestoneEmailLease.leaseUntil": { $lte: now } },
      ],
    },
    {
      $set: {
        milestoneEmailLease: {
          eventId: event._id,
          token,
          leaseUntil: new Date(now.getTime() + OUTBOX_LEASE_MS),
        },
      },
    },
  );

  if (result.modifiedCount > 0) {
    return "acquired";
  }

  const post = await postsCollection.findOne(
    { _id: new ObjectId(event.postId) },
    { projection: { acceptedEver: 1 } },
  );
  return !post || post.acceptedEver ? "accepted" : "busy";
};

const releaseMilestoneLease = async (
  event: EmailOutboxEvent,
  token: string,
): Promise<void> => {
  await postsCollection.updateOne(
    {
      _id: new ObjectId(event.postId),
      "milestoneEmailLease.token": token,
    },
    { $unset: { milestoneEmailLease: "" } },
  );
};

const deliver = async (
  event: EmailOutboxEvent,
  leaseToken: string,
): Promise<void> => {
  if (!event.recipient) {
    throw new Error("missing_recipient");
  }
  if (!transporter) {
    throw new Error("smtp_not_configured");
  }

  let milestoneToken: string | undefined;
  if (event.type === "request_milestone") {
    const token = randomUUID();
    const result = await acquireMilestoneLease(event, token);
    if (result === "accepted") {
      await suppressEvent(event, leaseToken);
      return;
    }
    if (result === "busy") {
      await deferEvent(event, leaseToken);
      return;
    }
    milestoneToken = token;
  }

  try {
    const content = getEmailContent(event.payload);
    await transporter.sendMail({
      from: env.EMAIL_FROM ?? `Milbe <${env.SMTP_USER}>`,
      to: event.recipient,
      messageId: `<${event._id}@milbe>`,
      ...content,
    });

    await emailOutboxCollection.updateOne(
      { _id: event._id, status: "processing", leaseToken },
      {
        $set: { status: "sent", sentAt: new Date() },
        $unset: { leaseUntil: "", leaseToken: "", lastErrorCode: "" },
      },
    );
  } finally {
    if (milestoneToken) {
      await releaseMilestoneLease(event, milestoneToken);
    }
  }
};

const processOne = async (): Promise<boolean> => {
  const event = await claimNextEvent();
  if (!event) {
    return false;
  }

  const leaseToken = event.leaseToken;
  if (!leaseToken) {
    throw new Error("Email outbox event was claimed without a lease token.");
  }

  try {
    await deliver(event, leaseToken);
  } catch (error) {
    const errorDetails =
      error && typeof error === "object" ? error : {};
    const errorCode =
      "code" in errorDetails && typeof errorDetails.code === "string"
        ? errorDetails.code
        : error instanceof Error
          ? error.name || "delivery_failed"
          : "delivery_failed";
    const responseCode =
      "responseCode" in errorDetails &&
      typeof errorDetails.responseCode === "number"
        ? errorDetails.responseCode
        : undefined;
    const smtpCommand =
      "command" in errorDetails && typeof errorDetails.command === "string"
        ? errorDetails.command
        : undefined;
    const isFinal = event.attempts >= MAX_ATTEMPTS;
    await emailOutboxCollection.updateOne(
      { _id: event._id, status: "processing", leaseToken },
      {
        $set: {
          status: isFinal ? "failed" : "pending",
          nextAttemptAt: new Date(
            Date.now() + getRetryDelayMs(event.attempts),
          ),
          lastErrorCode: errorCode,
        },
        $unset: { leaseUntil: "", leaseToken: "" },
      },
    );
    console.error("[email-outbox] Delivery failed.", {
      eventId: event._id,
      attempt: event.attempts,
      final: isFinal,
      errorCode,
      ...(responseCode ? { responseCode } : {}),
      ...(smtpCommand ? { smtpCommand } : {}),
    });
  }
  return true;
};

export const startEmailOutboxWorker = (): (() => void) => {
  if (!transporter) {
    console.error(
      "[email-outbox] SMTP is not configured; queued emails will remain pending. Configure SMTP_HOST, SMTP_USER, and SMTP_PASS, then restart the server.",
    );
    return () => undefined;
  }

  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | undefined;
  const poll = async (): Promise<void> => {
    if (stopped || running) {
      return;
    }
    running = true;
    try {
      while (!stopped && (await processOne())) {
        // Drain available events serially to preserve each event's lease.
      }
    } catch (error) {
      console.error("[email-outbox] Worker polling failed.", error);
    } finally {
      running = false;
    }
  };

  const startPolling = (): void => {
    if (stopped || timer) {
      return;
    }
    timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    timer.unref();
    void poll();
  };

  void transporter
    .verify()
    .then(() => {
      console.info("[email-outbox] SMTP connection verified.");
    })
    .catch((error: unknown) => {
      const code =
        error && typeof error === "object" && "code" in error &&
        typeof error.code === "string"
          ? error.code
          : error instanceof Error
            ? error.name
            : "smtp_connection_failed";
      console.error("[email-outbox] SMTP connection verification failed.", {
        errorCode: code,
      });
    })
    .finally(startPolling);

  return () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
    }
  };
};
