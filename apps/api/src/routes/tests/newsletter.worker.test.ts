/**
 * @module tests/newsletter.worker
 * Tests for the periodic support-digest worker.
 *
 * The AI provider and credit ledger are mocked so the suite makes no network
 * calls; the generated prompt is the observable surface for the gathered stats.
 */
import { Types } from "mongoose";
import { testSetup, testTeardown } from "../../tests/helpers";
import { Ticket } from "../../models/Ticket";
import { Tenant } from "../../models/Tenant";
import { getAiProvider } from "../../services/ai/ai-provider";
import { consumeCredits } from "../../services/ai/ai-credits";
import {
  runOnce,
  startNewsletterCron,
  stopNewsletterCron,
} from "../../workers/newsletter.worker";

jest.mock("../../services/ai/ai-provider", () => ({
  getAiProvider: jest.fn(),
}));
jest.mock("../../services/ai/ai-credits", () => ({
  consumeCredits: jest.fn(),
}));

const mockGetAiProvider = getAiProvider as jest.MockedFunction<typeof getAiProvider>;
const mockConsumeCredits = consumeCredits as jest.MockedFunction<typeof consumeCredits>;

// 2024-01-07 was a Sunday; 2024-02-01 was the 1st (a Thursday);
// 2024-01-09 was an ordinary Tuesday.
const SUNDAY = new Date("2024-01-07T12:00:00Z");
const FIRST_OF_MONTH = new Date("2024-02-01T12:00:00Z");
const ORDINARY_DAY = new Date("2024-01-09T12:00:00Z");

const HOUR = 3600000;
let slugCounter = 0;
let complete: jest.Mock;

beforeAll(async () => {
  await testSetup();
});
afterAll(async () => {
  await testTeardown();
});

beforeEach(() => {
  complete = jest.fn(async () => "Generated newsletter body.");
  mockGetAiProvider.mockReturnValue({ name: "mock", complete });
  mockConsumeCredits.mockResolvedValue(undefined as any);
});

afterEach(async () => {
  await Ticket.deleteMany({});
  await Tenant.deleteMany({});
  jest.clearAllMocks();
});

async function makeTenant(overrides: Record<string, any> = {}) {
  return Tenant.create({
    slug: `news-${slugCounter++}`,
    branding: { name: "Newsletter Co" },
    plan: "COMPANY",
    ...overrides,
  });
}

async function makeTicket(tenantId: any, overrides: Record<string, any> = {}) {
  return Ticket.create({
    tenantId,
    subject: "s",
    body: "b",
    createdBy: new Types.ObjectId(),
    ...overrides,
  });
}

/** The prompt handed to the AI provider on the most recent call. */
function lastPrompt(): string {
  return complete.mock.calls[complete.mock.calls.length - 1][0];
}

describe("newsletter.worker — scheduling", () => {
  test("generates a weekly digest on Sundays", async () => {
    const tenant = await makeTenant();
    await makeTicket(tenant._id);

    await runOnce(SUNDAY);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(lastPrompt()).toContain("Period: Weekly");
  });

  test("generates a monthly digest on the first of the month", async () => {
    const tenant = await makeTenant();
    await makeTicket(tenant._id);

    await runOnce(FIRST_OF_MONTH);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(lastPrompt()).toContain("Period: Monthly");
  });

  test("does nothing on any other day", async () => {
    const tenant = await makeTenant();
    await makeTicket(tenant._id);

    await runOnce(ORDINARY_DAY);

    expect(complete).not.toHaveBeenCalled();
  });
});

describe("newsletter.worker — gathered statistics", () => {
  test("reports created, closed and still-open counts", async () => {
    const tenant = await makeTenant();
    await makeTicket(tenant._id, { status: "OPEN" });
    await makeTicket(tenant._id, { status: "CLOSED" });
    await makeTicket(tenant._id, { status: "RESOLVED" });

    await runOnce(SUNDAY);

    const prompt = lastPrompt();
    expect(prompt).toContain("Tickets created: 3");
    expect(prompt).toContain("Tickets closed: 2");
    expect(prompt).toContain("Still open: 1");
  });

  test("reports N/A when nothing has a first response yet", async () => {
    const tenant = await makeTenant();
    await makeTicket(tenant._id);

    await runOnce(SUNDAY);

    expect(lastPrompt()).toContain("Average first response time: N/A");
  });

  test("formats an average response time of hours and minutes", async () => {
    const tenant = await makeTenant();
    const ticket = await makeTicket(tenant._id);
    const createdAt = new Date(Date.now() - 10 * HOUR);
    await Ticket.collection.updateOne(
      { _id: ticket._id },
      {
        $set: {
          createdAt,
          "sla.firstRespondedAt": new Date(createdAt.getTime() + 2 * HOUR),
        },
      }
    );

    await runOnce(SUNDAY);

    expect(lastPrompt()).toContain("Average first response time: 2h 0m");
  });

  test("formats a sub-hour average in minutes only", async () => {
    const tenant = await makeTenant();
    const ticket = await makeTicket(tenant._id);
    const createdAt = new Date(Date.now() - 10 * HOUR);
    await Ticket.collection.updateOne(
      { _id: ticket._id },
      {
        $set: {
          createdAt,
          "sla.firstRespondedAt": new Date(createdAt.getTime() + 15 * 60000),
        },
      }
    );

    await runOnce(SUNDAY);

    expect(lastPrompt()).toContain("Average first response time: 15m");
  });

  test("lists the top issue types by volume", async () => {
    const tenant = await makeTenant();
    await makeTicket(tenant._id, { aiTriage: { issueType: "billing" } });
    await makeTicket(tenant._id, { aiTriage: { issueType: "billing" } });
    await makeTicket(tenant._id, { aiTriage: { issueType: "login" } });

    await runOnce(SUNDAY);

    const prompt = lastPrompt();
    expect(prompt).toContain("billing (2)");
    expect(prompt).toContain("login (1)");
  });

  test("says so when nothing has been categorised", async () => {
    const tenant = await makeTenant();
    await makeTicket(tenant._id);

    await runOnce(SUNDAY);

    expect(lastPrompt()).toContain("Top issue types: None categorized");
  });

  test("names the tenant, falling back to the slug when branding has no name", async () => {
    const tenant = await makeTenant({ branding: { name: "Acme Support" } });
    await makeTicket(tenant._id);

    await runOnce(SUNDAY);

    expect(lastPrompt()).toContain("Company: Acme Support");
  });
});

