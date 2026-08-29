/**
 * @module tests/ai-provider
 * Tests for the AI provider abstraction (Claude / OpenAI request shaping,
 * response unwrapping and error surfacing).
 *
 * `fetch` is stubbed, so no request leaves the test process and no API key
 * is ever required.
 */
import { getAiProvider, resetAiProvider } from "../../services/ai/ai-provider";

const realFetch = global.fetch;
const savedEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_API_KEY: process.env.AI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  AI_MODEL: process.env.AI_MODEL,
};

let fetchMock: jest.Mock;

/** Build a minimal Response-alike for the stubbed fetch. */
function jsonResponse(body: any, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any;
}

function clearKeys() {
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_MODEL;
}

beforeEach(() => {
  clearKeys();
  resetAiProvider();
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
});

afterEach(() => {
  (global as any).fetch = realFetch;
  resetAiProvider();
});

afterAll(() => {
  clearKeys();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v !== undefined) process.env[k] = v;
  }
});

/** Body of the most recent stubbed fetch call, parsed. */
function lastBody(): any {
  return JSON.parse(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].body);
}

function lastInit(): any {
  return fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1];
}

function lastUrl(): string {
  return fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0];
}

describe("getAiProvider — selection", () => {
  test("returns null when no API key is configured", () => {
    expect(getAiProvider()).toBeNull();
  });

  test("defaults to Claude when a key is present", () => {
    process.env.AI_API_KEY = "k";
    expect(getAiProvider()!.name).toBe("claude");
  });

  test("selects OpenAI when AI_PROVIDER says so", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "k";
    expect(getAiProvider()!.name).toBe("openai");
  });

  test("falls back to Claude for an unrecognised provider name", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "k";
    expect(getAiProvider()!.name).toBe("claude");
  });

  test.each(["AI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"])(
    "accepts the key from %s",
    (envVar) => {
      process.env[envVar] = "k";
      expect(getAiProvider()).not.toBeNull();
    }
  );

  test("memoises the provider instance", () => {
    process.env.AI_API_KEY = "k";
    expect(getAiProvider()).toBe(getAiProvider());
  });

  test("resetAiProvider clears the memoised instance", () => {
    process.env.AI_API_KEY = "k";
    const first = getAiProvider();
    resetAiProvider();
    expect(getAiProvider()).not.toBe(first);
  });
});

describe("Claude provider", () => {
  beforeEach(() => {
    process.env.AI_API_KEY = "claude-key";
    resetAiProvider();
  });

  test("posts to the messages endpoint with auth and version headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: [{ text: "hi" }] }));

    await getAiProvider()!.complete("say hi");

    expect(lastUrl()).toBe("https://api.anthropic.com/v1/messages");
    const init = lastInit();
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("claude-key");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  test("sends the prompt as a single user message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: [{ text: "hi" }] }));

    await getAiProvider()!.complete("say hi");

    expect(lastBody().messages).toEqual([{ role: "user", content: "say hi" }]);
  });

  test("uses the default model and token budget", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: [{ text: "hi" }] }));

    await getAiProvider()!.complete("p");

    const body = lastBody();
    expect(body.model).toBe("claude-sonnet-4-5-20250514");
    expect(body.max_tokens).toBe(1024);
  });

  test("honours AI_MODEL", async () => {
    process.env.AI_MODEL = "claude-opus-4-1";
    resetAiProvider();
    fetchMock.mockResolvedValue(jsonResponse({ content: [{ text: "hi" }] }));

    await getAiProvider()!.complete("p");

    expect(lastBody().model).toBe("claude-opus-4-1");
  });

  test("passes through maxTokens, temperature and systemPrompt", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: [{ text: "hi" }] }));

    await getAiProvider()!.complete("p", {
      maxTokens: 64,
      temperature: 0.2,
      systemPrompt: "be terse",
    });

    const body = lastBody();
    expect(body.max_tokens).toBe(64);
    expect(body.temperature).toBe(0.2);
    expect(body.system).toBe("be terse");
  });

  test("omits system and temperature when not supplied", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: [{ text: "hi" }] }));

    await getAiProvider()!.complete("p");

    const body = lastBody();
    expect(body.system).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  test("sends temperature 0 rather than dropping it", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: [{ text: "hi" }] }));

    await getAiProvider()!.complete("p", { temperature: 0 });

    expect(lastBody().temperature).toBe(0);
  });

  test("unwraps the first content block", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ content: [{ text: "the answer" }, { text: "ignored" }] })
    );

    expect(await getAiProvider()!.complete("p")).toBe("the answer");
  });

  test("returns an empty string when the response has no content", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    expect(await getAiProvider()!.complete("p")).toBe("");
  });

  test("throws with the status and body on an API error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    } as any);

    await expect(getAiProvider()!.complete("p")).rejects.toThrow(
      "Claude API error (429): rate limited"
    );
  });
});

describe("OpenAI provider", () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "openai-key";
    resetAiProvider();
  });

  test("posts to the chat completions endpoint with a bearer token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "hi" } }] })
    );

    await getAiProvider()!.complete("say hi");

    expect(lastUrl()).toBe("https://api.openai.com/v1/chat/completions");
    expect(lastInit().headers.Authorization).toBe("Bearer openai-key");
  });

  test("uses the default model and token budget", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "hi" } }] })
    );

    await getAiProvider()!.complete("p");

    const body = lastBody();
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.max_tokens).toBe(1024);
  });

  test("honours AI_MODEL", async () => {
    process.env.AI_MODEL = "gpt-4o";
    resetAiProvider();
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "hi" } }] })
    );

    await getAiProvider()!.complete("p");

    expect(lastBody().model).toBe("gpt-4o");
  });

  test("prepends the system prompt as a system message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "hi" } }] })
    );

    await getAiProvider()!.complete("p", { systemPrompt: "be terse" });

    expect(lastBody().messages).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "p" },
    ]);
  });

  test("sends only the user message when there is no system prompt", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "hi" } }] })
    );

    await getAiProvider()!.complete("p");

    expect(lastBody().messages).toEqual([{ role: "user", content: "p" }]);
  });

  test("requests a JSON response format in json mode", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] })
    );

    await getAiProvider()!.complete("p", { jsonMode: true });

    expect(lastBody().response_format).toEqual({ type: "json_object" });
  });

  test("omits response_format when json mode is off", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "x" } }] })
    );

    await getAiProvider()!.complete("p", { jsonMode: false });

    expect(lastBody().response_format).toBeUndefined();
  });

  test("passes through maxTokens and temperature", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "x" } }] })
    );

    await getAiProvider()!.complete("p", { maxTokens: 32, temperature: 0.9 });

    const body = lastBody();
    expect(body.max_tokens).toBe(32);
    expect(body.temperature).toBe(0.9);
  });

  test("unwraps the first choice's message content", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "the answer" } }] })
    );

    expect(await getAiProvider()!.complete("p")).toBe("the answer");
  });

  test("returns an empty string when there are no choices", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [] }));

    expect(await getAiProvider()!.complete("p")).toBe("");
  });

  test("throws with the status and body on an API error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "bad key",
    } as any);

    await expect(getAiProvider()!.complete("p")).rejects.toThrow(
      "OpenAI API error (401): bad key"
    );
  });
});
