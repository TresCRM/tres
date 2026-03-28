import { emitTicketEvent } from "../../events/emitter";

test("emitTicketEvent calls bus and ws if present", () => {
  const calls:any[] = [];
  // @ts-ignore
  global.notifyTicket = (tid:string, ticketId:string, payload:any) => calls.push({ type:"ws", tid, ticketId, payload });
  const orig = require("../../events/bus");
  jest.spyOn(orig, "busPublish").mockImplementation((_s, _d) => { calls.push({ type:"nats" }); });

  emitTicketEvent("T1", { event:"ticket.created", ticketId:"X" });
  expect(calls.find(c => c.type==="ws")).toBeTruthy();
  expect(calls.find(c => c.type==="nats")).toBeTruthy();
});