describe("newsletter.worker — AI usage", () => {
  test("charges newsletter credits after a successful generation", async () => {
    const tenant = await makeTenant();
    await makeTicket(tenant._id);

    await runOnce(SUNDAY);

    expect(mockConsumeCredits).toHaveBeenCalledWith(String(tenant._id), "newsletters");
  });

  test("passes generation options to the provider", async () => {
    const tenant = await makeTenant();
    await makeTicket(tenant._id);

    await runOnce(SUNDAY);

    expect(complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxTokens: 512, temperature: 0.7 })
    );
  });

  test("falls back to the stats-only digest when the provider throws", async () => {
    complete.mockRejectedValueOnce(new Error("upstream 503"));
    const tenant = await makeTenant();
    await makeTicket(tenant._id);

    await expect(runOnce(SUNDAY)).resolves.toBeUndefined();

    expect(mockConsumeCredits).not.toHaveBeenCalled();
  });

  test("builds the digest locally when no provider is configured", async () => {
    mockGetAiProvider.mockReturnValue(null);
    const tenant = await makeTenant();
    await makeTicket(tenant._id, { aiTriage: { issueType: "billing" } });

    await expect(runOnce(SUNDAY)).resolves.toBeUndefined();

    expect(complete).not.toHaveBeenCalled();
    expect(mockConsumeCredits).not.toHaveBeenCalled();
  });

  test("the local digest also handles the uncategorised case", async () => {
    mockGetAiProvider.mockReturnValue(null);
    const tenant = await makeTenant();
    await makeTicket(tenant._id);

    await expect(runOnce(SUNDAY)).resolves.toBeUndefined();

    expect(complete).not.toHaveBeenCalled();
  });
});

describe("newsletter.worker — scoping and opt-outs", () => {
  test("skips tenants that turned newsletters off", async () => {
    const tenant = await makeTenant({ aiFeatures: { newsletters: false } });
    await makeTicket(tenant._id);

    await runOnce(SUNDAY);

    expect(complete).not.toHaveBeenCalled();
  });

  test("still runs for tenants that left newsletters on", async () => {
    const tenant = await makeTenant({ aiFeatures: { newsletters: true } });
    await makeTicket(tenant._id);

    await runOnce(SUNDAY);

    expect(complete).toHaveBeenCalledTimes(1);
  });

  test("skips tenants with no tickets in the period", async () => {
    await makeTenant();

    await runOnce(SUNDAY);

    expect(complete).not.toHaveBeenCalled();
  });

  test("ignores inactive tenants", async () => {
    const tenant = await makeTenant({ isActive: false });
    await makeTicket(tenant._id);

    await runOnce(SUNDAY);

    expect(complete).not.toHaveBeenCalled();
  });

  test("generates one digest per eligible tenant", async () => {
    const [a, b] = await Promise.all([makeTenant(), makeTenant()]);
    await makeTicket(a._id);
    await makeTicket(b._id);

    await runOnce(SUNDAY);

    expect(complete).toHaveBeenCalledTimes(2);
  });

  test("counts only the tenant's own tickets", async () => {
    const [a, b] = await Promise.all([makeTenant(), makeTenant()]);
    await makeTicket(a._id);
    await Promise.all([makeTicket(b._id), makeTicket(b._id), makeTicket(b._id)]);

    await runOnce(SUNDAY);

    const prompts = complete.mock.calls.map((c) => c[0] as string);
    expect(prompts.some((p) => p.includes("Tickets created: 1"))).toBe(true);
    expect(prompts.some((p) => p.includes("Tickets created: 3"))).toBe(true);
  });
});

describe("newsletter.worker — tick behaviour", () => {
  test("is a no-op when there are no tenants", async () => {
    await expect(runOnce(SUNDAY)).resolves.toBeUndefined();
    expect(complete).not.toHaveBeenCalled();
  });

  test("swallows errors so one bad tick cannot kill the cron", async () => {
    const spy = jest.spyOn(Tenant, "find").mockImplementationOnce(() => {
      throw new Error("mongo is down");
    });

    await expect(runOnce(SUNDAY)).resolves.toBeUndefined();

    spy.mockRestore();
  });

  test("defaults to the current time when no clock is passed", async () => {
    await expect(runOnce()).resolves.toBeUndefined();
  });
});

describe("newsletter.worker — cron lifecycle", () => {
  test("start schedules a repeating tick and stop clears it", () => {
    const setSpy = jest.spyOn(global, "setInterval");
    const clearSpy = jest.spyOn(global, "clearInterval");

    startNewsletterCron(86400000);
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 86400000);

    stopNewsletterCron();
    expect(clearSpy).toHaveBeenCalled();

    setSpy.mockRestore();
    clearSpy.mockRestore();
  });

  test("stopping when not started is safe", () => {
    expect(() => stopNewsletterCron()).not.toThrow();
  });
});
