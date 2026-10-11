import type { ClientSession } from "mongodb";
import { emailOutboxCollection } from "../../database/collections.js";
import { env } from "../../config/env.js";
import type {
  EmailOutboxEvent,
  EmailOutboxPayload,
} from "./emailOutbox.types.js";

const requestsUrl = (): string =>
  `${(env.CLIENT_URL || "http://localhost:3000").replace(/\/+$/, "")}/dashboard/user/requests`;

export const queueEmail = async (
  input: {
    id: string;
    type: EmailOutboxPayload["kind"];
    postId: string;
    requestId?: string;
    recipient?: string;
    payload: EmailOutboxPayload;
  },
  session: ClientSession,
): Promise<void> => {
  const now = new Date();
  const event: EmailOutboxEvent = {
    _id: input.id,
    type: input.type,
    postId: input.postId,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    recipient: input.recipient?.trim() ?? "",
    payload: input.payload,
    status: input.recipient?.trim() ? "pending" : "failed",
    attempts: 0,
    createdAt: now,
    nextAttemptAt: now,
    ...(!input.recipient?.trim() ? { lastErrorCode: "missing_recipient" } : {}),
  };

  if (!event.recipient) {
    console.error("[email-outbox] Event has no recipient and cannot be sent.", {
      eventId: event._id,
      type: event.type,
    });
  }

  await emailOutboxCollection.insertOne(event, { session });
};

export const makeRequestsUrl = requestsUrl;
