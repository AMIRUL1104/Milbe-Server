import { ObjectId } from "mongodb";
import { bookRequestsCollection, postsCollection } from "../../database/collections.js";
import type { BookRequest, RequestStatus } from "./bookRequest.types.js";
import type { CreateBookRequestInput, CheckBookRequestQueryInput } from "./bookRequest.validation.js";

export const createBookRequest = async (requestData: CreateBookRequestInput): Promise<BookRequest> => {
  const data = {
    ...requestData,
    status: "pending" as RequestStatus,
    requestDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as BookRequest;

  const result = await bookRequestsCollection.insertOne(data);
  const created = await bookRequestsCollection.findOne({ _id: result.insertedId });
  return created!;
};

export const getSentRequests = async (requesterId: string): Promise<BookRequest[]> => {
  return bookRequestsCollection
    .find({ requesterId })
    .sort({ createdAt: -1 })
    .toArray();
};

export const getReceivedRequests = async (sellerId: string): Promise<BookRequest[]> => {
  return bookRequestsCollection
    .find({ sellerId })
    .sort({ createdAt: -1 })
    .toArray();
};

export const checkBookRequest = async (query: CheckBookRequestQueryInput): Promise<{
  canRequest: boolean;
  reason?: string;
}> => {
  const { postId, requesterId, sellerId } = query;

  if (requesterId === sellerId) {
    return { canRequest: false, reason: "own_post" };
  }

  const existingRequest = await bookRequestsCollection.findOne({
    postId,
    requesterId,
  });

  if (existingRequest) {
    return { canRequest: false, reason: "already_requested" };
  }

  return { canRequest: true };
};

export const getBookRequestById = async (id: string): Promise<BookRequest | null> => {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  return bookRequestsCollection.findOne({ _id: new ObjectId(id) });
};

export const acceptBookRequest = async (requestId: string, sellerId: string): Promise<{
  success: boolean;
  message: string;
}> => {
  const request = await bookRequestsCollection.findOne({
    _id: new ObjectId(requestId),
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
      _id: new ObjectId(requestId),
      sellerId,
    },
    {
      $set: {
        status: "accepted",
        updatedAt: new Date(),
      },
    }
  );

  if (acceptedResult.modifiedCount === 0) {
    return { success: false, message: "Failed to accept book request." };
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
      _id: { $ne: new ObjectId(requestId) },
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
  const result = await bookRequestsCollection.updateOne(
    {
      _id: new ObjectId(requestId),
      sellerId,
    },
    {
      $set: {
        status: "rejected",
        updatedAt: new Date(),
      },
    }
  );

  if (result.modifiedCount === 0) {
    return { success: false, message: "Failed to reject book request." };
  }

  return { success: true, message: "Request Rejected Successfully." };
};

export const cancelBookRequest = async (requestId: string): Promise<{
  success: boolean;
  message: string;
}> => {
  const request = await bookRequestsCollection.findOne({
    _id: new ObjectId(requestId),
  });

  if (!request) {
    return { success: false, message: "Book request not found." };
  }

  const result = await bookRequestsCollection.updateOne(
    {
      _id: new ObjectId(requestId),
    },
    {
      $set: {
        status: "cancelled",
        updatedAt: new Date(),
      },
    }
  );

  if (result.modifiedCount === 0) {
    return { success: false, message: "Failed to cancel book request." };
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
      _id: { $ne: new ObjectId(requestId) },
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