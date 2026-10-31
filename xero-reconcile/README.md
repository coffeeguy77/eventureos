# Xero reconcile

Grok matches bank lines you paste to open Xero invoices and bills, then creates the payment or the spend/receive transaction after you confirm it.

Xero does not let an outside app read the bank feed or mark a statement line reconciled. This agent creates the account transaction. Xero's own bank reconciliation can then match that transaction to the feed.

## Connect Xero

1. Create a Xero app with scopes `offline_access`, `accounting.transactions`, and `accounting.settings.read`.
2. Complete the OAuth code flow and copy the refresh token and the tenant id.
3. Put the four values in `.env` (see `.env.example`). A new refresh token is saved in the agent store after the first successful refresh. Keep that store.

`XERO_RECONCILE_MODE=demo` uses `fixtures/books.json` and never posts.

## Run

```bash
cd xero-reconcile
npx @grok/agent-sdk dev
```

The playground is on the printed local URL. Paste a line as `YYYY-MM-DD`, a signed amount (positive means money in), and the bank description.
