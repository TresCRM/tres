import { app } from "./app";
import { connectMongo } from "./db/mongoose";
import { attachWebsocket } from "./realtime/ws";
import { bootstrapAdmin } from "./admin/bootstrap";

const port = Number(process.env.PORT ?? 4000);

connectMongo().then(async () => {
  await bootstrapAdmin();
  const server = app.listen(port, () => console.log(`API http://localhost:${port}`));
  attachWebsocket(server); // presence + real-time
}).catch(err => {
  console.error(err, "Mongo connection failed");
  process.exit(1);
});

