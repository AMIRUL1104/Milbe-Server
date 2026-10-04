import { MongoClient, ServerApiVersion } from "mongodb";
import "dotenv/config";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not defined in the .env file.");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const DB_NAME = "BookBridgeDB";
const POSTS_COLLECTION = "posts";

/**
 * Ensures the unique slug index on the posts collection. A partial unique
 * index is used so legacy posts without a slug field remain valid while all
 * string slugs are guaranteed unique.
 */
const ensurePostSlugIndex = async (mongoClient: MongoClient): Promise<void> => {
  const posts = mongoClient.db(DB_NAME).collection(POSTS_COLLECTION);
  const slugIndexOptions = {
    unique: true,
    name: "post_slug_unique",
    partialFilterExpression: { slug: { $type: "string" } },
  };

  try {
    await posts.createIndex({ slug: 1 }, slugIndexOptions);
  } catch (error) {
    // An older plain unique index may exist under the same name with
    // different options (IndexOptionsConflict); drop it and recreate
    // as the partial unique index.
    console.warn(
      "⚠️ Could not create post_slug_unique directly; dropping the existing index and retrying.",
    );
    console.warn(error);

    try {
      await posts.dropIndex("post_slug_unique");
    } catch {
      // Index does not exist under that name; nothing to drop.
    }

    await posts.createIndex({ slug: 1 }, slugIndexOptions);
  }
};

const connectDB = async (): Promise<void> => {
  try {
    await client.connect();

    // Ping the database to verify the connection
    await client.db("admin").command({ ping: 1 });

    await ensurePostSlugIndex(client);

    console.log("✅ Successfully connected to MongoDB!");
  } catch (error) {
    console.error("❌ MongoDB connection failed:");
    console.error(error);

    process.exit(1);
  }
};

export { client };
export default connectDB;
