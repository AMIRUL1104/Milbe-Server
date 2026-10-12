import { ObjectId } from "mongodb";
import {
  userCollection,
  sessionCollection,
  accountCollection,
} from "../../database/collections.js";
import { client } from "../../database/index.js";
import {
  attachPendingImage,
  cleanupDetachedImage,
  detachImageAsset,
  isCloudinaryUrl,
} from "../image/image.service.js";
import { ApiError } from "../../utils/apiError.js";
import type { UserProfile } from "./user.types.js";
import type {
  GetUsersQueryInput,
  updateCurrentUserProfileSchema,
} from "./user.validation.js";
import type z from "zod";

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
    avatarAssetId: (doc.imageAssetId as string) ?? null,
    role: (doc.role as "user" | "admin") ?? "user",
    memberSince: !isNaN(createdAt.getTime())
      ? createdAt.toISOString()
      : new Date().toISOString(),
    banned: Boolean(doc.banned ?? doc.isBlocked ?? false),
  };
}

type UpdateCurrentUserProfileInput = z.infer<
  typeof updateCurrentUserProfileSchema
>["body"];

export const updateCurrentUserProfile = async (
  userId: string,
  input: UpdateCurrentUserProfileInput,
): Promise<{ profile: UserProfile; cleanupPending: boolean } | null> => {
  if (!ObjectId.isValid(userId)) return null;

  const session = client.startSession();
  let profile: UserProfile | null = null;
  let previousAssetId: string | undefined;
  let nextAssetId: string | undefined;
  let imageWasUpdated = false;

  try {
    await session.withTransaction(async () => {
      const current = await userCollection.findOne(
        { _id: new ObjectId(userId) },
        { session },
      );
      if (!current) return;

      const hasAvatarUrl = Object.prototype.hasOwnProperty.call(
        input,
        "avatarUrl",
      );
      const hasAvatarAssetId = Object.prototype.hasOwnProperty.call(
        input,
        "avatarAssetId",
      );
      const avatarUrl = hasAvatarUrl
        ? input.avatarUrl ?? null
        : (current.image as string | null) ?? null;
      nextAssetId = hasAvatarAssetId
        ? input.avatarAssetId ?? undefined
        : hasAvatarUrl && avatarUrl !== current.image
          ? undefined
          : (current.imageAssetId as string | undefined);
      previousAssetId = current.imageAssetId as string | undefined;
      imageWasUpdated = hasAvatarUrl || hasAvatarAssetId;

      if (
        hasAvatarUrl &&
        avatarUrl &&
        avatarUrl !== current.image &&
        !nextAssetId
      ) {
        throw ApiError.badRequest(
          "New profile images must be uploaded through the image API.",
        );
      }
      if (
        hasAvatarAssetId &&
        nextAssetId !== previousAssetId &&
        !hasAvatarUrl
      ) {
        throw ApiError.badRequest(
          "Avatar URL and asset reference must be updated together.",
        );
      }
      if (isCloudinaryUrl(avatarUrl ?? "") && !nextAssetId) {
        throw ApiError.badRequest(
          "Cloudinary avatars must include a valid image asset reference.",
        );
      }
      if (
        nextAssetId === previousAssetId &&
        nextAssetId &&
        avatarUrl !== current.image
      ) {
        throw ApiError.badRequest(
          "An image asset cannot be paired with a different avatar URL.",
        );
      }
      if (nextAssetId && !avatarUrl) {
        throw ApiError.badRequest(
          "An avatar URL is required with an image asset ID.",
        );
      }

      const $set: Record<string, unknown> = { updatedAt: new Date() };
      const $unset: Record<string, ""> = {};
      if (input.fullName !== undefined) $set.name = input.fullName;
      if (input.phoneNumber !== undefined) $set.phoneNumber = input.phoneNumber;
      if (input.district !== undefined) $set.district = input.district;
      if (input.area !== undefined) $set.area = input.area;
      if (imageWasUpdated) {
        $set.image = avatarUrl;
        if (nextAssetId) $set.imageAssetId = nextAssetId;
        else $unset.imageAssetId = "";
      }

      const phoneNumber =
        input.phoneNumber !== undefined ? input.phoneNumber : current.phoneNumber;
      const district =
        input.district !== undefined ? input.district : current.district;
      const area = input.area !== undefined ? input.area : current.area;
      $set.profileCompleted = Boolean(
        typeof phoneNumber === "string" &&
          phoneNumber.trim() &&
          typeof district === "string" &&
          district.trim() &&
          typeof area === "string" &&
          area.trim(),
      );

      if (nextAssetId !== previousAssetId) {
        if (nextAssetId) {
          await attachPendingImage({
            assetId: nextAssetId,
            ownerId: userId,
            purpose: "profile",
            secureUrl: avatarUrl,
            attachedTo: { kind: "profile", id: userId },
            session,
          });
        }
        await detachImageAsset(
          previousAssetId,
          userId,
          "profile",
          userId,
          session,
        );
      }

      const updateResult = await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        {
          $set,
          ...(Object.keys($unset).length ? { $unset } : {}),
        },
        { session },
      );
      if (updateResult.matchedCount !== 1) {
        throw ApiError.conflict("Profile changed while the image was being saved.");
      }

      const updatedUser = await userCollection.findOne(
        { _id: new ObjectId(userId) },
        { session },
      );
      if (updatedUser) profile = mapToUserProfile(updatedUser);
    });
  } finally {
    await session.endSession();
  }

  if (!profile) return null;

  let cleanupPending = false;
  if (previousAssetId && previousAssetId !== nextAssetId) {
    try {
      await cleanupDetachedImage(previousAssetId);
    } catch (error) {
      cleanupPending = true;
      console.error("[image-assets] Old profile image cleanup is pending.", {
        userId,
        assetId: previousAssetId,
        error,
      });
    }
  }

  return { profile, cleanupPending };
};

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

