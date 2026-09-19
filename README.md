# Cash Compass for Android

An offline cash-flow planner for hourly and irregular income.

## Download and install

Open [Releases](https://github.com/Bobbywasabi31/cash-compass-android/releases) and download **Cash-Compass-1.2.0-preview.apk** from the newest successful preview. On your Android phone, tap the downloaded APK, allow your browser to install it when asked, and tap Install. Android 7.0 or newer is supported.

This is a debug-signed testing preview. Copy a backup from **You → Backup / restore** before uninstalling or changing preview builds. Preview builds currently use different debug signing certificates, so installing a later preview can require uninstalling the old one. Production signing and Play Store publishing are not configured.

## What works

- Record, search, edit, and delete categorized transactions with reversible cash adjustments.
- Repeat bills and paychecks weekly, biweekly, monthly, or yearly; browse the payment calendar.
- Budget by fixed, flexible, or occasional categories with optional rollover.
- Enter and edit cash, expected gross or take-home income, unpaid bills, reserves, and goals.
- See estimated available spending through payday and a separate 30-day cash forecast.
- Keep overdue bills visible; confirm received income and paid bills with balance reconciliation.
- Model fewer hours without altering current cash.
- Ask the offline, rules-based coach about the entered forecast.
- Copy and restore a local JSON backup. Sample data is optional.

The coach is not yet a connected AI model. Phone notifications are not implemented; in-app due/overdue notices work. Amounts are USD. No account or bank credentials are required. See [privacy](PRIVACY.md) and [release notes](RELEASE_NOTES.md).

## Calculation rules

Current cash includes the money reserved for goals, taxes, and the safety buffer. Estimated spending through payday subtracts those reserves and all unpaid bills dated on or before payday, including overdue bills. Without a next payday, no safe-to-spend figure is shown. Daily amounts round down to cents.

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
