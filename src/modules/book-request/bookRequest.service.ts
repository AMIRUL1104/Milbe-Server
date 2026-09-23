import { ObjectId } from "mongodb";

import {
  bookRequestsCollection,
  postsCollection,
} from "../../database/collections.js";

import { getPostByIdForRequest } from "../post/post.service.js";

import { ApiError } from "../../utils/apiError.js";

import type { BookRequest } from "./bookRequest.types.js";

import type { CreateBookRequestInput } from "./bookRequest.validation.js";

const toObjectId = (value: string): ObjectId | null =>
  ObjectId.isValid(value) ? new ObjectId(value) : null;

export const createBookRequest = async (
  requestData: CreateBookRequestInput,
  requesterId: string,
  requesterName: string,
  fallbackRequesterDistrict?: string,
  fallbackRequesterArea?: string,
): Promise<BookRequest> => {
  const postId = toObjectId(requestData.postId);

  if (!postId) {
    throw ApiError.badRequest("Invalid post ID.");
  }

  const post = await getPostByIdForRequest(requestData.postId);

  if (!post) {
    throw ApiError.notFound("Post not found.");
  }

  if (post.sellerId === requesterId) {
    throw ApiError.forbidden("You cannot request your own post.");
  }

  const sellerContact = {
    ...(post.phone ? { phone: post.phone } : {}),
    ...(post.messenger ? { messenger: post.messenger } : {}),
  };

  const requesterContact = requestData.requesterContact?.phone
    ? { phone: requestData.requesterContact.phone }
    : undefined;

  // ---------------------------------------------------------------------------
  // Location snapshot
  //
  // - Requester location: client-submitted (user-editable in the request
  //   form, same as phone). Falls back to the authenticated user's profile
  //   location (server-side, from `user` document) when omitted.
  // - Seller location: ALWAYS resolved server-side from the fetched post
  //   document. Client-provided seller location is never trusted.
  // ---------------------------------------------------------------------------
  const requesterDistrict =
    requestData.requesterDistrict?.trim() || fallbackRequesterDistrict || undefined;
  const requesterArea =
    requestData.requesterArea?.trim() || fallbackRequesterArea || undefined;

  const data: BookRequest = {
    postId: post._id!.toString(),
    postTitle: post.title,
    bookCoverUrl: post.image ?? "",
    sellerId: post.sellerId,
    sellerName: post.sellerName,
    sellerDistrict: post.district,
    sellerArea: post.area,
    ...(Object.keys(sellerContact).length > 0 ? { sellerContact } : {}),
    requesterId,
    requesterName,
    ...(requesterContact ? { requesterContact } : {}),
    ...(requesterDistrict ? { requesterDistrict } : {}),
    ...(requesterArea ? { requesterArea } : {}),
    ...(requestData.message ? { message: requestData.message } : {}),
    status: "pending",
    requestDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await bookRequestsCollection.insertOne(data);

  const created = await bookRequestsCollection.findOne({
    _id: result.insertedId,
  });

  return redactRequestForRequester(created!);
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

  // ---------------------------------------------------------------------------
  // Race-safe single-accept guard (atomic post claim)
  //
  // The post itself acts as the lock. The conditional update below succeeds
  // for exactly ONE concurrent accept call, because MongoDB applies it
  // atomically: the first caller flips acceptedRequestId from null to this
  // request's id, and every concurrent caller matches zero documents.
  // ---------------------------------------------------------------------------

  const post = await postsCollection.findOne({
    _id: new ObjectId(request.postId),
  });

  const postStatus = post?.type === "donate" ? "donated" : "sold";

  let postClaimResult;

  try {
    postClaimResult = await postsCollection.updateOne(
      {
        _id: new ObjectId(request.postId),

        // Only a still-available post with no accepted request can be claimed.
        status: "available",
        acceptedRequestId: null,
      },
      {
        $set: {
          status: postStatus,
          acceptedRequestId: requestId,
          "books.$[].availableStatus": "unavailable",
          updatedAt: new Date(),
        },
      },
    );
  } catch {
    // Retry once on transient network/primary-stepdown errors before giving up.
    postClaimResult = await postsCollection.updateOne(
      {
        _id: new ObjectId(request.postId),
        status: "available",
        acceptedRequestId: null,
      },
      {
        $set: {
          status: postStatus,
          acceptedRequestId: requestId,
          "books.$[].availableStatus": "unavailable",
          updatedAt: new Date(),
        },
      },
    );
  }

  if (postClaimResult.modifiedCount === 0) {
    // Another request for this post was accepted first (or the post is no
    // longer available) — this accept must lose the race.
    return {
      success: false,
      message:
        "This post is no longer available. Another request was already accepted.",
    };
  }

  // Post is claimed by this request — now mark the request as accepted.
  const acceptedResult = await bookRequestsCollection.updateOne(
    {
      _id: requestObjectId,
      sellerId,
      status: "pending",
    },
    {
      $set: {
        status: "accepted",
        updatedAt: new Date(),
      },
    },
  );

  if (acceptedResult.modifiedCount === 0) {
    // Extremely unlikely (request got rejected between our checks and the
    // post claim). Roll the post back so it is not stranded as sold/donated.
    await postsCollection.updateOne(
      {
        _id: new ObjectId(request.postId),
        acceptedRequestId: requestId,
      },
      {
        $set: {
          status: "available",
          acceptedRequestId: null,
          "books.$[].availableStatus": "available",
          updatedAt: new Date(),
        },
      },
    );

    return {
      success: false,
      message: "Request is no longer in pending status.",
    };
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
        updatedAt: new Date(),
      },
    },
  );

  return {
    success: true,
    message: "Book request accepted successfully.",
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

  const request = await bookRequestsCollection.findOne({
    _id: requestObjectId,
  });

  if (!request) {
    return { success: false, message: "Book request not found." };
  }

  const canCancel =
    (request.status === "pending" && request.requesterId === userId) ||
    (request.status === "accepted" && request.sellerId === userId);

  if (!canCancel) {
    return {
      success: false,
      message: "You are not authorized to cancel this request.",
    };
  }

  const result = await bookRequestsCollection.updateOne(
    {
      _id: requestObjectId,
      ...(request.status === "pending"
        ? { requesterId: userId, status: "pending" }
        : { sellerId: userId, status: "accepted" }),
    },
    {
      $set: {
        status: "cancelled",
        updatedAt: new Date(),
      },
    },
  );

  if (result.modifiedCount === 0) {
    return {
      success: false,
      message: "Request is no longer in a cancellable status.",
    };
  }

  await postsCollection.updateOne(
    {
      _id: new ObjectId(request.postId),

      // Safety guard: only release the post if it is still claimed by THIS
      // request, so we never clobber a newer accepted request's claim.
      acceptedRequestId: requestObjectId.toString(),
    },
    {
      $set: {
        status: "available",
        acceptedRequestId: null,
        "books.$[].availableStatus": "available",
        updatedAt: new Date(),
      },
    },
  );

  await bookRequestsCollection.updateMany(
    {
      postId: request.postId,
      _id: { $ne: requestObjectId },
      status: "cancelled",
    },
    {
      $set: {
        status: "pending",
        updatedAt: new Date(),
      },
    },
  );

  return {
    success: true,
    message: "Request Cancelled Successfully.",
  };
};
