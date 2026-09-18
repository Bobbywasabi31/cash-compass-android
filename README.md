# Cash Compass for Android

Cash Compass is an offline-first cash-flow coach for people with hourly or irregular income. Users enter upcoming income, bills, and goals; the app turns those into a clear safe-to-spend estimate, a bill timeline, and lightweight coaching prompts.

## What is included

- A native Android wrapper (`app/`) that launches the local app interface in a `WebView`
- A complete, responsive interface in `app/src/main/assets/index.html`
- Local-only persistence with `localStorage`—there are no account connections, bank credentials, analytics SDKs, or network requests
- Editable income, bills, goals, hourly-rate scenario planning, notifications preferences, and a planning-only coach

## Open in Android Studio

1. Open this folder in Android Studio Hedgehog or newer.
2. Let Gradle install Android SDK Platform 35 if prompted.
3. Run the `app` configuration on an emulator or an Android device running Android 7.0 or later.

The supplied project uses Android Gradle Plugin 8.6.1 and JDK 17. It intentionally has no external runtime dependencies.

## Product boundaries

Cash Compass is not a bank-linking or investment-advice product. Its forecasts are estimates derived from user-provided data, and the in-app coach explicitly avoids investment recommendations. Before any production launch, add an appropriate privacy policy, terms, secure backup/sync architecture, accessibility review, and professional legal/compliance review.
