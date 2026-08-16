import { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";

// Shared registry used by routes to register schemas
export const registry = new OpenAPIRegistry();
// Register global Bearer auth (JWT)
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});
// Register API key auth
registry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "x-api-key",
});

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "TRES CRM API",
      version: "1.0.0",
      description:
        "REST API for TRES CRM — tickets, customers, messaging, live chat, and more.",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerAuth: [] }, { ApiKeyAuth: [] }],
  });
}

export function mountDocs(app: Express) {
  const doc = generateOpenApiDocument();

  // Serve JSON for Postman import by URL
  app.get("/docs/openapi.json", (_req, res) => res.json(doc));

  // Swagger UI
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(doc));

  console.log("[docs] Swagger UI mounted at /docs");
}
