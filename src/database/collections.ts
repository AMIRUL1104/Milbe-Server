import type { Post } from "../modules/post/post.types.js";
import type { Upazila } from "../modules/location/location.types.js";
import type { Institution } from "../modules/location/location.types.js";
import type { BookRequest } from "../modules/book-request/bookRequest.types.js";
import type { Publisher } from "../modules/publisher/publisher.types.js";
import type { PendingPublisher } from "../modules/pending-publisher/pendingPublisher.types.js";
import { client } from "./index.js";

const db = client.db("BookBridgeDB");

// Collections
export const userCollection = db.collection("user");

export const sessionCollection = db.collection("session");

// Better Auth account/verification collections (used for controlled deletes).
export const accountCollection = db.collection("account");

export const verificationCollection = db.collection("verification");

export const postsCollection = db.collection<Post>("posts");

export const bookRequestsCollection =
  db.collection<BookRequest>("bookRequests");

export const publishersCollection = db.collection<Publisher>("publishers");

export const pendingPublishersCollection =
  db.collection<PendingPublisher>("pendingPublishers");

export const upazilasCollection = db.collection<Upazila>("upazilas");

export const institutionsCollection =
  db.collection<Institution>("institutions");
