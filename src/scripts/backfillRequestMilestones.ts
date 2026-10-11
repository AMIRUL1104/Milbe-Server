import "dotenv/config";
import type { Document } from "mongodb";
import { client } from "../database/index.js";

const DB_NAME = "BookBridgeDB";
const BATCH_SIZE = 500;

const run = async (): Promise<void> => {
  await client.connect();
  const db = client.db(DB_NAME);
  const requests = db.collection("bookRequests");
  const posts = db.collection("posts");

  const duplicates = await requests
    .aggregate<{ _id: { postId: string; requesterId: string }; count: number }>([
      {
        $group: {
          _id: { postId: "$postId", requesterId: "$requesterId" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 },
    ])
    .toArray();

  if (duplicates.length > 0) {
    console.error(
      "Duplicate requests exist for the same post/requester pair. Resolve these records before running the migration.",
      duplicates,
    );
    process.exitCode = 1;
    return;
  }

  const requestGroups = await requests
    .aggregate<{
      _id: string;
      count: number;
      hasAcceptedRequest: number;
    }>([
      {
        $group: {
          _id: "$postId",
          count: { $sum: 1 },
          hasAcceptedRequest: {
            $max: {
              $cond: [{ $eq: ["$status", "accepted"] }, 1, 0],
            },
          },
        },
      },
    ])
    .toArray();
  const counts = new Map(requestGroups.map((group) => [group._id, group]));

  let batch: Array<{
    updateOne: {
      filter: Document;
      update: Document;
    };
  }> = [];
  let migrated = 0;
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await posts.bulkWrite(batch, { ordered: false });
    migrated += batch.length;
    batch = [];
  };

  for await (const post of posts.find(
    {},
    {
      projection: {
        status: 1,
        acceptedRequestId: 1,
        acceptedEver: 1,
      },
    },
  )) {
    const postId = post._id.toString();
    const group = counts.get(postId);
    const acceptedEver =
      post.acceptedEver === true ||
      Boolean(post.acceptedRequestId) ||
      post.status === "sold" ||
      post.status === "donated" ||
      group?.hasAcceptedRequest === 1;

    batch.push({
      updateOne: {
        filter: { _id: post._id },
        update: {
          $set: {
            requestCount: group?.count ?? 0,
            acceptedEver,
          },
        },
      },
    });
    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
  }
  await flush();

  await requests.createIndex(
    { postId: 1, requesterId: 1 },
    { unique: true, name: "book_request_post_requester_unique" },
  );
  await db.collection("emailOutbox").createIndex(
    { status: 1, nextAttemptAt: 1, createdAt: 1 },
    { name: "email_outbox_pending" },
  );
  await db.collection("emailOutbox").createIndex(
    { status: 1, leaseUntil: 1 },
    { name: "email_outbox_expired_lease" },
  );

  console.log(`Backfilled request counts and acceptance history for ${migrated} posts.`);
};

run()
  .catch((error: unknown) => {
    console.error("Request milestone migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
