# Cash Compass 1.3.0 preview

- Track accounts and credit cards, reconcile balances, and record transfers without double-counting spending.
- Explore monthly category reports and six-month trends with account filtering.
- Add savings deadlines and contribution history.
- Preview CSV imports, detect possible duplicates, and save exports using the Android file picker.
- Opt into daily bill reminders in You. Android notification permission is required, and delivery may be delayed by battery saving.
- Record, edit, delete, and search categorized transactions; cash and payday forecasts update with your entries.
- Set weekly, biweekly, monthly, or yearly bills and paychecks. Confirm each payment to log it and advance the schedule.
- Browse a monthly payment calendar and a 30-day forecast with recurring estimates.
- Plan fixed, flexible, and occasional category budgets with optional positive/negative rollover.
- Existing plans and backups migrate; all data remains offline. Goals and Coach are under You; goals are also accessible from Budget.

## Installing this preview

Back up your plan in You → Backup / restore before uninstalling the previous preview. Debug certificates can differ between builds; if Android refuses an update, uninstall the old preview, install this APK, and restore the backup.

## Boundaries

No bank sync or automatic subscription detection. CSV imports default to history already included in balances; choose Apply only for amounts not yet reflected. CSV is transaction history only; use JSON backup for a complete plan. Spreadsheet formula-like text is prefixed with an apostrophe in CSV exports. Transactions are manual; settle planned bills from Plan to avoid duplicate records. Budget categories track spending but do not reserve additional cash in the forecast. Changing budget settings recalculates rollover history from the start month. Deleting a settled transaction reverses its original cash/tax adjustment but does not rewind the recurring schedule.
