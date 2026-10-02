# Privacy

Cash Compass 1.5.1 preview stores the plan you enter in this app's local WebView storage. It has no bank linking, online account, analytics, advertising, AI API, or server connection. The Android app does not request internet permission. Its HTTPS asset origin is handled inside the app using bundled files; it is not an external website.

Backup text may contain personal financial details. It stays in the app until you copy it and choose where to save or share it. Clearing app storage or uninstalling removes your plan. Android backup is disabled. Your device's own security and clipboard settings apply to local data.

## CSV and reminders
CSV import/export uses Android’s system file picker. Only files you select are read or written. Your chosen storage provider controls exported files. Optional reminders store bill dates locally, request Android notification permission, and display generic text without amounts or merchant names. No bank connection, analytics, or server upload is added.

## Optional Wallet notification access

Disabled by default. Android notification access is broad, but Cash Compass checks source before saving content: Google Wallet (com.google.android.apps.walletnfcrel), or Google Play services (com.google.android.gms) only when its notification subtext explicitly names Google Wallet or Google Pay. Other sources are discarded. The service never sends, dismisses, or changes notifications. No notification text is logged or uploaded.

A private native queue retains up to 200 notices (title/body limited to 2,000 characters each); it prunes notices older than 30 days on subsequent captures. Overflow is reported rather than silently overwriting retained purchases. After successful local import or review-inbox storage, native text is removed; up to 2,000 hashed receipts remain for replay protection. The plan retains up to 200 review notices until handled and up to 10,000 import receipt identifiers. Capacity warnings stop further acknowledgment. Imported transactions remain until you delete them.

JSON backups include Wallet settings, review text, transaction links, and receipt identifiers, but not the Android permission or unprocessed native queue. Opening the app normally imports queued notices. Use Check captured purchases on the Wallet screen before making a backup; storage errors or a full inbox can leave notices in the native queue. Restoring, clearing, or replacing a plan pauses capture and clears the native queue. Android permission itself is revoked only in Android settings. Uninstalling removes all local data.
