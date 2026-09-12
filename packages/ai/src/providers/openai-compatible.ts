import type { AIProvider, CompletionRequest, CompletionResult } from "./types.js";

export interface OpenAICompatibleOptions {
  endpoint: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;

  constructor(private readonly opts: OpenAICompatibleOptions) {
    this.name = "openai-compatible:" + opts.model;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const url = this.opts.endpoint.replace(/\/$/, "") + "/chat/completions";
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.apiKey) headers["authorization"] = "Bearer " + this.opts.apiKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 60000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: this.opts.model,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 2048,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error("provider HTTP " + res.status + ": " + body.slice(0, 200));
      }
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string };
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("provider returned empty response");
      return { text, model: data.model ?? this.opts.model, provider: this.name };
    } finally {
      clearTimeout(timer);
    }
  }
}
