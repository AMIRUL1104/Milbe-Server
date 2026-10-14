import { MongoServerError, ObjectId } from "mongodb";

import {
  bookRequestsCollection,
  postsCollection,
  userCollection,
} from "../../database/collections.js";
import { client } from "../../database/index.js";

import { getPostByIdForRequest } from "../post/post.service.js";

import { ApiError } from "../../utils/apiError.js";
import { makeRequestsUrl, queueEmail } from "../email-outbox/queueEmail.js";
import { milestoneForRequestCount } from "../email-outbox/emailTemplates.js";

import type { BookRequest } from "./bookRequest.types.js";

import type { CreateBookRequestInput, GetAdminRequestsQueryInput } from "./bookRequest.validation.js";

const toObjectId = (value: string): ObjectId | null =>
  ObjectId.isValid(value) ? new ObjectId(value) : null;

export const createBookRequest = async (
  requestData: CreateBookRequestInput,
  requesterId: string,
  requesterName: string,
): Promise<BookRequest> => {
  const postId = toObjectId(requestData.postId);

  if (!postId) {
    throw ApiError.badRequest("Invalid post ID.");
  }

  const session = client.startSession();
  let createdRequest: BookRequest | null = null;

  try {
    await session.withTransaction(async () => {
      const post = await postsCollection.findOne(
        { _id: postId, isDeleted: { $ne: true } },
        { session },
      );

      if (!post) {
        throw ApiError.notFound("Post not found.");
      }
      if (post.sellerId === requesterId) {
        throw ApiError.forbidden("You cannot request your own post.");
      }
      if (post.status !== "available") {
        throw ApiError.conflict("This post is no longer available.");
      }
      if (!Number.isSafeInteger(post.requestCount) || post.requestCount < 0) {
        throw ApiError.internal(
          "Request count is not initialized for this post. Run the request-count migration.",
        );
      }

      const existingRequest = await bookRequestsCollection.findOne(
        { postId: postId.toString(), requesterId },
        { session, projection: { _id: 1 } },
      );
      if (existingRequest) {
        throw ApiError.conflict("You have already requested this post.");
      }

      const sellerContact = {
        ...(post.phone ? { phone: post.phone } : {}),
        ...(post.messenger ? { messenger: post.messenger } : {}),
      };
      const requesterContact = requestData.requesterContact?.phone
        ? { phone: requestData.requesterContact.phone }
        : undefined;
      const now = new Date();
      const data: BookRequest = {
        postId: postId.toString(),
        ...(post.slug ? { postSlug: post.slug } : {}),
        postTitle: post.title,
        bookCoverUrl: post.images?.[0]?.url ?? post.image ?? "",
        sellerId: post.sellerId,
        sellerName: post.sellerName,
        sellerDistrict: post.district,
        sellerArea: post.area,
        ...(Object.keys(sellerContact).length > 0 ? { sellerContact } : {}),
        requesterId,
        requesterName,
        ...(requesterContact ? { requesterContact } : {}),
        requesterDistrict: requestData.requesterDistrict,
        requesterArea: requestData.requesterArea,
        ...(requestData.message ? { message: requestData.message } : {}),
        status: "pending",
        requestDate: now,
        createdAt: now,
        updatedAt: now,
      };

      const inserted = await bookRequestsCollection.insertOne(data, { session });
      data._id = inserted.insertedId;

      const updatedPost = await postsCollection.findOneAndUpdate(
        {
          _id: postId,
          status: "available",
          isDeleted: { $ne: true },
        },
        { $inc: { requestCount: 1 }, $set: { updatedAt: now } },
        { session, returnDocument: "after" },
      );
      if (!updatedPost) {
        throw ApiError.conflict("This post is no longer available.");
      }

      const milestone = milestoneForRequestCount(updatedPost.requestCount);
      if (milestone && !updatedPost.acceptedEver) {
        await queueEmail(
          {
            id: `milestone:${postId}:${milestone}`,
            type: "request_milestone",
            postId: postId.toString(),
            recipient: post.sellerEmail,
            payload: {
              kind: "request_milestone",
              recipientName: post.sellerName,
              postTitle: post.title,
              postUrl: makeRequestsUrl(),
              requestCount: milestone,
            },
          },
          session,
        );
      }

      createdRequest = data;
    });
  } catch (error) {
    if (
      error instanceof MongoServerError &&
      error.code === 11000 &&
      error.keyPattern?.postId
    ) {
      throw ApiError.conflict("You have already requested this post.");
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!createdRequest) {
    throw ApiError.internal("Request creation did not complete.");
  }
  return redactRequestForRequester(createdRequest);
};

// ---------------------------------------------------------------------------
// Contact redaction (service-layer access control)
//
// Business rule: contact information unlocks ONLY when a request reaches the
// "accepted" status. Redaction is enforced here (server side) so that no
// private contact data can leak through raw API payloads, regardless of what
// the UI chooses to render.
//
// - Sent requests (viewer = requester):
//     * sellerContact    -> only when status === "accepted"
//     * requesterContact -> own data, always kept
// - Received requests (viewer = seller):
//     * requesterContact -> only when status === "accepted"
//     * sellerContact    -> own data, always kept
// ---------------------------------------------------------------------------

const UNLOCKED_STATUS = "accepted";

const redactRequestForRequester = (request: BookRequest): BookRequest => {
  if (request.status === UNLOCKED_STATUS) {
    return request;
  }

  const redacted = { ...request };

  delete redacted.sellerContact;

  return redacted;
};

const redactRequestForSeller = (request: BookRequest): BookRequest => {
  const redacted = { ...request };

  delete redacted.sellerContact;

  if (request.status !== UNLOCKED_STATUS) {
    delete redacted.requesterContact;
  }

  return redacted;
};

export const getSentRequests = async (
  requesterId: string,
): Promise<BookRequest[]> => {
  const requests = await bookRequestsCollection
    .find({ requesterId })
    .sort({ createdAt: -1 })
    .toArray();

  return requests.map(redactRequestForRequester);
};

export const getReceivedRequests = async (
  sellerId: string,
): Promise<BookRequest[]> => {
  const requests = await bookRequestsCollection
    .find({ sellerId })
    .sort({ createdAt: -1 })
    .toArray();

  return requests.map(redactRequestForSeller);
};

// ---------------------------------------------------------------------------
// Admin: list ALL book requests with search / status filter / sort / pagination
//
// Mirrors `getUsers` (user module): whitelist-based status filter, $or regex
// search across postTitle + sellerName + requesterName, createdAt sort, and
// skip/limit pagination with { requests, total, totalPages, currentPage }.
//
// Admin is a moderator role: raw documents are returned WITHOUT contact
// redaction (unlike sent/received views), matching the admin user-list
// behaviour. No $lookup/populate is needed — postTitle, bookCoverUrl,
// sellerName and requesterName are denormalized onto every BookRequest at
// creation time.
// ---------------------------------------------------------------------------

const toPositiveInt = (value: unknown, fallback: number): number => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(num) || num <= 0) return fallback;
  return num;
};

