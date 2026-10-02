# Cash Compass 1.5.0 preview

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
