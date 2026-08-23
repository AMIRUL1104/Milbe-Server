import { publishersCollection } from "../../database/collections.js";
import type { Publisher } from "./publisher.types.js";

export const getPublishers = async (): Promise<Publisher[]> => {
  return publishersCollection.find({}).toArray();
};

export const getPublisherById = async (id: string): Promise<Publisher | null> => {
  return publishersCollection.findOne({ _id: id });
};

export const createPublisher = async (data: Omit<Publisher, "_id" | "createdAt">): Promise<Publisher> => {
  const publisher = {
    ...data,
    createdAt: new Date(),
  };
  const result = await publishersCollection.insertOne(publisher);
  return { ...publisher, _id: result.insertedId.toString() };
};

export const updatePublisher = async (id: string, data: Partial<Publisher>): Promise<Publisher | null> => {
  return publishersCollection.findOneAndUpdate(
    { _id: id },
    { $set: data },
    { returnDocument: "after" }
  );
};

export const deletePublisher = async (id: string): Promise<boolean> => {
  const result = await publishersCollection.deleteOne({ _id: id });
  return result.deletedCount > 0;
};