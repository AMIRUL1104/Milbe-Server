import app from "./app.js";
import "dotenv/config";
import connectDB, { client } from "./database/index.js";
import { env } from "./config/env.js";
import { startEmailOutboxWorker } from "./modules/email-outbox/emailOutbox.worker.js";
import { startImageCleanupWorker } from "./modules/image/imageCleanup.worker.js";

const PORT = env.PORT;

const startServer = async () => {
  try {
    await connectDB();

    const stopEmailWorker = startEmailOutboxWorker();
    const stopImageCleanupWorker = startImageCleanupWorker();
    const server = app.listen(PORT, () => {
      console.log(`
==================================================
 🚀 Milbe Server is running successfully
🌐 URL   : http://localhost:${PORT}
📦 Environment : ${env.NODE_ENV}
==================================================
`);
    });

    const shutdown = () => {
      stopEmailWorker();
      stopImageCleanupWorker();
      server.close(() => {
        void client.close();
      });
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    console.error("❌ Failed to start server");
    console.error(error);
    process.exit(1);
  }
};

startServer();