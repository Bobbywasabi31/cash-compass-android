# 1.54.0

- Weekly money recap (#24): opt-in Sunday notification with last week's spending vs income, safe-to-spend, and bills due in the next 7 days. Enable it under You → Reminders.
- Launcher shortcuts (#86): long-press the app icon for one-tap "Add expense" and "Add income".

# 1.53.0

- Receipt scan is smarter about the store name: it now uses text size and position to tell the actual merchant apart from payment artifacts like "VERIFIED BY PIN" or "REG FUEL". If the name can't be read confidently, the field is left empty instead of guessed wrong.

# 1.52.0

- Receipt auto-scan: attaching a receipt photo now reads it on-device (ML Kit OCR) and fills in merchant, total, and date automatically. Nothing leaves your phone.
- Receipt photos are auto-rotated upright (EXIF orientation fix) and downscaled so they stay small.

# 1.51.0

- Receipt photos now work on Android: the photo picker opens correctly (camera or gallery) when attaching a receipt to a transaction.
- Fixed the "+ Add transaction" button layout on narrow screens — it no longer collapses with vertically stacked text.

# 1.50.0

- Encrypted backups (#8): protect your backup with a passphrase (AES-256). Download and restore from Backup / restore.
- Physical-device test checklist (#93): step-by-step manual test plan for real Android devices.

# 1.49.0

- Tablet/landscape/foldable polish (#87): better layouts on tablets, landscape phones, and foldables (dual-screen support).
- Performance at scale (#90): faster transaction search, verified smooth with 10,000+ transactions.

# 1.48.0

- Receipt photo attachments (#35): snap a photo of your receipt (camera on Android) or attach from gallery. Stored locally with the transaction, tap the 🧾 icon to view.
- Quick-add (#10): new ⚡ Quick add button on Home — type amount, tap category, done. Two taps for cash purchases.

# Cash Compass 1.47.0 preview

- **Accessibility (roadmap #81):** Touch targets, focus, contrast, font scaling.

# Cash Compass 1.46.0 preview

- **Animations (roadmap #91):** Subtle transitions; reduced-motion support.
- **Migration fixtures (roadmap #94):** Old-schema tests.

# Cash Compass 1.45.0 preview

- **OFX/QFX/QIF import (roadmap #39):** Bank statement import.
- **Price refresh (roadmap #56):** Manual holding price updates.

# Cash Compass 1.44.0 preview

- **Seasonal planner (roadmap #17):** Define seasons with year calendar.
- **In-app help (roadmap #88):** Tooltips and empty states.

# Cash Compass 1.43.0 preview

- **LICENSE (roadmap #96):** MIT license.
- **Error log viewer (roadmap #98):** View/export local errors.

# Cash Compass 1.42.0 preview

- **Onboarding wizard (roadmap #83):** 4-step setup for new users.
- **Privacy mode (roadmap #84):** Blur balances until tapped.

# Cash Compass 1.41.0 preview

- **Themes (roadmap #82):** System, Light, Dark, High contrast in Profile.
- **Allocation chart (roadmap #55):** Verified in Investments → Allocation.

# Cash Compass 1.40.0 preview

- **Credit card tracker (roadmap #46):** Statement dates, due dates, minimums, APR.
- **Card payment planner (roadmap #47):** Suggests payment strategy.

# Cash Compass 1.39.0 preview

- **Custom categories (roadmap #41):** Create categories with groups and colors.
- **Paycheck auto-detection (roadmap #43):** Suggests recurring income schedules.

# Cash Compass 1.38.0 preview

- **Net worth annotations (roadmap #69):** Mark major events on the net worth chart.
- **Full data export (roadmap #92):** Export everything as JSON.

# Cash Compass 1.37.0 preview

- **Report export (roadmap #70):** Reports → Export CSV and Print/PDF.
- **Share summary (roadmap #72):** Android share sheet for the summary.

# Cash Compass 1.36.0 preview

- **Connected AI coach (roadmap #78):** Optional BYO API key in Profile; summarized data only.
- **Smart categorization (roadmap #79):** Category suggestions with confidence when adding transactions.

# Cash Compass 1.35.0 preview

- **Voice entry (roadmap #75):** Microphone button in Transactions; speak then confirm.
- **Broader offline coach (roadmap #76):** answers savings rate, net worth, budget, debt, trends.
- **Fix:** Quick entry UI (#74) now appears.

# Cash Compass 1.34.0 preview

- **Explain-this-number (roadmap #73):** Tap "Available before payday" on Home for calculation steps.
- **Natural-language quick entry (roadmap #74):** Transactions quick box parses "12.50 chipotle".

# Cash Compass 1.33.0 preview

- **Anomaly detection (roadmap #67):** Insights flags unusually large charges and likely duplicates.
- **Budget vs actual progress bars (roadmap #71):** Home budget card with per-category progress.

# Cash Compass 1.32.0 preview

- **Spending calendar heatmap (roadmap #64):** Reports → Calendar with daily spend intensity shading.
- **Projected daily balance calendar (roadmap #65):** forecast balance per day with low-balance flags.

# Cash Compass 1.31.0 preview

- **Year-in-review (roadmap #61):** Reports → Year in review with annual totals, savings rate, top categories, and net worth change.
- **Seasonal view (roadmap #62):** Reports → Seasonal view with best and leanest months side by side.

# Cash Compass 1.30.0 preview

- **Contribution log (roadmap #57):** Investments → Contributions tracks investment contributions with monthly breakdown.
- **Manual assets and liabilities (roadmap #58):** Investments → Other assets & liabilities, included in net worth.

# Cash Compass 1.29.0 preview

- **Dividend tracker (roadmap #53):** Investments → Dividends logs payments with payment calendar and projected monthly income.
- **DRIP/compound growth projection (roadmap #54):** Investments → Growth projection with editable yield, growth, years, and monthly contribution.

# Cash Compass 1.28.0 preview

- **Loan amortization tracker (roadmap #51):** Plan → Loan amortization shows payoff schedule, total interest, and extra-payment effect (interest and months saved).
- **Holdings cost basis and gain/loss (roadmap #52):** Investments → Lots tracks purchase lots per holding with weighted average cost basis.

# Cash Compass 1.27.0 preview

- **Savings goal auto-allocation (roadmap #49):** each goal shows the per-paycheck contribution needed to hit its deadline and whether you're on track.
- **Net worth milestones (roadmap #50):** Goals → Net worth milestones tracks targets with progress bars and projected dates based on your recent savings rate.

# Cash Compass 1.26.0 preview

- **Debt payoff planner (roadmap #45):** Plan → Debt payoff planner compares snowball vs avalanche strategies with payoff time, payoff date, and total interest. Add debts with balance, APR, and minimum payment.
- **Sinking funds (roadmap #48):** Plan → Sinking funds spreads annual/irregular expenses into monthly set-asides with target, due date, saved amount, monthly needed, and progress bars.

# Cash Compass 1.25.0 preview

- **Undo for bulk edits and deletes (roadmap #42):** bulk category changes and the new bulk delete offer a 60-second undo. An Undo button appears in Transactions after the operation.
- **Move money between budget categories (roadmap #44):** Budgets → Move reallocates planned amounts mid-month. A Budget moves history table shows every reallocation.

# Cash Compass 1.24.0 preview

- **CSV + notification merge/reconcile (roadmap #4):** when importing CSV, rows are matched against the notification inbox by amount, then date within ±3 days, then fuzzy merchant. Matched rows merge (CSV wins on amount/name; your existing category preserved). Unmatched rows go to the inbox as "missed by notifications" for review. The preview shows match/miss counts.

# Cash Compass 1.23.0 preview

- **Proactive insights feed (roadmap #77):** the Home dashboard now shows insight cards derived from your data — spending spikes, budget pressure at 80%/100%, bills due this week, runway warnings, and savings-rate trends.
- **Auto-drafted monthly review (roadmap #80):** Reports → Monthly review drafts a "what changed this month" summary — which categories rose or fell, savings-rate comparison, and scheduled bills.

# Cash Compass 1.22.0 preview

- **Spending trends (roadmap #59):** Reports → Spending trends shows per-category totals for each of the last 12 months, with your top 8 categories and monthly totals.
- **Month-over-month insights (roadmap #60):** Reports → Month over month explains where spending rose or fell versus last month, ranked by dollar change with percentages.

# Cash Compass 1.21.0 preview

- **Top merchants (roadmap #63):** Reports → Top merchants ranks spending by merchant over the last 3, 6, or 12 months, with share bars and transaction counts. Merchant names are normalized so variants group together.
- **Savings rate (roadmap #68):** Reports → Savings rate shows percent of income saved per month over the last 12 months, with the overall rate and trend direction (rising/steady/falling).

# Cash Compass 1.20.0 preview

- **Overtime and holiday pay:** the paycheck estimator now accepts overtime hours (paid at 1.5×) and holiday hours (paid at 2×), showing a regular/overtime/holiday breakdown plus gross, estimated tax, and take-home. The take-home can be added as planned income.
- **Gig income variability:** Plan → Gig income variability shows your worst and best recorded months, average, and a 0–100 consistency score (100 = perfectly steady income).

# Cash Compass 1.19.0 preview

- **Multiple income streams (roadmap #19):** income entries now track optional hours and hourly rate per stream. Plan → Income streams groups expected income by source over the next 12 months — paydays, next payday, expected total, and per-stream plus combined monthly equivalents.
- **Per-bill reminder settings (roadmap #27):** each bill has its own phone-reminder toggle and days-ahead setting (0–60, default 3) in the bill editor. The Android daily reminder check honors each bill's window; bills with reminders off are excluded. Existing bills keep the previous 3-day behavior.

# Cash Compass 1.18.0 preview

- **Pay-period budgets (roadmap #14):** Budget → Weekly / Bi-weekly tabs. Monthly budgets are split into 52/26 periods (weeks start Monday; bi-weekly anchored to Mon 2020-01-06). Unspent amounts roll forward into the current period for categories with rollover enabled.
- **Budget alerts (roadmap #20):** a Budget alerts card warns at 80% of a category's available budget and flags overspending at 100%+, with linked refunds netted like the budget summary.

# Cash Compass 1.17.0 preview

- **Income smoothing (roadmap #15):** Plan → Income smoothing. Pick a steady target paycheck and see, from your recorded income months, how much to reserve in high months and draw in lean months — with a month-by-month table, totals, and running smoothing balance.
- **Hours and paycheck estimator (roadmap #16):** Plan → Paycheck estimator. Enter expected hours to estimate gross, tax, and take-home from your hourly rate and deduction rate (from You → settings), then add the take-home directly into Plan as expected income.

# Cash Compass 1.16.0 preview

- **Automatic backups (roadmap #6):** your plan is now backed up automatically — before every restore, reset, or sample-data load, plus once daily. The last 5 are kept in You → Automatic backups with one-tap restore; each shows when and why it was taken.
- **Data-loss guards (roadmap #9):** destructive confirmations now state exactly what happens and that an automatic backup is saved first. Restoring an automatic backup backs up the current plan before replacing it, so a restore can itself be undone.

# Cash Compass 1.15.0 preview

- **Auto-detect transfers on import (roadmap #32):** the CSV preview now spots expense/income row pairs for the same amount across different accounts within 3 days and offers to import each pair as a single transfer instead of two transactions. Pairs are ticked by default and can be unticked individually; duplicate-skipping still applies.
- **Tax set-aside tracker (roadmap #23):** tick “Untaxed income” on freelance/gig payments. Reports → Tax set-aside shows this year's untaxed income, the target at your set-aside rate (editable, default 25%), what's already reserved via tax reserves, and the remaining gap — plus the next quarterly estimated-tax deadline. An optional reminder in You → settings surfaces a home-tab notice as the deadline approaches.

# Cash Compass 1.14.0 preview

- **Emergency fund tracker (roadmap #25):** a new section beside the low-season runway shows how many months of essential spending your spendable cash covers — with a progress bar toward your target (default 3 months) and the amount still needed. It uses the same cash pool as the runway and shares its essential-spending figure, so the two stay in sync.
- **Reimbursable tracking (roadmap #37):** tick “Reimbursable” on any expense you expect to be paid back. Activity → “Reimbursements” shows the reimbursable total, what's been paid back, and what's still owed, with per-expense logging that supports partial paybacks. Logging is pure tracking; record the actual deposit as income separately.

# Cash Compass 1.13.1 preview

- **Critical fix:** restored the `syncReminders()` function accidentally dropped in the 1.11.0 edit. Without it, every save threw an error after writing data — dialogs stayed open and follow-on actions (such as enabling wallet capture) never ran. All saves now complete cleanly, and the Android smoke test passes again.

# Cash Compass 1.13.0 preview

- **Rules engine (roadmap #30):** Activity → “Rules” — build “if the merchant name contains X, set category or add tag Y” automations. Rules run top to bottom on new transactions: the first match sets the category when none is set, every match adds its tag. Each rule shows a live match count, with “Apply to existing” to recategorize past transactions in one tap.
- **Refund linking (roadmap #36):** income transactions can link to the original purchase (“Refund for purchase,” defaulting to the purchase's category). Linked refunds net against the original's category in budgets, spending reports, and the Activity summary — a $100 purchase with a $40 refund shows as $60 of spending instead of $100 spent plus $40 income. Refund links survive backup/restore.

# Cash Compass 1.12.0 preview

- **Split transactions (roadmap #28):** any transaction can now be divided across categories. Open it and choose “Split across categories” — add up to 10 parts, each with its own category, that must total the original amount to the cent. The original is replaced; cash adjustments carry over per part, and tags/notes stay on the first part.
- **Duplicate cleanup (roadmap #33):** Activity → “Find duplicates” lists transactions matching on date, merchant, amount, type, and accounts, and merges true double-records into one — combining tags and keeping the longest note. The tool warns that two legitimate same-day purchases can look identical, so only merge real double-records.

# Cash Compass 1.11.0 preview

- **Tags and notes (roadmap #29):** every transaction can now carry up to 10 free-form tags plus a note. Tags appear as chips on each Activity row, are included in search, and can be filtered — handy for tracking things like #reimbursable, #tax-deductible, or #vacation across categories.
- **Advanced search and saved filters (roadmap #34):** Activity now filters by tag and by amount range (min/max) alongside the existing search, type, account, category, and date filters. Any combination can be saved as a named one-tap view, then applied or deleted from the Saved views row.

# Cash Compass 1.10.0 preview

- **Low-season runway (roadmap #13):** the Plan tab now answers "how long does my cash last if work slows down?" Drag the income slider to model a lower monthly income, adjust monthly essential spending (prefilled from your recent average), and see your runway in months and weeks — counting only spendable cash after goal, tax, and buffer reserves.
- **Forecast range (roadmap #66):** best/expected/worst 30-day ending cash based on your real income variability. Compares the plan against what happens if the next 30 days earn like your worst or best recorded month.

# Cash Compass 1.9.0 preview

- **Variable bill estimates (roadmap #26):** bills such as utilities can now learn from your recorded history. Tick "Estimate from my recent history" on any bill and the 30-day forecast reserves the average of your last 3 payments for that merchant instead of the entered amount, marked with ~ everywhere it appears. Falls back to the entered amount when there is no history.
- **Merchant name cleanup (roadmap #31):** payment-processor noise like "SQ *", "TST*", "SP *", and trailing store numbers is stripped automatically, so the same merchant always maps to one entry — improving merchant memory, subscription detection, and bill estimates.

# Cash Compass 1.8.0 preview

- **Late-paycheck scenario (roadmap #18):** the Plan tab's "What if pay changes?" section now answers "what if payday slips N days?" — the forecast models the delayed paycheck, shows which bills land before it, how deep the cash trough gets, and your new per-day safe amount through the slipped payday.
- **Subscription detector (roadmap #22):** Reports now scans your last 12 months of recorded expenses for charges repeating weekly, biweekly, monthly, or yearly, flags any whose price went up, and lets you add one as a bill with a single tap so the forecast reserves for it.

# Cash Compass 1.7.0 preview

- **Cash-crunch warnings (roadmap #11):** the 30-day forecast now flags dates where your projected cash drops below your everyday safety buffer, so you get warned before a shortfall instead of after. Shows on Today and in Plan whenever a buffer is set in You.
- **Merchant memory (roadmap #3):** Cash Compass now remembers the category and account you used for each merchant. Start typing a merchant name when recording a transaction and the form pre-fills both — edit either field and it respects your choice from then on. Manage it in You → Your data (see the remembered count, clear it any time). Learned automatically from saved transactions; transfers are skipped. Stored only on this device, included in backups.

# Cash Compass 1.6.1 preview

- Expanded sample plan populates every main screen with fictional accounts, twelve months of ledger and net-worth history, budgets, recurring income/bills, goals, investments, and forecast scenarios.
- Sample Wallet review notices demonstrate purchases and pending refunds while capture stays paused. Sample reminders start off.
- Load from You → Load sample plan. Dates refresh when loaded, and existing plans are replaced only after confirmation.
- Corrected the version displayed in You and the sidebar.

### Sankey retained

- Sankey cash-flow diagram in both Cash Flow and Reports, using the selected period, account, and category/merchant grouping.
- Proportional bands for income, spending, and Saved; explicit funding gaps for overspending and clear empty states.
- Small and overflow groups combine into Other, with expandable exact-value tables showing all included amounts.
- Phone-friendly stacked tables, scrollable SVG, and text descriptions. Transfers remain excluded; no plan or balance changes.

### Wallet import retained

- Recognize merchant-title purchase notices with numeric merchant prefixes, slashes, and wrapped bank/card names.
- Opt-in Google Wallet notification capture, processed entirely on-device.
- Automatic insertion of clear English USD purchases into a chosen account when Cash Compass opens.
- Review inbox for unclear details, refunds, failed/pending payments, changed alerts, and possible duplicates.
- Repeated notifications do not create duplicate transactions; reviewed changes update the linked transaction with reversible balance adjustments.
- Choose balance adjustment or history-only import; pause capture or revoke access in Android settings.
- Enable from You → Google Wallet purchase import. Android notification access must be granted separately.
- Notification formats vary; unknown formats need review. No bank connection, historical Wallet access, live currency conversion, or actual payment actions.

### Workspace features retained

- New customizable dashboard, light card layout, desktop sidebar, and phone navigation.
- Grouped accounts, assets/liabilities summary, and recorded net-worth history.
- Date/account/category transaction filters, sorting, and bulk category edits.
- Monthly, quarterly, and annual cash-flow summaries; date-range reports with a flow diagram.
- Income and expense budget tables; recurring list/calendar and savings/debt views.
- Manual investment holdings with allocation and gain versus entered cost.
- Long-term scenarios with editable assumptions and one-time or recurring life events.
- Existing backups migrate without inventing historical balances.

- Track accounts and credit cards, reconcile balances, and record transfers without double-counting spending.
- Explore monthly category reports and six-month trends with account filtering.
- Add savings deadlines and contribution history.
- Preview CSV imports, detect possible duplicates, and save exports using the Android file picker.
- Opt into daily bill reminders in You. Android notification permission is required, and delivery may be delayed by battery saving.
- Record, edit, delete, and search categorized transactions; cash and payday forecasts update with your entries.
- Set weekly, biweekly, monthly, or yearly bills and paychecks. Confirm each payment to log it and advance the schedule.
- Browse a monthly payment calendar and a 30-day forecast with recurring estimates.
- Plan fixed, flexible, and occasional category budgets with optional positive/negative rollover.
- Existing plans and backups migrate; all data remains offline. Every main section is available from the sidebar or phone menu.

## Installing this preview

Back up your plan in You → Backup / restore before uninstalling the previous preview. Debug certificates can differ between builds; if Android refuses an update, uninstall the old preview, install this APK, and restore the backup.

## Boundaries

No bank sync or automatic subscription detection. CSV imports default to history already included in balances; choose Apply only for amounts not yet reflected. CSV is transaction history only; use JSON backup for a complete plan. Spreadsheet formula-like text is prefixed with an apostrophe in CSV exports. Transactions can be entered manually or imported from Wallet notices; check existing records before settling planned bills from Recurring to avoid duplicates. Budget categories track spending but do not reserve additional cash in the forecast. Changing budget settings recalculates rollover history from the start month. Deleting a settled transaction reverses its original cash/tax adjustment but does not rewind the recurring schedule.
