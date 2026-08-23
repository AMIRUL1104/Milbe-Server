import { pendingPublishersCollection } from "../../database/collections.js";
import type { PendingPublisher } from "./pendingPublisher.types.js";

export const getPendingPublishers = async (): Promise<PendingPublisher[]> => {
  return pendingPublishersCollection.find({}).toArray();
};

export const getPendingPublisherById = async (id: string): Promise<PendingPublisher | null> => {
  return pendingPublishersCollection.findOne({ _id: id });
};

export const createPendingPublisher = async (data: Omit<PendingPublisher, "_id" | "createdAt" | "updatedAt">): Promise<PendingPublisher> => {
  const publisher = {
    ...data,
    status: "pending" as const,
    createdAt: new Date(),
  };
  const result = await pendingPublishersCollection.insertOne(publisher);
  return { ...publisher, _id: result.insertedId.toString() };
};

export const updatePendingPublisher = async (id: string, data: Partial<PendingPublisher>): Promise<PendingPublisher | null> => {
  return pendingPublishersCollection.findOneAndUpdate(
    { _id: id },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
};

export const deletePendingPublisher = async (id: string): Promise<boolean> => {
  const result = await pendingPublishersCollection.deleteOne({ _id: id });
  return result.deletedCount > 0;
};