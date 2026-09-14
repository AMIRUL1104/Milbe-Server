import { ObjectId } from "mongodb";
import {
  userCollection,
  sessionCollection,
  accountCollection,
} from "../../database/collections.js";
import type { UserProfile } from "./user.types.js";
import type { GetUsersQueryInput } from "./user.validation.js";

function mapToUserProfile(doc: Record<string, unknown>): UserProfile {
  const _id = doc._id?.toString() ?? "";
  const createdAtValue = (doc.createdAt ?? new Date()) as Date | string | number;
  const createdAt =
    createdAtValue instanceof Date
      ? createdAtValue
      : new Date(createdAtValue);

  return {
    _id,
    userId: _id,
    fullName: (doc.name as string) ?? "",
    email: (doc.email as string) ?? "",
    phoneNumber: (doc.phoneNumber as string) ?? "",
    district: (doc.district as string) ?? "",
    area: (doc.area as string) ?? "",
    avatarUrl: (doc.image as string) ?? null,
    role: (doc.role as "user" | "admin") ?? "user",
    memberSince: !isNaN(createdAt.getTime())
      ? createdAt.toISOString()
      : new Date().toISOString(),
    isBlocked: (doc.isBlocked as boolean) ?? false,
  };
}

/**
 * Idempotent legacy endpoint (POST /api/users).
 *
 * The profile now lives on the Better Auth `user` document, so there is
 * nothing to create anymore — the document already exists after sign-up.
 * Kept so old clients that still call POST /api/users right after
 * registration keep working during the transition window.
 */
export const createUserProfile = async (userData: {
  userId: string;
  fullName: string;
  email: string;
  role: "user" | "admin";
}): Promise<UserProfile> => {
  if (!ObjectId.isValid(userData.userId)) {
    throw new Error("Invalid user id.");
  }

  const user = await userCollection.findOne({
    _id: new ObjectId(userData.userId),
  });

  if (user) {
    return mapToUserProfile(user);
  }

  // Defensive fallback (should not happen — Better Auth creates the doc at
  // sign-up). Only returns a shaped payload; does not insert, to avoid
  // fabricating auth state outside Better Auth.
  return mapToUserProfile({
    _id: new ObjectId(userData.userId),
    name: userData.fullName,
    email: userData.email,
    role: userData.role,
    createdAt: new Date(),
  });
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!ObjectId.isValid(userId)) {
    return null;
  }
  const doc = await userCollection.findOne({ _id: new ObjectId(userId) });
  return doc ? mapToUserProfile(doc) : null;
};

export const getUsers = async (query: GetUsersQueryInput) => {
  const { page, limit, search, sort, role, status } = query;

  const filter: Record<string, unknown> = {};

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (role !== "all") {
    filter.role = role;
  }

  if (status !== "all") {
    filter.isBlocked = status === "suspended";
  }

  const sortDirection = sort === "oldest" ? 1 : -1;

  const [users, total] = await Promise.all([
    userCollection
      .find(filter)
      .sort({ createdAt: sortDirection })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    userCollection.countDocuments(filter),
  ]);

  return {
    users: users.map(mapToUserProfile),
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    currentPage: page,
  };
};

export const deleteUser = async (userId: string): Promise<boolean> => {
  if (!ObjectId.isValid(userId)) {
    return false;
  }

  const id = new ObjectId(userId);

  // Controlled account deletion: remove the user's sessions and auth accounts
  // before removing the `user` document itself (avoids orphaned rows).
  await sessionCollection.deleteMany({ userId });
  await accountCollection.deleteMany({ userId });

  const result = await userCollection.deleteOne({ _id: id });
  return result.deletedCount > 0;
};

export const checkUserBlocked = async (userId: string): Promise<boolean> => {
  if (!ObjectId.isValid(userId)) {
    return false;
  }
  const user = await userCollection.findOne({ _id: new ObjectId(userId) });
  return user?.isBlocked ?? false;
};