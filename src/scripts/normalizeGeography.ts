/**
 * One-time taxonomy + geography normalization (safe by design).
 *
 * - posts.category : maps case/alias variants to the canonical slug
 *   (e.g. "Others"→"others", "University"→"university"). LEGACY
 *   subject-based values ("Science", "Commerce", ...) are KEPT as-is and
 *   only counted — they are ambiguous and stay valid for old-post edits.
 * - posts.district / user.district : maps spelling aliases + case to the
 *   canonical 64-district value (e.g. "Comilla"→"Cumilla", "sylhet"→"Sylhet").
 *   Unknown values are KEPT as-is (never deleted) and counted.
 *
 * Usage (dry-run, default):
 *   npx tsx src/scripts/normalizeGeography.ts
 * Usage (write):
 *   npx tsx src/scripts/normalizeGeography.ts --apply
 */
import { client } from "../database/index.js";
import { postsCollection, userCollection } from "../database/collections.js";
import { normalizeCategory } from "../constants/categories.js";
import { normalizeDistrict } from "../constants/districts.js";

const apply = process.argv.includes("--apply");

interface Report {
  postsCategoryWouldFix: number;
  postsCategoryLegacyKept: number;
  postsDistrictWouldFix: number;
  postsDistrictUnknownKept: number;
  usersDistrictWouldFix: number;
  usersDistrictUnknownKept: number;
  postsWritten: number;
  usersWritten: number;
}

const run = async (): Promise<void> => {
  await client.connect();
  const report: Report = {
    postsCategoryWouldFix: 0,
    postsCategoryLegacyKept: 0,
    postsDistrictWouldFix: 0,
    postsDistrictUnknownKept: 0,
    usersDistrictWouldFix: 0,
    usersDistrictUnknownKept: 0,
    postsWritten: 0,
    usersWritten: 0,
  };

  try {
    const posts = await postsCollection.find({}).toArray();
    for (const post of posts) {
      const $set: Record<string, string> = {};

      if (typeof post.category === "string" && post.category.trim()) {
        const canonical = normalizeCategory(post.category);
        if (canonical && canonical !== post.category) {
          $set.category = canonical;
          report.postsCategoryWouldFix += 1;
        } else if (!canonical) {
          report.postsCategoryLegacyKept += 1;
        }
      }

      if (typeof post.district === "string" && post.district.trim()) {
        const canonical = normalizeDistrict(post.district);
        if (canonical && canonical !== post.district) {
          $set.district = canonical;
          report.postsDistrictWouldFix += 1;
        } else if (!canonical) {
          report.postsDistrictUnknownKept += 1;
        }
      }

      if (Object.keys($set).length > 0) {
        if (apply) {
          await postsCollection.updateOne({ _id: post._id }, { $set });
          report.postsWritten += 1;
        }
      }
    }

    const users = await userCollection.find({}).toArray();
    for (const user of users) {
      const rawDistrict = user.district;
      if (typeof rawDistrict !== "string" || !rawDistrict.trim()) continue;
      const canonical = normalizeDistrict(rawDistrict);
      if (canonical && canonical !== rawDistrict) {
        report.usersDistrictWouldFix += 1;
        if (apply) {
          await userCollection.updateOne(
            { _id: user._id },
            { $set: { district: canonical } },
          );
          report.usersWritten += 1;
        }
      } else if (!canonical) {
        report.usersDistrictUnknownKept += 1;
      }
    }

    console.log(
      apply
        ? "[normalizeGeography] applied"
        : "[normalizeGeography] dry-run — pass --apply to write",
      report,
    );
  } finally {
    await client.close();
  }
};

run().catch((error) => {
  console.error("[normalizeGeography] failed", error);
  process.exit(1);
});
