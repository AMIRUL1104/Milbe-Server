import type { ObjectId } from "mongodb";

export type RequestStatus = "pending" | "accepted" | "rejected" | "cancelled";

export interface BookRequest {
  _id?: ObjectId;

  postId: string;
  postTitle: string;
  bookCoverUrl: string;

  sellerId: string;
  sellerName: string;
  sellerContact?: {
    phone?: string;
    messenger?: string;
  };

  requesterId: string;
  requesterName: string;
  requesterAvatarUrl?: string;
  requesterContact?: {
    phone?: string;
  };

  message?: string;
  status: RequestStatus;

  requestDate: Date;
  updatedAt?: Date;
  createdAt: Date;
}