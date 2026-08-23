import app from "./app.js";
import "dotenv/config";
import connectDB from "./database/index.js";
import { env } from "./config/env.js";

const PORT = env.PORT;

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`
==================================================
🚀 BookBridge Server is running successfully
🌐 URL   : http://localhost:${PORT}
📦 Environment : ${env.NODE_ENV}
==================================================
`);
    });
  } catch (error) {
    console.error("❌ Failed to start server");
    console.error(error);
    process.exit(1);
  }
};

startServer();