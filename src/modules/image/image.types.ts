import type { ObjectId, ClientSession } from "mongodb";

export type ImagePurpose = "post" | "profile";
export type ImageAssetStatus =
  | "uploading"
  | "pending"
  | "attached"
  | "deleting"
  | "cleanup_pending"
  | "failed"
  | "deleted";

export interface ImageAsset {
  _id: ObjectId;
  ownerId: string;
  purpose: ImagePurpose;
  publicId: string;
  secureUrl?: string;
  status: ImageAssetStatus;
  attachedTo?: {
    kind: ImagePurpose;
    id: string;
  };
  lastError?: string;
  cleanupAttempts?: number;
  nextAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImageAssetResponse {
  assetId: string;
  secureUrl: string;
}

export interface ImageAssetReference {
  assetId: string | null | undefined;
  ownerId: string;
  purpose: ImagePurpose;
  secureUrl?: string | null;
  attachedTo: {
    kind: ImagePurpose;
    id: string;
  };
  session: ClientSession;
}
