---
description: Use when the user pastes bank lines and wants them matched or posted to Xero.
---

# Reconcile a statement

1. Call `review_statement` with the lines. Do not skip it and do not pass books of your own.
2. Read `source`. If it is `demo` or `unconfigured`, say so and do not call `apply_match`.
3. If `needsBankAccount` is true, ask which bank account to use. Call `review_statement` again with that `bankAccountId`.
4. Quote only candidates the tool returned. A missing `recommended` value means you ask the user to choose.
5. For a document match, call `apply_match` with `pay_invoice` or `pay_bill`, the `proposalId`, the `targetLabel`, the same line, and `confirm: true`. Do this only after the user says to post that match.
6. For a line with no document match, ask for an account code from `accounts` in the tool result. After the user names one, call `apply_match` with `spend_money` (negative amount) or `receive_money` (positive amount) and `confirm: true`.
7. After a post, report the Xero id and say the bank statement line itself was not ticked by this app.
