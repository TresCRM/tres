/**
 * When a customer replies to a ticket (via widget or tracking-link portal),
 * notify every active staff user in the tenant:
 *   1. Create an in-app Notification row (always)
 *   2. Send an email if the user's notificationPreferences.email.ticket_replied is truthy (default: true)
 *   3. Push a realtime "notification_created" WS event for instant badge/toast updates
 *
 * Scope decision: recipients = every ACTIVE user in the tenant (assignee + all staff roles).
 */
import { bus } from "../emitter";
import { Ticket } from "../../models/Ticket";
import { User } from "../../models/User";
import { Notification } from "../../models/Notification";
import { sendEmail } from "../../services/mailer";
import { asObjectId } from "../../utils/auth";
import { ENV } from "../../config/env";

const TRUNCATE = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function notifyStaffOnReply() {
  bus.on("ticket", async (evt: any) => {
    if (evt?.event !== "ticket.replied") return;
    // Only notify on customer-originated replies; agent replies don't need to bug agents.
    if (evt.isAgent) return;

    const { tenantId, ticketId } = evt;
    if (!tenantId || !ticketId) return;

    try {
      const ticket = await Ticket.findById(asObjectId(ticketId)).lean();
      if (!ticket) return;

      const recipients = await User.find(
        { tenantId: asObjectId(tenantId), status: "ACTIVE" },
        { email: 1, notificationPreferences: 1, firstName: 1 },
      ).lean();
      if (recipients.length === 0) return;

      const subject = TRUNCATE(ticket.subject || "(no subject)", 80);
      const customer = ticket.customerEmail || "a customer";
      const ticketUrl = `${ENV.FRONTEND_ORIGIN}/tickets/${ticket._id}`;

      const title = `New reply on ticket "${subject}"`;
      const body = `${customer} replied to ticket "${subject}".`;

      // 1. Batch-create in-app notifications (one doc per recipient)
      const notifDocs = recipients.map((u) => ({
        tenantId: asObjectId(tenantId),
        userId: u._id,
        type: "ticket.replied",
        title,
        body,
        entityType: "ticket",
        entityId: ticket._id,
      }));
      const created = await Notification.insertMany(notifDocs, { ordered: false });

      // 2. Push realtime WS event so connected clients bump the badge instantly
      try {
        for (const n of created) {
          (global as any).notifyUser?.(String(tenantId), String(n.userId), {
            type: "notification_created",
            notification: {
              _id: String(n._id),
              type: n.type,
              title: n.title,
              body: n.body,
              entityType: n.entityType,
              entityId: n.entityId ? String(n.entityId) : undefined,
              createdAt: n.createdAt,
            },
          });
        }
      } catch (e) {
        // WS failure must never abort the notification pipeline
        console.warn("[notifyStaffOnReply] ws push failed", (e as any)?.message);
      }

      // 3. Send email to users who haven't disabled the preference
      const html = [
        `<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; color: #111827;">`,
        `  <h2 style="margin: 0 0 8px; font-size: 18px;">New reply on ticket</h2>`,
        `  <p style="color: #374151; margin: 0 0 4px;"><strong>${subject}</strong></p>`,
        `  <p style="color: #6b7280; margin: 0 0 16px; font-size: 13px;">Replied by ${customer}</p>`,
        `  <a href="${ticketUrl}" style="display: inline-block; background: #4F46E5; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open ticket</a>`,
        `  <p style="color: #9ca3af; margin: 24px 0 0; font-size: 12px;">You're receiving this because you're a member of this workspace. Update your preferences in Profile → Notifications.</p>`,
        `</div>`,
      ].join("\n");
      const text = `New reply on ticket "${subject}" from ${customer}\n\nOpen: ${ticketUrl}`;

      await Promise.all(
        recipients.map(async (u) => {
          const pref = u.notificationPreferences?.email?.ticket_replied;
          // default true when pref or the whole block is unset
          if (pref === false) return;
          try {
            await sendEmail({
              to: u.email,
              subject: `[Ticket] ${subject}`,
              html,
              text,
              messageKey: `ticket_replied_${ticket._id}_${u._id}`,
            });
          } catch (e) {
            console.error("[notifyStaffOnReply] email send failed", {
              to: u.email,
              ticketId: String(ticket._id),
              message: (e as any)?.message,
            });
          }
        }),
      );
    } catch (e) {
      console.error("[notifyStaffOnReply] handler error", (e as any)?.message);
    }
  });
}
