import mongoose from "mongoose";
import { ENV } from "../config/env";

// Optional: safer default on Windows (localhost can be finicky behind Docker)
// Fallback only if ENV.MONGO_URI isn't set
const DEFAULT_URI = "mongodb://127.0.0.1:27017/trescrm";

let connecting: Promise<typeof mongoose> | null = null;

export async function connectMongo() {
  // Don’t connect when tests run with mongodb-memory-server
  const isTest = process.env.NODE_ENV === "test" || process.env.USE_MEMORY_MONGO === "1";
  if (isTest) return;

  if (mongoose.connection.readyState === 1) return; // already connected
  if (connecting) return connecting;

  const uri = ENV?.MONGO_URI || process.env.MONGO_URL || DEFAULT_URI;

  // (Optional) helpful settings
  // mongoose.set("bufferCommands", false); // fail fast if not connected
  // mongoose.set("strictQuery", true);

  connecting = mongoose.connect(uri, { autoIndex: true })
    .then((m) => {
      console.log(`[db] connected ${uri}`);
      return m;
    })
    .finally(() => { connecting = null; });

  return connecting;
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log("[db] disconnected");
  }
}

export default mongoose;
