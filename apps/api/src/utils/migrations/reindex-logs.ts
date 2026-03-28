import "dotenv/config";
import mongoose from "mongoose";
import { ActivityLog } from "../../models/ActivityLog";
import { ErrorLog } from "../../models/ErrorLog";

async function run() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/trescrm";
  await mongoose.connect(uri);

  await ActivityLog.collection.dropIndexes().catch(() => {});
  await ErrorLog.collection.dropIndexes().catch(() => {});
  await ActivityLog.syncIndexes();
  await ErrorLog.syncIndexes();

  console.log("Logs reindexed");
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
