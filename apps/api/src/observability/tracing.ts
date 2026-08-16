/**
 * OpenTelemetry tracing bootstrap.
 *
 * All OTel packages are loaded defensively via try/catch require() so the
 * application starts normally when they are not installed.
 */

let otelApi: any = null;

try {
  otelApi = require("@opentelemetry/api");
} catch {
  // optional dependency
}

export function initTracing(): void {
  let NodeSDK: any;
  let getNodeAutoInstrumentations: any;
  let OTLPTraceExporter: any;
  let Resource: any;
  let SemanticResourceAttributes: any;

  try {
    NodeSDK = require("@opentelemetry/sdk-node").NodeSDK;
    getNodeAutoInstrumentations =
      require("@opentelemetry/auto-instrumentations-node").getNodeAutoInstrumentations;
    OTLPTraceExporter =
      require("@opentelemetry/exporter-trace-otlp-http").OTLPTraceExporter;
    // v2+: resourceFromAttributes(); v1: Resource class
    const resources = require("@opentelemetry/resources");
    Resource = resources.resourceFromAttributes || resources.Resource;
  } catch {
    console.warn(
      "[tracing] OpenTelemetry packages not installed -- tracing disabled. " +
        "Install @opentelemetry/sdk-node, @opentelemetry/auto-instrumentations-node, " +
        "and @opentelemetry/exporter-trace-otlp-http to enable."
    );
    return;
  }

  try {
    const endpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";

    const attrs = {
      "service.name": "tres-crm-api",
      "service.version": "1.0.0",
      "deployment.environment": process.env.NODE_ENV || "development",
    };
    // v2+: resourceFromAttributes(attrs); v1: new Resource(attrs)
    const resource = typeof Resource === "function" && !Resource.prototype
      ? Resource(attrs)
      : new Resource(attrs);

    const traceExporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });

    const sdk = new NodeSDK({
      resource,
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-http": { enabled: true },
          "@opentelemetry/instrumentation-express": { enabled: true },
          "@opentelemetry/instrumentation-mongoose": { enabled: true },
          // disable noisy fs instrumentation
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
    });

    sdk.start();
    console.log("[tracing] OpenTelemetry initialized -- exporting to", endpoint);
  } catch (err) {
    console.error("[tracing] Failed to initialize OpenTelemetry:", err);
  }
}

/**
 * Returns the current span's traceId, or null when tracing is unavailable.
 */
export function getTraceId(): string | null {
  if (!otelApi) return null;
  try {
    const span = otelApi.trace.getSpan(otelApi.context.active());
    if (!span) return null;
    const ctx = span.spanContext();
    // A zero traceId means no active trace
    if (!ctx || ctx.traceId === "00000000000000000000000000000000") return null;
    return ctx.traceId;
  } catch {
    return null;
  }
}
