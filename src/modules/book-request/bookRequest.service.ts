import { ObjectId } from "mongodb";
import { bookRequestsCollection, postsCollection } from "../../database/collections.js";
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

  const data: BookRequest = {
    postId: post._id!.toString(),
    postTitle: post.title,
    bookCoverUrl: post.image ?? "",
    sellerId: post.sellerId,
    sellerName: post.sellerName,
    ...(Object.keys(sellerContact).length > 0 ? { sellerContact } : {}),
    requesterId,
    requesterName,
    ...(requesterContact ? { requesterContact } : {}),
    ...(requestData.message ? { message: requestData.message } : {}),
    status: "pending",
    requestDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await bookRequestsCollection.insertOne(data);
  const created = await bookRequestsCollection.findOne({ _id: result.insertedId });
  return created!;
};

export const getSentRequests = async (requesterId: string): Promise<BookRequest[]> => {
  const requests = await bookRequestsCollection
    .find({ requesterId })
    .sort({ createdAt: -1 })
    .toArray();

  return requests.map((request) => {
    if (request.status === "accepted") {
      return request;
    }

    const redacted = { ...request };
    delete redacted.sellerContact;
    return redacted;
  });
};

export const getReceivedRequests = async (sellerId: string): Promise<BookRequest[]> => {
  const requests = await bookRequestsCollection
    .find({ sellerId })
    .sort({ createdAt: -1 })
    .toArray();

  return requests.map((request) => {
    const redacted = { ...request };
    delete redacted.sellerContact;
    return redacted;
  });
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

export const getBookRequestById = async (id: string): Promise<BookRequest | null> => {
  const requestId = toObjectId(id);
  if (!requestId) {
    return null;
  }
  return bookRequestsCollection.findOne({ _id: requestId });
};

export const acceptBookRequest = async (requestId: string, sellerId: string): Promise<{
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
    }
  );

  if (acceptedResult.modifiedCount === 0) {
    return { success: false, message: "Request is no longer in pending status." };
  }

  const post = await postsCollection.findOne({ _id: new ObjectId(request.postId) });
  const postStatus = post?.type === "donate" ? "donated" : "sold";

  await postsCollection.updateOne(
    {
      _id: new ObjectId(request.postId),
    },
    {
      $set: {
        status: postStatus,
        acceptedRequestId: requestId,
        "books.$[].availableStatus": "unavailable",
        updatedAt: new Date(),
      },
    }
  );

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
    }
  );

  return { success: true, message: "Book request accepted successfully." };
};

export const rejectBookRequest = async (requestId: string, sellerId: string): Promise<{
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
    }
  );

  if (result.modifiedCount === 0) {
    return { success: false, message: "Request is no longer in pending status." };
  }

  return { success: true, message: "Request Rejected Successfully." };
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
    }
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
    },
    {
      $set: {
        status: "available",
        acceptedRequestId: null,
        "books.$[].availableStatus": "available",
        updatedAt: new Date(),
      },
    }
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
    }
  );

  return { success: true, message: "Request Cancelled Successfully." };
};