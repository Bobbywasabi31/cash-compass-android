# Cash Compass for Android

An offline cash-flow planner for hourly and irregular income.

## Download and install

Open [Releases](https://github.com/Bobbywasabi31/cash-compass-android/releases) and download **Cash-Compass-1.5.0-preview.apk** from the newest successful preview. On your Android phone, tap the downloaded APK, allow your browser to install it when asked, and tap Install. Android 7.0 or newer is supported.

This is a debug-signed testing preview. Copy a backup from **You → Backup / restore** before uninstalling or changing preview builds. Preview builds currently use different debug signing certificates, so installing a later preview can require uninstalling the old one. Production signing and Play Store publishing are not configured.

## New in 1.5: Google Wallet purchase import

Open **You → Google Wallet purchase import**, choose the account and balance handling, and save. Then open Android notification access and enable **Cash Compass · Wallet purchases**. Access is off by default and must be granted by you. Android may show a restricted-settings prompt for sideloaded previews; see [Android's explanation](https://support.google.com/android/answer/12623953).

New Google Wallet notices are captured on-device while the app is closed and imported the next time it opens. Clear English USD purchases insert automatically; dollar signs mean USD. Review mode lets you approve every purchase instead. Choose review mode when using multiple cards. All automatic imports use the selected account and start in Other. Edit them normally afterward.

Repeated notifications are deduplicated; updates and possible manual/CSV duplicates go to review. Failed payments, refunds, pending charges, unsupported currencies, and ambiguous text never insert automatically. Dismiss an already recorded notice or review its details. This is notification parsing, not a bank or Wallet API, and formats vary by phone. Only future notifications are captured; there is no historical Wallet import.

The app does not have internet permission. Android grants broad notification access; the service discards other sources before retaining text. It accepts Google Wallet's package or Google Play services only with an explicit Google Wallet/Google Pay attribution. Pause stops capture; revoke access in Android to fully disconnect. See [privacy](PRIVACY.md) for retention and backup behavior.

## New in 1.4

A responsive workspace inspired by the supplied desktop references: customizable dashboard, grouped accounts and recorded net-worth history, transaction filters and bulk categories, cash-flow diagrams and period reports, income/expense budgets, recurring list/calendar, savings/debt tabs, manual investment holdings, and editable long-term scenarios. Phone layouts use a navigation drawer and bottom tabs; larger windows use a sidebar.

Holdings use entered prices and are separate from cash. History starts with saved observations; it is not backfilled. Forecast growth is a user assumption, not a market prediction. Screenshot balances and personal records are not bundled with the app.

## What works

- Track checking, savings, cash, and credit cards; reconcile balances and record transfers.
- View monthly category reports and six-month income/expense comparisons.
- Set savings deadlines and log contributions or withdrawals.
- Preview CSV imports with duplicate detection, and export transactions with Android’s file picker.
- Enable optional daily Android bill reminders from You.
- Record, search, edit, and delete categorized transactions with reversible cash adjustments.
- Repeat bills and paychecks weekly, biweekly, monthly, or yearly; browse the payment calendar.
- Budget by fixed, flexible, or occasional categories with optional rollover.
- Enter and edit cash, expected gross or take-home income, unpaid bills, reserves, and goals.
- See estimated available spending through payday and a separate 30-day cash forecast.
- Keep overdue bills visible; confirm received income and paid bills with balance reconciliation.
- Model fewer hours without altering current cash.
- Ask the offline, rules-based coach about the entered forecast.
- Copy and restore a local JSON backup. Sample data is optional.

The coach is not yet a connected AI model. Optional phone reminders run around 9 AM for bills due within three days or overdue; Android battery saving may delay them. Amounts are USD. No account or bank credentials are required. See [privacy](PRIVACY.md) and [release notes](RELEASE_NOTES.md).

## Calculation rules

The forecast starts with the sum of tracked account balances, including negative card debt. This is a net balance, not a guarantee that funds are liquid in a particular account. Transfers change account balances but never count as income or spending. Current cash includes the money reserved for goals, taxes, and the safety buffer. Estimated spending through payday subtracts those reserves and all unpaid bills dated on or before payday, including overdue bills. Without a next payday, no safe-to-spend figure is shown. Daily amounts round down to cents.

The 30-day timeline deducts bills before income on the same date. Late income is excluded until received or rescheduled. Gross income uses the user's tax percentage; take-home income is not taxed again. Goal extra reserves apply once per forecast and are capped at the remaining goal target. Goal progress and extra reserves are planning amounts; no transfers occur. Fewer-hours scenarios reduce the next expected payment (capped at that payment), not cash already available. Actual spending, payment delays, and missing bills must be reflected manually.

## Build and verify

The [Android workflow](.github/workflows/android.yml) uses JDK 17, Gradle 8.7, Android Gradle Plugin 8.6.1, SDK 35, and build tools 34.0.0. It runs forecast tests, Android lint, an Android 15 emulator smoke test, and signature verification before publishing an APK and SHA-256 checksum. Instrumentation test dependencies are used only in tests; the app has no external runtime libraries.

For local builds install those tools, set ANDROID_HOME, then run:

```sh
node --test tests/*.test.cjs
gradle :app:assembleDebug :app:lintDebug
# With an emulator or device connected:
gradle :app:connectedDebugAndroidTest
```

APK: `app/build/outputs/apk/debug/app-debug.apk`.
Open the project with an Android Studio version supporting AGP 8.6.1, or use the pinned Gradle installation above. A Gradle wrapper is not committed; CI supplies Gradle explicitly.

## Source

- `core.js`: pure date, cent-based cash, reservation, migration, and settlement logic.
- `app.js` / `app.css`: interface, validated local persistence, and coaching explanations.
- `MainActivity.java`: restricted local-asset WebView, Android back handling, and system insets.
- `tests/core.test.cjs` and `AppSmokeTest.java`: forecast regressions and installed-app smoke test.

See [REVIEW.md](REVIEW.md) for findings, fixes, and verification boundaries.
