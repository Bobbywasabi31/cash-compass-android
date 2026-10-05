# Workspace design

The supplied Monarch screenshots guide information hierarchy, not branding or personal data. OddDough retains its own identity.

## Shared presentation

Off-white canvas, white cards with 12px corners, orange primary actions, green income, red expenses, and cyan net-worth charts. A 204px sidebar appears on larger screens; below 760px, a drawer and bottom tabs expose the same sections. Tables and charts scroll within their cards. Labels and chart-data tables provide non-color alternatives. Native form labels, focus outlines, and dialog roles support keyboard navigation.

## Data boundaries

All charts use entered records or explicit scenario assumptions. Investment prices and cost are manual; no live quote or benchmark is implied. Balances are recorded on save, with at most one observation per day. Transfers do not count as income or expenses. The report funding gap represents expenses above recorded income, not inferred borrowing. Life-event scenarios never change cash or transactions. No bank, credit score, receipt, or retail integration is represented as connected.

## Sankey cash flow

Cash Flow and Reports share one read-only Sankey renderer and the filtered `cashFlow` report. Both sides sum to `max(recorded income, recorded expenses)` in integer cents. Saved is positive income less expenses; a funding-gap source balances overspending without inferring borrowing. No zero or negative nodes are drawn, and empty/transfer-only periods show an explanatory empty state.

Group values below 3% of their own side total, plus overflow beyond five named income/six named expense groups, into one Other bucket per side. Preserve every member and its exact amount, including an existing Other category. Band widths use one common scale with no artificial minimum cash value. Keep label spacing separate from band thickness. Labels sit outside ribbons; long labels retain their full text in SVG titles and exact-value tables. Tables stack on phones, with expandable Other details and horizontal scrolling contained inside the chart card.
