/**
 * AI Provider abstraction layer.
 * Supports Claude (Anthropic) and OpenAI with a unified interface.
 * Provider selection via AI_PROVIDER env var.
 */

export interface AiCompletionOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
}

export interface AiProvider {
  name: string;
  complete(prompt: string, options?: AiCompletionOptions): Promise<string>;
}

export interface AiResult<T = any> {
  data: T;
  model: string;
  provider: string;
  latencyMs: number;
  tokensUsed?: number;
}

let _provider: AiProvider | null = null;

/**
 * Get the configured AI provider. Returns null if no API key is set.
 */
export function getAiProvider(): AiProvider | null {
  if (_provider) return _provider;

  const providerName = process.env.AI_PROVIDER || "claude";
  const apiKey = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (providerName === "openai") {
    _provider = createOpenAiProvider(apiKey);
  } else {
    _provider = createClaudeProvider(apiKey);
  }

  return _provider;
}

/**
 * Reset provider (for testing).
 */
export function resetAiProvider(): void {
  _provider = null;
}

// ─── Claude Provider ─────────────────────────────

function createClaudeProvider(apiKey: string): AiProvider {
  return {
    name: "claude",
    async complete(prompt: string, options?: AiCompletionOptions): Promise<string> {
      const model = process.env.AI_MODEL || "claude-sonnet-4-5-20250514";
      const body: any = {
        model,
        max_tokens: options?.maxTokens || 1024,
        messages: [{ role: "user", content: prompt }],
      };

      if (options?.systemPrompt) {
        body.system = options.systemPrompt;
      }
      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claude API error (${res.status}): ${err}`);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      return text;
    },
  };
}

// ─── OpenAI Provider ─────────────────────────────

function createOpenAiProvider(apiKey: string): AiProvider {
  return {
    name: "openai",
    async complete(prompt: string, options?: AiCompletionOptions): Promise<string> {
      const model = process.env.AI_MODEL || "gpt-4o-mini";
      const messages: any[] = [];

      if (options?.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      const body: any = {
        model,
        messages,
        max_tokens: options?.maxTokens || 1024,
      };

      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      }
      if (options?.jsonMode) {
        body.response_format = { type: "json_object" };
      }

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${err}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    },
  };
}
