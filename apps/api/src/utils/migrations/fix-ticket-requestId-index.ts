import "dotenv/config";
import mongoose from "mongoose";

async function run() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/trescrm";
  await mongoose.connect(uri);
  const coll = mongoose?.connection?.db?.collection("tickets");
  if(coll){
      const indexes = await coll.indexes();
      const has = indexes.find((i) => i.name === "tenantId_1_requestId_1");
      if (has) {
        console.log("Dropping old index tenantId_1_requestId_1 ...");
        await coll.dropIndex("tenantId_1_requestId_1");
      }

      console.log("Creating partial unique index tenantId_1_requestId_1 ...");
      await coll.createIndex(
        { tenantId: 1, requestId: 1 },
        { unique: true, partialFilterExpression: { requestId: { $type: "string" } } }
      );
    }

  console.log("Index fixed.");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
