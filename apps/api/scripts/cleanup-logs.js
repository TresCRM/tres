const { MongoClient } = require("mongodb");
(async () => {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/trescrm";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const a = await db.collection("activity_logs").deleteMany({ createdAt: { $lt: new Date(Date.now() - 90*86400000) } });
  const e = await db.collection("error_logs").deleteMany({ createdAt: { $lt: new Date(Date.now() - 180*86400000) } });
  console.log(`Deleted activity:${a.deletedCount} error:${e.deletedCount}`);
  await client.close();
})();
