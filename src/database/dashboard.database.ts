// src/database/dashboard.database.ts

import { ObjectId } from "mongodb";
import {
  postsCollection,
  userCollection,
  bookRequestsCollection,
} from "./collections.js";
import type {
  AdminDashboardData,
  DashboardActivity,
  UserDashboardData,
} from "../modules/dashboard/dashboard.types.js";

// ─── Safe date helper ─────────────────────────────────────────────────────────
// Returns a valid ISO string or falls back to epoch so toISOString() never throws.

function safeISO(value: unknown): string {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // Absolute fallback — treat missing dates as epoch so sorting still works
  return new Date(0).toISOString();
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [totalUsers, activePosts, recentActivities] = await Promise.all([
    countTotalUsers(),
    countActivePosts(),
    buildAdminActivities(),
  ]);

  return {
    totalUsers,
    activePosts,
    pendingReviews: 0, // review system not yet implemented
    knowledgeBaseCount: 0, // knowledge base not yet implemented
    recentActivities,
  };
}

async function countTotalUsers(): Promise<number> {
  return userCollection.countDocuments();
}

async function countActivePosts(): Promise<number> {
  return postsCollection.countDocuments({ status: "available" });
}

async function buildAdminActivities(): Promise<DashboardActivity[]> {
  const [recentUsers, recentPosts, recentRequests] = await Promise.all([
    userCollection.find({}).sort({ createdAt: -1 }).limit(10).toArray(),
    postsCollection.find({}).sort({ publishedAt: -1 }).limit(10).toArray(),
    bookRequestsCollection.find({}).sort({ createdAt: -1 }).limit(10).toArray(),
  ]);

  const activities: DashboardActivity[] = [
    ...recentUsers.map((u) => ({
      id: new ObjectId(u._id).toHexString(),
      type: "user_registered" as const,
      title: "New user registered",
      description: `${u.name ?? "A user"} joined BookBridge`,
      createdAt: safeISO(u.createdAt),
    })),

    ...recentPosts.map((p) => ({
      id: new ObjectId(p._id).toHexString(),
      type: "post_created" as const,
      title: "New post created",
      description: `"${p.title ?? "Untitled"}" was listed`,
      createdAt: safeISO(p.publishedAt), // use publishedAt as instructed
    })),

    ...recentRequests.map((r) => ({
      id: new ObjectId(r._id).toHexString(),
      type: "request_created" as const,
      title: "New book request",
      description: `A request was submitted for "${r.postTitle ?? "a book"}"`,
      createdAt: safeISO(r.createdAt),
    })),
  ];

  return activities
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 10);
}

// ─── User ─────────────────────────────────────────────────────────────────────

async function countUserActivePosts(userId: string): Promise<number> {
  return postsCollection.countDocuments({
    sellerId: userId,
    status: "available",
  });
}

async function countUserPendingRequests(userId: string): Promise<number> {
  return bookRequestsCollection.countDocuments({
    requesterId: userId,
    status: "pending",
  });
}

async function countUserBooksSold(userId: string): Promise<number> {
  return postsCollection.countDocuments({ sellerId: userId, status: "sold" });
}

async function countUserBooksDonated(userId: string): Promise<number> {
  return postsCollection.countDocuments({
    sellerId: userId,
    type: "donate",
    status: { $ne: "available" },
  });
}

async function buildUserActivities(
  userId: string,
): Promise<DashboardActivity[]> {
  const [userPosts, userRequests] = await Promise.all([
    postsCollection
      .find({ sellerId: userId })
      .sort({ publishedAt: -1 }) // use publishedAt as instructed
      .limit(10)
      .toArray(),

    bookRequestsCollection
      .find({ requesterId: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray(),
  ]);

  const activities: DashboardActivity[] = [
    ...userPosts.map((p) => ({
      id: new ObjectId(p._id).toHexString(),
      type: "post_created" as const,
      title: "Post created",
      description: `You listed "${p.title ?? "a book"}"`,
      createdAt: safeISO(p.publishedAt), // use publishedAt as instructed
    })),

    ...userRequests.map((r) => ({
      id: new ObjectId(r._id).toHexString(),
      type: "request_created" as const,
      title: "Request submitted",
      description: `You requested "${r.postTitle ?? "a book"}"`,
      createdAt: safeISO(r.createdAt),
    })),
  ];

  return activities
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 10);
}

export async function getUserDashboardData(
  userId: string,
): Promise<UserDashboardData> {
  const [
    activePosts,
    pendingRequests,
    booksSold,
    booksDonated,
    recentActivities,
  ] = await Promise.all([
    countUserActivePosts(userId),
    countUserPendingRequests(userId),
    countUserBooksSold(userId),
    countUserBooksDonated(userId),
    buildUserActivities(userId),
  ]);

  return {
    activePosts,
    pendingRequests,
    booksSold,
    booksDonated,
    recentActivities,
  };
}
