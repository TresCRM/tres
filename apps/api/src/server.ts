import { initTracing } from "./observability/tracing";
initTracing();

import { app } from "./app";
import { connectMongo, disconnectMongo } from "./db/mongoose";
import { attachWebsocket } from "./realtime/ws";
import { bootstrapAdmin } from "./admin/bootstrap";
import { initGracefulShutdown, onShutdown } from "./lifecycle";
import { startCron, stopCron } from "./workers/billing.worker";

const port = Number(process.env.PORT ?? 4000);

initGracefulShutdown();

connectMongo().then(async () => {
  await bootstrapAdmin();
  const server = app.listen(port, () => console.log(`API http://localhost:${port}`));
  attachWebsocket(server); // presence + real-time

  // Register cleanup callbacks
  onShutdown(() => new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  }));
  onShutdown(() => stopCron());
  onShutdown(() => disconnectMongo());

  // Start billing cron (skip in test mode)
  const isTest = process.env.NODE_ENV === "test" || process.env.USE_MEMORY_MONGO === "1";
  if (!isTest) {
    startCron();
  }
}).catch(err => {
  console.error(err, "Mongo connection failed");
  process.exit(1);
});
