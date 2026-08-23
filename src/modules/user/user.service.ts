import { ObjectId } from "mongodb";
import { userProfileCollection, userCollection } from "../../database/collections.js";
import type { UserProfile } from "./user.types.js";
import type { GetUsersQueryInput } from "./user.validation.js";

function mapToUserProfile(doc: Record<string, unknown>): UserProfile {
  return {
    _id: doc._id?.toString() ?? "",
    userId: doc.userId as string,
    fullName: doc.fullName as string,
    email: doc.email as string,
    phoneNumber: (doc.phoneNumber as string) ?? "",
    district: (doc.district as string) ?? "",
    area: (doc.area as string) ?? "",
    avatarUrl: (doc.avatarUrl as string) ?? null,
    role: (doc.role as "user" | "admin") ?? "user",
    memberSince: (doc.memberSince as string) ?? new Date().toISOString(),
  };
}

export const createUserProfile = async (userData: {
  userId: string;
  fullName: string;
  email: string;
  role: "user" | "admin";
}): Promise<UserProfile> => {
  const profileData = {
    userId: userData.userId,
    fullName: userData.fullName,
    email: userData.email,
    phoneNumber: "",
    district: "",
    area: "",
    avatarUrl: null,
    role: userData.role,
    memberSince: new Date().toISOString(),
  };

  const result = await userProfileCollection.insertOne(profileData);
  const created = await userProfileCollection.findOne({ _id: result.insertedId });
  return created ? mapToUserProfile(created) : mapToUserProfile(profileData);
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  if (!ObjectId.isValid(userId)) {
    return null;
  }
  const doc = await userProfileCollection.findOne({ userId });
  return doc ? mapToUserProfile(doc) : null;
};

export const getUsers = async (query: GetUsersQueryInput) => {
  const { page, limit, search, sort, role, status } = query;

  const filter: Record<string, unknown> = {};

  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
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
    userProfileCollection
      .find(filter)
      .sort({ updatedAt: sortDirection })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    userProfileCollection.countDocuments(filter),
  ]);

  return {
    users: users.map(mapToUserProfile),
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    currentPage: page,
  };
};

export const updateUserProfile = async (
  userId: string,
  updateData: Partial<UserProfile>
): Promise<UserProfile | null> => {
  if (!ObjectId.isValid(userId)) {
    return null;
  }

  const updatedData = {
    ...updateData,
    updatedAt: new Date(),
  };

  const result = await userProfileCollection.findOneAndUpdate(
    { userId },
    { $set: updatedData },
    { returnDocument: "after" }
  );

  return result ? mapToUserProfile(result) : null;
};

export const deleteUser = async (userId: string): Promise<boolean> => {
  if (!ObjectId.isValid(userId)) {
    return false;
  }

  const result = await userProfileCollection.deleteOne({ userId });
  return result.deletedCount > 0;
};

export const checkUserBlocked = async (userId: string): Promise<boolean> => {
  if (!ObjectId.isValid(userId)) {
    return false;
  }
  const user = await userCollection.findOne({ _id: new ObjectId(userId) });
  return user?.isBlocked ?? false;
};