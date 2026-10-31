import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "A pasted receipt is matched to the sample invoice and is not posted.",
  async test(t) {
    await t.send("Match this bank line and do not post it: 2026-10-28, money in 1250.00, PAYMENT FROM ACME INV-1042.");
    t.succeeded();
    t.calledTool("review_statement", {
      output: (value) => {
        const text = JSON.stringify(value);
        return text.includes("INV-1042") && text.includes("demo");
      },
    });
    t.notCalledTool("apply_match");
  },
});