export const getAllRequestsForAdmin = async (
  query: GetAdminRequestsQueryInput,
) => {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, 10), 100);
  const search = typeof query.search === "string" ? query.search.trim() : "";

  const filter: Record<string, unknown> = {};

  // Whitelist approach: "all" (or any unexpected value) means "no
  // constraint" instead of leaking `undefined` into the filter.
  if (
    query.status === "pending" ||
    query.status === "accepted" ||
    query.status === "rejected" ||
    query.status === "cancelled"
  ) {
    filter.status = query.status;
  }

  if (search) {
    const regex = { $regex: search, $options: "i" };
    filter.$or = [
      { postTitle: regex },
      { sellerName: regex },
      { requesterName: regex },
    ];
  }

  const sortDirection = query.sort === "oldest" ? 1 : -1;

  const [requests, total] = await Promise.all([
    bookRequestsCollection
      .find(filter)
      .sort({ createdAt: sortDirection })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    bookRequestsCollection.countDocuments(filter),
  ]);

  return {
    requests,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    currentPage: page,
  };
};

export const checkBookRequest = async (
  postId: string,
  requesterId: string,
): Promise<{
  canRequest: boolean;
  reason?: string;
}> => {
  const post = await getPostByIdForRequest(postId);

  if (!post) {
    throw ApiError.notFound("Post not found.");
  }

  if (requesterId === post.sellerId) {
    return { canRequest: false, reason: "own_post" };
  }

  if (post.status !== "available") {
    return { canRequest: false, reason: "unavailable" };
  }

  const existingRequest = await bookRequestsCollection.findOne({
    postId: post._id!.toString(),
    requesterId,
  });

  if (existingRequest) {
    return { canRequest: false, reason: "already_requested" };
  }

  return { canRequest: true };
};

