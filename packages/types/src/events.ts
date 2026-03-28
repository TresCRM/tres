import { z } from "zod";

export const TicketCreated = z.object({
  event: z.literal("ticket.created"),
  tenantId: z.string(),
  ticketId: z.string(),
  createdBy: z.string()
});
export const TicketReplied = z.object({
  event: z.literal("ticket.replied"),
  tenantId: z.string(),
  ticketId: z.string(),
  replyBy: z.string(),
  isAgent: z.boolean()
});
export const PresenceChanged = z.object({
  event: z.literal("presence.changed"),
  tenantId: z.string(),
  userId: z.string(),
  status: z.enum(["online","offline"])
});

export type TicketCreated = z.infer<typeof TicketCreated>;
export type TicketReplied = z.infer<typeof TicketReplied>;
export type PresenceChanged = z.infer<typeof PresenceChanged>;
