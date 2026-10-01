import "dotenv/config";
import { MongoClient } from "mongodb";
import { generatePostSlug } from "../modules/post/post.slug.js";
import type { Post } from "../modules/post/post.types.js";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not defined.");
}

const applyChanges = process.argv.includes("--apply");
const limitArgument = process.argv.find((argument) =>
  argument.startsWith("--limit="),
);
const requestedLimit = limitArgument
  ? Number(limitArgument.split("=")[1])
  : undefined;
const limit =
  Number.isInteger(requestedLimit) && requestedLimit! > 0 ? requestedLimit : 0;

const client = new MongoClient(uri);
const posts = client.db("BookBridgeDB").collection<Post>("posts");
const missingSlugFilter = {
  $or: [
    { slug: { $exists: false } },
    { slug: { $type: "null" as const } },
    { slug: "" },
  ],
};

let scanned = 0;
let updated = 0;
let errors = 0;

try {
  await client.connect();

  const cursor = posts.find(missingSlugFilter).sort({ _id: 1 });
  if (limit) cursor.limit(limit);

  for await (const post of cursor) {
    scanned += 1;
    if (!post._id) {
      errors += 1;
      console.error("Skipped post without an _id.");
      continue;
    }

    try {
      const slug = await generatePostSlug(
        post.title,
        post.books ?? [],
        post._id.toHexString(),
      );

      if (applyChanges) {
        const result = await posts.updateOne(
          { _id: post._id, ...missingSlugFilter },
          { $set: { slug } },
        );
        if (result.modifiedCount > 0) updated += 1;
      } else {
        console.log(`[dry-run] ${post._id.toHexString()} -> ${slug}`);
      }
    } catch (error) {
      errors += 1;
      console.error(
        `Failed ${post._id.toHexString()}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (applyChanges && errors === 0 && !limit) {
    await posts.createIndex(
      { slug: 1 },
      { unique: true, name: "post_slug_unique" },
    );
  }

  console.log(
    `Backfill ${applyChanges ? "complete" : "dry-run"}: scanned=${scanned} updated=${updated} errors=${errors}`,
  );
  if (applyChanges && errors > 0) process.exitCode = 1;
} finally {
  await client.close();
}