export const getBookRequestById = async (
  id: string,
): Promise<BookRequest | null> => {
  const requestId = toObjectId(id);

  if (!requestId) {
    return null;
  }

  return bookRequestsCollection.findOne({ _id: requestId });
};

export const acceptBookRequest = async (
  requestId: string,
  sellerId: string,
): Promise<{
  success: boolean;
  message: string;
}> => {
  const requestObjectId = toObjectId(requestId);

  if (!requestObjectId) {
    return { success: false, message: "Book request not found." };
  }

  const postObjectIdResult = await bookRequestsCollection.findOne(
    { _id: requestObjectId, sellerId },
    { projection: { postId: 1 } },
  );
  if (!postObjectIdResult) {
    return { success: false, message: "Book request not found." };
  }
  const postId = toObjectId(postObjectIdResult.postId);
  if (!postId) {
    throw ApiError.internal("The request references an invalid post ID.");
  }

  const maxLeaseWaitMs = 65_000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxLeaseWaitMs) {
    const currentPost = await postsCollection.findOne(
      { _id: postId },
      { projection: { milestoneEmailLease: 1 } },
    );
    if (!currentPost) {
      return { success: false, message: "Post not found." };
    }
    const lease = currentPost.milestoneEmailLease;
    if (lease && lease.leaseUntil.getTime() > Date.now()) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      continue;
    }

    const session = client.startSession();
    let transactionResult:
      | { kind: "success"; message: string }
      | { kind: "failure"; message: string }
      | { kind: "retry" }
      | null = null;

    try {
      transactionResult = await session.withTransaction(async () => {
        const request = await bookRequestsCollection.findOne(
          { _id: requestObjectId, sellerId, status: "pending" },
          { session },
        );
        if (!request) {
          const currentRequest = await bookRequestsCollection.findOne(
            { _id: requestObjectId, sellerId },
            { session, projection: { _id: 1 } },
          );
          return {
            kind: "failure",
            message: currentRequest
              ? "Request is not in pending status."
              : "Book request not found.",
          };
        }

        const post = await postsCollection.findOne(
          { _id: postId, isDeleted: { $ne: true } },
          { session },
        );
        if (!post || post.status !== "available") {
          return {
            kind: "failure",
            message:
              "This post is no longer available. Another request was already accepted.",
          };
        }

        const now = new Date();
        const releasedRequest = await bookRequestsCollection.updateOne(
          { _id: requestObjectId, sellerId, status: "pending" },
          { $set: { status: "accepted", updatedAt: now } },
          { session },
        );
        if (releasedRequest.modifiedCount === 0) {
          return {
            kind: "failure",
            message: "Request is no longer in pending status.",
          };
        }

        const postUpdate = await postsCollection.updateOne(
          {
            _id: postId,
            status: "available",
            acceptedRequestId: null,
            $or: [
              { "milestoneEmailLease.leaseUntil": { $exists: false } },
              { "milestoneEmailLease.leaseUntil": { $lte: now } },
            ],
          },
          {
            $set: {
              status: post.type === "donate" ? "donated" : "sold",
              acceptedRequestId: requestObjectId.toString(),
              acceptedEver: true,
              "books.$[].availableStatus": "unavailable",
              updatedAt: now,
            },
          },
          { session },
        );
        if (postUpdate.modifiedCount === 0) {
          throw new Error("MILESTONE_EMAIL_LEASE_OR_POST_RACE");
        }

        await bookRequestsCollection.updateMany(
          {
            postId: request.postId,
            _id: { $ne: requestObjectId },
            status: "pending",
          },
          {
            $set: {
              status: "cancelled",
              autoCancelledByRequestId: requestObjectId.toString(),
              updatedAt: now,
            },
          },
          { session },
        );

        const requester = ObjectId.isValid(request.requesterId)
          ? await userCollection.findOne(
              { _id: new ObjectId(request.requesterId) },
              { session, projection: { email: 1, name: 1 } },
            )
          : null;
        await queueEmail(
          {
            id: `accepted:${requestObjectId}`,
            type: "request_accepted",
            postId: request.postId,
            requestId: requestObjectId.toString(),
            ...(requester && typeof requester.email === "string"
              ? { recipient: requester.email }
              : {}),
            payload: {
              kind: "request_accepted",
              recipientName:
                requester && typeof requester.name === "string"
                  ? requester.name
                  : request.requesterName,
              postTitle: request.postTitle,
              postUrl: makeRequestsUrl(),
            },
          },
          session,
        );

        return {
          kind: "success",
          message: "Book request accepted successfully.",
        };
      });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "MILESTONE_EMAIL_LEASE_OR_POST_RACE"
      ) {
        throw error;
      }
      transactionResult = { kind: "retry" };
    } finally {
      await session.endSession();
    }

    if (!transactionResult || transactionResult.kind === "retry") {
      await new Promise((resolve) => setTimeout(resolve, 150));
      continue;
    }
    if (transactionResult.kind === "success") {
      return { success: true, message: transactionResult.message };
    }
    return { success: false, message: transactionResult.message };
  }

  return {
    success: false,
    message: "A milestone email is being finalized. Please try accepting again.",
  };
};

