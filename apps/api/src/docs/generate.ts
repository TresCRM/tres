import { writeFileSync } from "fs";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./swagger";

// Import routes modules so they register themselves with `registry`:
import "../routes/auth";
import "../routes/subscriptions";
import "../routes/tickets";

const generator = new OpenApiGeneratorV3(registry.definitions);
const doc = generator.generateDocument({
  openapi: "3.0.0",
  info: { title: "TRES CRM API", version: "1.0.0" }
});
writeFileSync("apps/api/openapi.json", JSON.stringify(doc, null, 2));
console.log("Generated apps/api/openapi.json");