/** Coerces a raw query-string value to a positive integer (with fallback). */
const toPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getUsers = async (query: GetUsersQueryInput) => {
  // The controller forwards the raw `req.query`. Zod defaults are applied by
  // the `validate` middleware, but values are coerced again here so that a
  // missing or string-typed page/limit can never reach the Mongo driver and
  // only known role/status enum values ever reach the filter.
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 10), 100);
  const search = typeof query.search === "string" ? query.search : "";
  const { role, status } = query;

  const filter: Record<string, unknown> = {};

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  // Whitelist approach: "all" (or any unexpected value) means "no
  // constraint" instead of leaking `undefined` into the filter — which
  // previously matched no documents and emptied the admin user list.
  if (role === "user" || role === "admin") {
    filter.role = role;
  }

  if (status === "active") {
    // `$ne: true` also matches legacy docs without a `banned` field yet.
    filter.banned = { $ne: true };
  } else if (status === "suspended") {
    filter.banned = true;
  }

  const sortDirection = query.sort === "oldest" ? 1 : -1;

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

export const deleteUser = async (
  userId: string,
): Promise<{ deleted: boolean; cleanupPending: boolean }> => {
  if (!ObjectId.isValid(userId)) {
    return { deleted: false, cleanupPending: false };
  }

  const id = new ObjectId(userId);
  const session = client.startSession();
  let deleted = false;
  let profileAssetId: string | undefined;
  try {
    await session.withTransaction(async () => {
      const user = await userCollection.findOne({ _id: id }, { session });
      if (!user) return;
      profileAssetId = user.imageAssetId as string | undefined;

      await sessionCollection.deleteMany({ userId }, { session });
      await accountCollection.deleteMany({ userId }, { session });

      const result = await userCollection.deleteOne({ _id: id }, { session });
      if (result.deletedCount !== 1) return;
      deleted = true;
      await detachImageAsset(
        profileAssetId,
        userId,
        "profile",
        userId,
        session,
      );
    });
  } finally {
    await session.endSession();
  }

  let cleanupPending = false;
  if (deleted && profileAssetId) {
    try {
      await cleanupDetachedImage(profileAssetId);
    } catch (error) {
      cleanupPending = true;
      console.error("[image-assets] Deleted user avatar cleanup is pending.", {
        userId,
        assetId: profileAssetId,
        error,
      });
    }
  }
  return { deleted, cleanupPending };
};

export const checkUserBlocked = async (userId: string): Promise<boolean> => {
  if (!ObjectId.isValid(userId)) {
    return false;
  }
  const user = await userCollection.findOne({ _id: new ObjectId(userId) });
  return Boolean(user?.banned ?? user?.isBlocked ?? false);
};