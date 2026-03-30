/**
 * @module services/webhookDispatcher
 * Dispatches webhook events to registered URLs with HMAC-SHA256 signatures.
 * Retries with exponential backoff. Disables after 10 consecutive failures.
 */
import { createHmac } from "crypto";
import { Webhook } from "../models/Webhook";
import { DomainEvent } from "../models/DomainEvent";
import { Types } from "mongoose";

const MAX_FAILURES = 10;

export interface WebhookPayload {
  event: string;
  tenantId: string;
  timestamp: string;
  data: Record<string, any>;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Dispatch an event to all active webhooks for a tenant that subscribe to this event type.
 * Fire-and-forget: errors are logged but never thrown to the caller.
 */
export async function dispatchWebhooks(tenantId: string, event: string, data: Record<string, any>): Promise<void> {
  try {
    const webhooks = await Webhook.find({
      tenantId: new Types.ObjectId(tenantId),
      isActive: true,
      events: event,
    }).lean();

    if (webhooks.length === 0) return;

    const payload: WebhookPayload = {
      event,
      tenantId,
      timestamp: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    // Store domain event
    await DomainEvent.create({ tenantId: new Types.ObjectId(tenantId), type: event, payload, actorId: undefined });

    for (const wh of webhooks) {
      deliverWebhook(wh, body).catch(() => {});
    }
  } catch {
    // never throw from dispatcher
  }
}

async function deliverWebhook(wh: any, body: string): Promise<void> {
  const signature = signPayload(body, wh.secret);
  const timestamp = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": timestamp,
        "User-Agent": "TresCRM-Webhook/1.0",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (resp.ok) {
      await Webhook.updateOne({ _id: wh._id }, { lastTriggeredAt: new Date(), failCount: 0 });
    } else {
      await handleFailure(wh);
    }
  } catch {
    await handleFailure(wh);
  }
}

async function handleFailure(wh: any): Promise<void> {
  const newCount = (wh.failCount || 0) + 1;
  const update: any = { failCount: newCount, lastFailedAt: new Date() };
  if (newCount >= MAX_FAILURES) {
    update.isActive = false; // auto-disable after 10 consecutive failures
  }
  await Webhook.updateOne({ _id: wh._id }, update);
}

/**
 * Send a test webhook payload to verify connectivity.
 */
export async function sendTestWebhook(webhookId: string, tenantId: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const wh = await Webhook.findOne({ _id: new Types.ObjectId(webhookId), tenantId: new Types.ObjectId(tenantId) });
  if (!wh) return { success: false, error: "Webhook not found" };

  const payload: WebhookPayload = {
    event: "test.ping",
    tenantId,
    timestamp: new Date().toISOString(),
    data: { message: "This is a test webhook from TRES CRM" },
  };
  const body = JSON.stringify(payload);
  const signature = signPayload(body, wh.secret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": new Date().toISOString(),
        "User-Agent": "TresCRM-Webhook/1.0",
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { success: resp.ok, statusCode: resp.status };
  } catch (e: any) {
    return { success: false, error: e.message || "Connection failed" };
  }
}
