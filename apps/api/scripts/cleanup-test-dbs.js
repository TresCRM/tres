// Run with: pnpm db:test:clean
const { MongoClient } = require('mongodb');

(async () => {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/trescrm";
  const client = new MongoClient(uri);
  await client.connect();
  const admin = client.db().admin();
  const { databases } = await admin.listDatabases();
  const victims = databases
    .map(d => d.name)
    .filter(n => /^trescrm_test_/.test(n));
  for (const name of victims) {
    console.log("Dropping", name);
    await client.db(name).dropDatabase();
  }
  await client.close();
  console.log("✅ Done");
})().catch(e => { console.error(e); process.exit(1); });
