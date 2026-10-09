# Privacy

OddDough 1.6.2 preview stores the plan you enter encrypted on this device (see At-rest encryption below). It has no bank linking, online account, analytics, advertising, AI API, or server connection. The Android app does not request internet permission. Its HTTPS asset origin is handled inside the app using bundled files; it is not an external website.

Backup text may contain personal financial details. It stays in the app until you copy it and choose where to save or share it. Clearing app storage or uninstalling removes your plan. Android backup is disabled. Your device's own security and clipboard settings apply to local data.

## At-rest encryption

Your plan and the automatic backups are stored in an encrypted vault on the device: AES-256-GCM via Jetpack Security, with the key held by the Android Keystore (hardware-backed where the device supports it). No passphrase is needed — the operating system guards the key, so reading the app's data files directly (for example from a lost or stolen phone) yields only ciphertext. The first launch after this update migrates your existing plan into the vault and wipes the old plaintext copy; a timestamped wrapper picks the newest copy if both ever exist, so a failed migration can never silently restore stale data. Passphrase-encrypted manual backups (AES-256-GCM, PBKDF2 key derivation) remain available for copies you take off-device.

Also covered since 1.64.0: the home-screen widget payload and the connected-coach API key moved into EncryptedSharedPreferences, and the pre-update backup files are each their own EncryptedFile vault (the Keystore key survives app updates, so a pending backup still restores after the update; backups are deleted once verified or restored, and superseded ones are pruned). The first launch migrates the old plaintext copies into the encrypted stores and wipes the originals; backups written by older versions still restore, and their plaintext file is wiped after a successful read.

Still not covered: reminder/weekly/updater preferences and the Wallet notification review queue (small amounts and settings in private SharedPreferences), and theme/error-log entries in WebView storage. Those never leave the phone either — they are simply not encrypted at rest yet.

## CSV, PDF statements, and reminders
CSV import/export uses Android’s system file picker. Only files you select are read or written. Your chosen storage provider controls exported files. PDF bank-statement import reads the file you pick entirely on-device with a bundled PDF parser — the PDF and its contents never leave your phone, and no network request is made. Statement parsing is heuristic, so every detected transaction is shown in the import preview for your review before anything is saved. Optional reminders store bill dates locally, request Android notification permission, and display generic text without amounts or merchant names. The optional weekly recap stores its precomputed summary text on-device (it includes spending and safe-to-spend amounts) and posts it as a private notification on Sundays. No bank connection, analytics, or server upload is added.

## Optional Wallet and bank notification access

Disabled by default. Android notification access is broad, but OddDough checks source before saving content: Google Wallet (com.google.android.apps.walletnfcrel), or Google Play services (com.google.android.gms) only when its notification subtext explicitly names Google Wallet or Google Pay. Other sources are discarded. The service never sends, dismisses, or changes notifications. No notification text is logged or uploaded.

**Bank alerts (opt-in, review only).** Separately from Wallet capture, you can turn on bank transaction alerts. Content is saved only from an allowlisted set of bank-app packages: Chase (com.chase.sig.android), Bank of America (com.infonow.bofa), Wells Fargo (com.wf.wellsfargomobile), Citi (com.citi.citimobile), Capital One (com.konylabs.capitalone), U.S. Bank (com.usbank.mobilebanking), Discover (com.discoverfinancial.mobile), PNC (com.pnc.ecommerce.mobile), Navy Federal (com.navyfederal.android), and American Express (com.americanexpress.android.acctsvcs.us). Enabling Wallet capture does not enable bank alerts. Because bank notification formats vary and the right account is ambiguous, bank alerts never insert automatically — every one waits in the review inbox for your confirmation.

A private native queue retains up to 200 notices (title/body limited to 2,000 characters each); it prunes notices older than 30 days on subsequent captures. Overflow is reported rather than silently overwriting retained purchases. After successful local import or review-inbox storage, native text is removed; up to 2,000 hashed receipts remain for replay protection. The plan retains up to 200 review notices until handled and up to 10,000 import receipt identifiers. Capacity warnings stop further acknowledgment. Imported transactions remain until you delete them.

JSON backups include Wallet settings, review text, transaction links, and receipt identifiers, but not the Android permission or unprocessed native queue. Opening the app normally imports queued notices. Use Check captured purchases on the Wallet screen before making a backup; storage errors or a full inbox can leave notices in the native queue. Restoring, clearing, or replacing a plan pauses capture and clears the native queue. Android permission itself is revoked only in Android settings. Uninstalling removes all local data.

## Home-screen widgets

Optional, and only active once you add a widget to your home screen. Each save in the app refreshes a compact local payload (safe-to-spend, days until payday, the next payday date, and the next 3 bills due with labels, amounts, and due dates) stored in the app's private SharedPreferences; nothing is sent anywhere. A daily alarm re-renders the widgets so day counts stay correct. Note that widget contents are visible on your home screen (and potentially the lock screen, depending on your launcher) without unlocking OddDough — remove the widgets if you don't want those amounts visible there.

## Optional app lock

Disabled by default. When enabled (You → App lock), opening OddDough asks for your fingerprint/face or your phone's PIN, pattern, or password, and the app's preview is hidden in the recent-apps screen. Authentication is handled entirely by Android's system prompt: OddDough never sees, stores, or transmits biometric data or your device credential. Only the on/off preference is stored on-device. If the phone has no screen lock set, app lock cannot be enabled — and if the screen lock is later removed, app lock disarms itself rather than locking you out.

## Currency & locale preferences

The base currency, number/date locale, manual exchange rates, and each account's currency (You → Currency & locale) are stored only on this device as part of your plan. Exchange rates are typed in by you — OddDough never contacts a network service for rates, and currency preferences are never uploaded or shared.
