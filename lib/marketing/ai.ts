import "server-only";
import { ANTHROPIC_URL, anthropicHeaders } from "@/lib/ai/claude";
import { orgAiKey } from "@/lib/ai/key";

export const marketingModel = () => process.env.MARKETING_AI_MODEL?.trim() || "claude-sonnet-5";

/**
 * Ask Claude for structured data: the answer comes back through a forced tool call, so it's always a parsed object
 * matching the schema (no JSON-in-text to repair). https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview
 */
export async function askStructured<T>(orgId: string, system: string, input: unknown, schema: Record<string, unknown>, opts: { maxTokens?: number; timeoutMs?: number } = {}): Promise<T> {
  const key = await orgAiKey(orgId);
  if (!key) throw new Error("No Claude API key: set ANTHROPIC_API_KEY in Vercel or add one in Settings → Integrations → AI.");
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST", headers: anthropicHeaders(key), signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
    body: JSON.stringify({
      model: marketingModel(), max_tokens: opts.maxTokens ?? 4000, system,
      tools: [{ name: "submit", description: "Submit your answer.", input_schema: schema }],
      tool_choice: { type: "tool", name: "submit" },
      messages: [{ role: "user", content: typeof input === "string" ? input : JSON.stringify(input) }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[]; stop_reason?: string };
  const call = j.content?.find((c) => c.type === "tool_use" && c.name === "submit");
  if (!call?.input) throw new Error(j.stop_reason === "max_tokens" ? "Claude's answer was cut short — try again." : "Claude didn't return an answer.");
  return call.input as T;
}
