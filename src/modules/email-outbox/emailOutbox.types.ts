export type EmailOutboxStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "suppressed";

export type EmailOutboxPayload =
  | {
      kind: "request_milestone";
      recipientName: string;
      postTitle: string;
      postUrl: string;
      requestCount: 1 | 5 | 10;
    }
  | {
      kind: "request_accepted";
      recipientName: string;
      postTitle: string;
      postUrl: string;
    };

export interface EmailOutboxEvent {
  _id: string;
  type: EmailOutboxPayload["kind"];
  postId: string;
  requestId?: string;
  recipient: string;
  payload: EmailOutboxPayload;
  status: EmailOutboxStatus;
  attempts: number;
  createdAt: Date;
  nextAttemptAt: Date;
  leaseUntil?: Date;
  leaseToken?: string;
  sentAt?: Date;
  lastErrorCode?: string;
}
