# Cash Compass 1.1.0 preview

Download **Cash-Compass-1.1.0-preview.apk** from Assets below on your Android phone. Tap the download, allow installation from your browser if Android asks, then tap Install. Requires Android 7.0 or later. No account or bank connection is needed.

This is an installable **debug-signed testing preview**, not a Play Store production release. Its package is `com.cashcompass.app.preview`. Each CI build currently uses a new debug certificate; to move between preview builds, copy a backup from You first, uninstall the older preview, then install and restore. A persistent private production signing key is still needed for seamless production updates.

The release workflow compiles the APK, checks Android lint, tests forecasting, installs and opens it on an Android 15 emulator, tests navigation and saved data, and verifies the APK signature before uploading it here. SHA256SUMS.txt lets you check download integrity.

## Corrections in this review

- Overdue bills stay reserved until marked paid. Late income is excluded until received or rescheduled.
- No spending promise without a payday; shortfalls remain visible instead of being hidden by zero.
- Bills on payday are processed before expected income, and the 30-day timeline is actually bounded to 30 days.
- Cash, tax, buffer, and goal reserves use integer-cent arithmetic. Take-home pay is not taxed twice.
- Fewer-hours scenarios affect upcoming income rather than cash already held, and arbitrary hour counts work in the coach.
- Income, bills, and goals can be edited or removed; payment confirmation distinguishes a changed balance from an already reconciled balance.
- Sample data is opt-in. Local saves are validated; failed saves are reported. Backup / restore is available in You.
- The WebView serves only bundled assets from an internal HTTPS origin; file/content access and external navigation are blocked. No internet permission is requested.
- Android back navigation, rotation, system-bar/keyboard insets, and launcher icon are handled.

## Preview boundaries

The coach is rules-based and offline, not a connected AI model. Reminders appear inside the app; background notifications are not implemented. Entries are single payments, not recurring schedules. Amounts are USD. The app provides budgeting estimates from your inputs, not investment or tax recommendations. Data is local only; clearing data or uninstalling removes it, so copy a backup before doing either.