export const rejectBookRequest = async (
  requestId: string,
  sellerId: string,
): Promise<{
  success: boolean;
  message: string;
}> => {
  const requestObjectId = toObjectId(requestId);

  if (!requestObjectId) {
    return { success: false, message: "Book request not found." };
  }

  const request = await bookRequestsCollection.findOne({
    _id: requestObjectId,
    sellerId,
  });

  if (!request) {
    return { success: false, message: "Book request not found." };
  }

  if (request.status !== "pending") {
    return { success: false, message: "Request is not in pending status." };
  }

  const result = await bookRequestsCollection.updateOne(
    {
      _id: requestObjectId,
      sellerId,
      status: "pending",
    },
    {
      $set: {
        status: "rejected",
        updatedAt: new Date(),
      },
    },
  );

  if (result.modifiedCount === 0) {
    return {
      success: false,
      message: "Request is no longer in pending status.",
    };
  }

  return {
    success: true,
    message: "Request Rejected Successfully.",
  };
};

export const cancelBookRequest = async (
  requestId: string,
  userId: string,
): Promise<{
  success: boolean;
  message: string;
}> => {
  const requestObjectId = toObjectId(requestId);

  if (!requestObjectId) {
    return { success: false, message: "Book request not found." };
  }

  const session = client.startSession();
  let result:
    | { success: true; message: string }
    | { success: false; message: string } = {
    success: false,
    message: "Request is no longer in a cancellable status.",
  };

  try {
    await session.withTransaction(async () => {
      const request = await bookRequestsCollection.findOne(
        { _id: requestObjectId },
        { session },
      );
      if (!request) {
        result = { success: false, message: "Book request not found." };
        return;
      }

      const isPendingRequester =
        request.status === "pending" && request.requesterId === userId;
      const isAcceptedSeller =
        request.status === "accepted" && request.sellerId === userId;
      if (!isPendingRequester && !isAcceptedSeller) {
        result = {
          success: false,
          message: "You are not authorized to cancel this request.",
        };
        return;
      }

      const now = new Date();
      const cancelled = await bookRequestsCollection.updateOne(
        {
          _id: requestObjectId,
          ...(isPendingRequester
            ? { requesterId: userId, status: "pending" }
            : { sellerId: userId, status: "accepted" }),
        },
        {
          $set: { status: "cancelled", updatedAt: now },
          $unset: { autoCancelledByRequestId: "" },
        },
        { session },
      );
      if (cancelled.modifiedCount === 0) {
        result = {
          success: false,
          message: "Request is no longer in a cancellable status.",
        };
        return;
      }

      if (isAcceptedSeller) {
        const postId = toObjectId(request.postId);
        if (!postId) {
          throw ApiError.internal("The request references an invalid post ID.");
        }

        const released = await postsCollection.updateOne(
          {
            _id: postId,
            acceptedRequestId: requestObjectId.toString(),
          },
          {
            $set: {
              status: "available",
              acceptedRequestId: null,
              "books.$[].availableStatus": "available",
              updatedAt: now,
            },
          },
          { session },
        );

        if (released.matchedCount !== 1 || released.modifiedCount !== 1) {
          throw ApiError.conflict(
            "The accepted post could not be released; the request was not cancelled.",
          );
        }

        await bookRequestsCollection.updateMany(
          {
            postId: request.postId,
            status: "cancelled",
            autoCancelledByRequestId: requestObjectId.toString(),
          },
          {
            $set: { status: "pending", updatedAt: now },
            $unset: { autoCancelledByRequestId: "" },
          },
          { session },
        );
      }

      result = {
        success: true,
        message: "Request Cancelled Successfully.",
      };
    });
  } finally {
    await session.endSession();
  }

  return result;
};
