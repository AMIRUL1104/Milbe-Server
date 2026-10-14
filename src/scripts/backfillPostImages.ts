/**
 * Backfill legacy posts: derive images[0] from image/imageAssetId.
 *
 * Idempotent + safe to re-run. Legacy ImgBB URLs without assetId keep
 * `image` visible and leave images[] empty until the owner re-uploads.
 *
 * Usage: npx tsx src/scripts/backfillPostImages.ts
 */
import { ObjectId } from "mongodb";
import { client } from "../database/index.js";
import { postsCollection } from "../database/collections.js";

const run = async (): Promise<void> => {
  await client.connect();
  try {
    const cursor = postsCollection.find({
      $or: [{ images: { $exists: false } }, { images: { $size: 0 } }],
      image: { $type: "string" },
    });
    let matched = 0;
    let filled = 0;
    for await (const post of cursor) {
      matched += 1;
      if (
        typeof post.image !== "string" ||
        !post.image ||
        typeof post.imageAssetId !== "string" ||
        !ObjectId.isValid(post.imageAssetId)
      ) {
        continue;
      }
      const result = await postsCollection.updateOne(
        { _id: post._id, $or: [{ images: { $exists: false } }, { images: { $size: 0 } }] },
        {
          $set: {
            images: [{ url: post.image, assetId: post.imageAssetId }],
            image: post.image,
            imageAssetId: post.imageAssetId,
            updatedAt: new Date(),
          },
        },
      );
      if (result.modifiedCount === 1) filled += 1;
    }
    console.log(`[backfillPostImages] matched=${matched} filled=${filled}`);
  } finally {
    await client.close();
  }
};

run().catch((error) => {
  console.error("[backfillPostImages] failed", error);
  process.exit(1);
});
