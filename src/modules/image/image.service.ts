import { ObjectId } from "mongodb";
import { client } from "../../database/index.js";
import { imageAssetsCollection } from "../../database/collections.js";
import { requireCloudinary } from "../../config/cloudinary.js";
import { ApiError } from "../../utils/apiError.js";
import type {
  ImageAsset,
  ImageAssetReference,
  ImageAssetResponse,
  ImagePurpose,
} from "./image.types.js";

const assetIdFromString = (assetId: string): ObjectId | null =>
  ObjectId.isValid(assetId) ? new ObjectId(assetId) : null;

const uploadBuffer = (
  buffer: Buffer,
  options: { asset_folder: string; public_id: string },
): Promise<{ secure_url: string; public_id: string }> =>
  new Promise((resolve, reject) => {
    const cloudinary = requireCloudinary();
    const stream = cloudinary.uploader.upload_stream(
      {
        ...options,
        resource_type: "image",
        overwrite: false,
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result?.secure_url || !result.public_id) {
          reject(new Error("Cloudinary returned an incomplete upload result."));
          return;
        }
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );
    stream.end(buffer);
  });

async function destroyOnCloudinary(publicId: string): Promise<void> {
  const result = await requireCloudinary().uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });

  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary did not confirm deletion (${result.result}).`);
  }
}

export async function uploadImage(
  ownerId: string,
  purpose: ImagePurpose,
  buffer: Buffer,
): Promise<ImageAssetResponse> {
  requireCloudinary();
  const now = new Date();
  const assetId = new ObjectId();
  const publicId = `milbe/${ownerId}/${purpose}/${assetId.toString()}`;
  const asset: ImageAsset = {
    _id: assetId,
    ownerId,
    purpose,
    publicId,
    status: "uploading",
    createdAt: now,
    updatedAt: now,
  };

  await imageAssetsCollection.insertOne(asset);

  try {
    const uploaded = await uploadBuffer(buffer, {
      asset_folder: `milbe/${ownerId}/${purpose}`,
      public_id: publicId,
    });
    if (uploaded.public_id !== publicId) {
      throw new Error("Cloudinary returned an unexpected public ID.");
    }

    const updated = await imageAssetsCollection.updateOne(
      { _id: assetId, ownerId, status: "uploading" },
      {
        $set: {
          secureUrl: uploaded.secure_url,
          status: "pending",
          updatedAt: new Date(),
        },
        $unset: { lastError: "" },
      },
    );

    if (updated.modifiedCount !== 1) {
      await destroyOnCloudinary(publicId);
      throw new Error("Could not persist the uploaded image record.");
    }

    return { assetId: assetId.toString(), secureUrl: uploaded.secure_url };
  } catch (error) {
    await imageAssetsCollection.updateOne(
      { _id: assetId, status: "uploading" },
      {
        $set: {
          status: "cleanup_pending",
          lastError: error instanceof Error ? error.message : "Upload failed.",
          updatedAt: new Date(),
        },
      },
    );
    throw error;
  }
}

async function beginDelete(
  asset: ImageAsset,
): Promise<boolean> {
  const result = await imageAssetsCollection.updateOne(
    {
      _id: asset._id,
      status: { $in: ["pending", "cleanup_pending"] },
      attachedTo: { $exists: false },
    },
    {
      $set: { status: "deleting", updatedAt: new Date() },
    },
  );
  return result.modifiedCount === 1;
}

async function deletePendingAsset(asset: ImageAsset): Promise<void> {
  if (!(await beginDelete(asset))) {
    throw ApiError.conflict("Image is already being deleted or is in use.");
  }

  try {
    await destroyOnCloudinary(asset.publicId);
    await imageAssetsCollection.updateOne(
      { _id: asset._id, status: "deleting" },
      {
        $set: { status: "deleted", updatedAt: new Date() },
        $unset: { secureUrl: "", lastError: "", nextAttemptAt: "" },
      },
    );
  } catch (error) {
    const attempts = (asset.cleanupAttempts ?? 0) + 1;
    const retryDelayMs = Math.min(
      24 * 60 * 60_000,
      60_000 * 2 ** Math.min(attempts - 1, 10),
    );
    await imageAssetsCollection.updateOne(
      { _id: asset._id, status: "deleting" },
      {
        $set: {
          status: "cleanup_pending",
          lastError: error instanceof Error ? error.message : "Delete failed.",
          nextAttemptAt: new Date(Date.now() + retryDelayMs),
          updatedAt: new Date(),
        },
        $inc: { cleanupAttempts: 1 },
      },
    );
    throw new ApiError("Cloudinary could not confirm image deletion.", 502);
  }
}

export async function deletePendingImage(
  assetId: string,
  ownerId: string,
): Promise<void> {
  const id = assetIdFromString(assetId);
  if (!id) throw ApiError.badRequest("Invalid image asset ID.");

  const asset = await imageAssetsCollection.findOne({ _id: id, ownerId });
  if (!asset) throw ApiError.notFound("Image asset not found.");
  if (asset.status === "deleted") return;
  if (asset.status === "attached" || asset.attachedTo) {
    throw ApiError.conflict("Image is in use and cannot be deleted directly.");
  }
  if (asset.status !== "pending" && asset.status !== "cleanup_pending") {
    throw ApiError.conflict("Image is not ready to be deleted.");
  }

  await deletePendingAsset(asset);
}

export async function assertPendingImage(
  assetId: string,
  ownerId: string,
  purpose: ImagePurpose,
  secureUrl: string | null | undefined,
): Promise<void> {
  const id = assetIdFromString(assetId);
  if (!id || !secureUrl) {
    throw ApiError.badRequest("Invalid image asset reference.");
  }
  const asset = await imageAssetsCollection.findOne({
    _id: id,
    ownerId,
    purpose,
    secureUrl,
    status: "pending",
    attachedTo: { $exists: false },
  });
  if (!asset) {
    throw ApiError.forbidden("Image asset is invalid, already used, or not yours.");
  }
}

export async function attachPendingImage(
  reference: ImageAssetReference,
): Promise<void> {
  if (!reference.assetId) {
    if (reference.secureUrl && isCloudinaryUrl(reference.secureUrl)) {
      throw ApiError.badRequest("A Cloudinary image must include its asset ID.");
    }
    return;
  }

  const id = assetIdFromString(reference.assetId);
  if (!id || !reference.secureUrl) {
    throw ApiError.badRequest("Invalid image asset reference.");
  }

  const result = await imageAssetsCollection.updateOne(
    {
      _id: id,
      ownerId: reference.ownerId,
      purpose: reference.purpose,
      secureUrl: reference.secureUrl,
      status: "pending",
      attachedTo: { $exists: false },
    },
    {
      $set: {
        status: "attached",
        attachedTo: reference.attachedTo,
        updatedAt: new Date(),
      },
    },
    { session: reference.session },
  );

  if (result.modifiedCount !== 1) {
    throw ApiError.forbidden("Image asset is invalid, already used, or not yours.");
  }
}

export async function detachImageAsset(
  assetId: string | null | undefined,
  ownerId: string,
  kind: ImagePurpose,
  recordId: string,
  session: import("mongodb").ClientSession,
): Promise<void> {
  if (!assetId) return;
  const id = assetIdFromString(assetId);
  if (!id) throw ApiError.conflict("Stored image asset reference is invalid.");

  const result = await imageAssetsCollection.updateOne(
    {
      _id: id,
      ownerId,
      status: "attached",
      "attachedTo.kind": kind,
      "attachedTo.id": recordId,
    },
    {
      $set: { status: "pending", updatedAt: new Date() },
      $unset: { attachedTo: "" },
    },
    { session },
  );
  if (result.modifiedCount !== 1) {
    throw ApiError.conflict("Image asset reference could not be detached.");
  }
}

export async function cleanupDetachedImage(assetId: string | null | undefined) {
  if (!assetId) return;
  const id = assetIdFromString(assetId);
  if (!id) return;
  const asset = await imageAssetsCollection.findOne({
    _id: id,
    status: { $in: ["pending", "cleanup_pending"] },
    attachedTo: { $exists: false },
  });
  if (!asset) return;

  await deletePendingAsset(asset);
}

export async function retryPendingImageCleanup(): Promise<void> {
  const now = new Date();
  const candidates = await imageAssetsCollection
    .find({
      $or: [
        {
          status: "cleanup_pending",
          $or: [
            { nextAttemptAt: { $lte: now } },
            { nextAttemptAt: { $exists: false } },
          ],
        },
        {
          status: "pending",
          createdAt: { $lte: new Date(now.getTime() - 24 * 60 * 60_000) },
          attachedTo: { $exists: false },
        },
        {
          status: "uploading",
          createdAt: { $lte: new Date(now.getTime() - 60 * 60_000) },
          attachedTo: { $exists: false },
        },
        {
          status: "deleting",
          updatedAt: { $lte: new Date(now.getTime() - 2 * 60_000) },
          attachedTo: { $exists: false },
        },
      ],
    })
    .sort({ updatedAt: 1 })
    .limit(25)
    .toArray();

  for (const candidate of candidates) {
    if (candidate.status === "uploading" || candidate.status === "deleting") {
      await imageAssetsCollection.updateOne(
        { _id: candidate._id, status: candidate.status },
        { $set: { status: "cleanup_pending", updatedAt: new Date() } },
      );
    }
    const current = await imageAssetsCollection.findOne({
      _id: candidate._id,
      status: { $in: ["pending", "cleanup_pending"] },
      attachedTo: { $exists: false },
    });
    if (!current) continue;

    try {
      await deletePendingAsset(current);
    } catch (error) {
      console.error("[image-assets] Scheduled image cleanup failed.", {
        assetId: candidate._id.toString(),
        attempts: (current.cleanupAttempts ?? 0) + 1,
        error,
      });
    }
  }
}

export function isCloudinaryUrl(value: string): boolean {
  try {
    return new URL(value).hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}
