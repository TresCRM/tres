import { connect, JSONCodec, NatsConnection } from "nats";
const jc = JSONCodec<any>();
let nc: NatsConnection | null = null;

export async function busConnect(url?: string) {
  if (nc || !url) return nc;
  nc = await connect({ servers: url });
  return nc;
}

export async function busPublish(subject: string, data: any) {
  if (!nc) return; // in tests, bus may be off
  nc.publish(subject, jc.encode(data));
}

export async function busSubscribe(subject: string, handler: (data:any)=>void) {
  if (!nc) return;
  const sub = nc.subscribe(subject);
  (async () => {
    for await (const m of sub) handler(jc.decode(m.data));
  })();
}
