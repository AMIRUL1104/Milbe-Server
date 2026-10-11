import { client } from "../database/index.js";
import type { Post } from "../modules/post/post.types.js";
import {
  derivePostSource,
  generatePostSearchData,
} from "../modules/post/post.slug.js";

type BackfillPost = Pick<Post, "title" | "books"> & {
  _id: NonNullable<Post["_id"]>;
  searchSlug?: string;
  searchKeywords?: string[];
};

const posts = client.db("BookBridgeDB").collection<BackfillPost>("posts");

const run = async (): Promise<void> => {
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  await client.connect();

  try {
    const cursor = posts.find({
      $or: [
        { searchKeywords: { $exists: false } },
        { searchKeywords: { $size: 0 } },
      ],
    });

    for await (const post of cursor) {
      processed += 1;

      try {
        const books = post.books ?? [];
        const bookNames = books.map(
          (book) => book.bookName ?? book.title ?? book.name ?? "",
        );
        const source = derivePostSource(post.title, bookNames);

        if (!source && books.length === 0) {
          skipped += 1;
          console.warn(`[skip:no-searchable-title] ${post._id.toHexString()}`);
          continue;
        }

        const { searchSlug, searchKeywords } = await generatePostSearchData(
          source,
          books,
        );
        await posts.updateOne(
          {
            _id: post._id,
            $or: [
              { searchKeywords: { $exists: false } },
              { searchKeywords: { $size: 0 } },
            ],
          },
          { $set: { searchSlug, searchKeywords } },
        );
        updated += 1;
      } catch (error) {
        errors += 1;
        console.error(`[backfill-failed] ${post._id.toHexString()}`, error);
      }
    }
  } finally {
    await client.close();
  }

  console.log(
    `Post searchKeywords backfill complete: processed=${processed} updated=${updated} skipped=${skipped} errors=${errors}`,
  );

  if (errors > 0) {
    process.exitCode = 1;
  }
};

run().catch((error: unknown) => {
  console.error("Post searchSlug backfill failed:", error);
  process.exitCode = 1;
});
