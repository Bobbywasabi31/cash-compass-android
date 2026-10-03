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
