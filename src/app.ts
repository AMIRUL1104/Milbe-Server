import "dotenv/config";
import express from "express";
import type { Application, Request, Response } from "express";
import cors from "cors";
import { errorMiddleware, notFoundMiddleware } from "./middleware/error.middleware.js";
import userRoutes from "./modules/user/user.routes.js";
import postRoutes from "./modules/post/post.routes.js";
import bookRequestRoutes from "./modules/book-request/bookRequest.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import locationRoutes from "./modules/location/location.routes.js";
import publisherRoutes from "./modules/publisher/publisher.routes.js";
import pendingPublisherRoutes from "./modules/pending-publisher/pendingPublisher.routes.js";

const app: Application = express();

app.use(
  cors({
    origin: ["http://localhost:3000", process.env.CLIENT_URL!],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/book-requests", bookRequestRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/institutions", locationRoutes);
app.use("/api/publishers", publisherRoutes);
app.use("/api/pending-publishers", pendingPublisherRoutes);

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Milbe Server 🚀",
  });
});

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;