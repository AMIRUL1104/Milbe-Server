#!/usr/bin/env node
/**
 * One-time backfill: merge the legacy `userProfile` documents into the Better
 * Auth `user` documents (same BookBridgeDB database the auth layer owns).
 *
 * Idempotent and additive — only fills values the `user` doc is missing or
 * has as an empty string, and never overwrites populated fields. Safe to run
 * again.
 *
 * Usage:
 *   node scripts/backfillUserProfile.mjs
 *
 * Requires MONGODB_URI in the environment (dotenv auto-loads `bookbridge-server/.env`).
 */
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is not defined in the .env file.");
  process.exit(1);
}

const client = new MongoClient(uri);
const db = client.db("BookBridgeDB");

let processed = 0;
let updated = 0;
let skipped = 0;
let missing = 0;
let errors = 0;

const isEmpty = (value) =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

try {
  await client.connect();

  const userProfileDocs = await db.collection("userProfile").find({}).toArray();

  for (const profile of userProfileDocs) {
    processed += 1;

    const userId = profile.userId;
    if (!userId || !ObjectId.isValid(userId)) {
      missing += 1;
      console.warn(`[skip:bad-userId] ${String(userId)}`);
      continue;
    }

    const user = await db.collection("user").findOne({ _id: new ObjectId(userId) });
    if (!user) {
      missing += 1;
      console.warn(`[skip:no-user] ${userId}`);
      continue;
    }

    // Only fill values the user doc does not already have populated.
    const fill = {};
    const candidates = [
      ["phoneNumber", profile.phoneNumber],
      ["district", profile.district],
      ["area", profile.area],
      ["image", profile.avatarUrl], // avatarUrl -> Better Auth core image
    ];

    for (const [field, value] of candidates) {
      if (typeof value === "string" && value.trim() !== "" && isEmpty(user[field])) {
        fill[field] = value;
      }
    }

    const profileCompleted =
      Boolean(fill.phoneNumber && fill.district && fill.area) ||
      Boolean(user.profileCompleted);
    if (profileCompleted && !user.profileCompleted) {
      fill.profileCompleted = true;
    }

    if (Object.keys(fill).length === 0) {
      skipped += 1;
      continue;
    }

    await db.collection("user").updateOne({ _id: new ObjectId(userId) }, { $set: fill });
    updated += 1;
  }

  console.log(
    `Backfill complete: processed=${processed} updated=${updated} skipped=${skipped} missing=${missing} errors=${errors}`
  );
} catch (error) {
  errors += 1;
  console.error("Backfill failed:", error);
  process.exitCode = 1;
} finally {
  await client.close();
}