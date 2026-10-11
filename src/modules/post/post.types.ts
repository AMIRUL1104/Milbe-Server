import type { ObjectId } from "mongodb";

export type ListingType = "sell" | "donate";
export type PostStatus = "available" | "sold" | "donated";
export type AvailableStatus = "available" | "unavailable";
export type BookCondition = "new" | "like_new" | "good" | "fair";

export interface PostBook {
  // `| undefined` on optional keys keeps zod v4 output assignable under
  // exactOptionalPropertyTypes.
  bookId?: string | undefined;
  publisherId?: string | undefined;
  bookName?: string | undefined;
  title?: string | undefined;
  name?: string | undefined;
  author?: string | undefined;
  publisherName?: string | undefined;
  availableStatus: AvailableStatus;
}

export interface Post {
  _id?: ObjectId;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  title: string;
  slug: string;
  searchSlug?: string;
  searchKeywords?: string[];
  type: ListingType;
  image: string;
  totalPrice: number | null;
  overallCondition: BookCondition;
  district: string;
  area: string;
  phone: string;
  messenger?: string;
  whatsappOnly?: boolean;
  description?: string;
  category?: string;
  status: PostStatus;
  acceptedRequestId?: string | null;
  acceptedEver: boolean;
  requestCount: number;
  milestoneEmailLease?: {
    eventId: string;
    token: string;
    leaseUntil: Date;
  };
  isDeleted?: boolean;
  books: PostBook[];
  publishedAt: Date;
  updatedAt?: Date;
}
