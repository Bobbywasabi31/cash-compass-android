# Review of the original prototype

The original source contained no APK or build workflow. The public HTML differed from the local draft; both were reviewed before replacing them with the same maintained source.

| Finding | Correction |
| --- | --- |
| Unpaid bills disappeared after their date | Keep all unpaid overdue bills reserved; add explicit payment confirmation |
| No payday still produced a spending estimate | Require an entered payday before displaying it |
| Fewer-hours model subtracted future losses from current cash | Apply the reduction to the next expected income in the 30-day timeline |
| Coach treated every hours request as 12 hours | Parse the requested count and share the forecast engine |
| Goal savings were not protected and monthly reserve meaning was ambiguous | Protect saved amounts inside cash; label the extra amount as a one-time forecast reserve |
| Income tax treatment was ambiguous | Distinguish gross and take-home pay and track received gross-tax reserves |
| Date filtering used UTC dates and hid negative cash | Use local calendar dates, cent arithmetic, and visible shortfalls |
| Payments could be added but not edited or reconciled | Add edit/remove/paid/received controls and already-in-balance option |
| Reminder switch did nothing | Replace it with an honest in-app reminder description |
| Default sample balances could be mistaken for user data | Start blank; require an explicit sample-plan action |
| Unvalidated storage, no backup, destructive reset without confirmation | Validate/migrate data, report save errors, add backup/restore and confirmations |
| Broad WebView file access and unhandled back/insets | Restrict resources to four bundled files on an intercepted HTTPS origin; handle back and insets |
| No reproducible verification or installable output | Pin the build toolchain in CI, add regression/lint/emulator tests, verify signing, publish preview APK and checksum |

## Verification

Forecast regression tests cover overdue/payday bills, late/missing income, deficits, reserves, gross/net treatment, arbitrary reduced hours, same-day ordering, 30-day bounds, settlement, cents, DST/calendar behavior, schema migration, and invalid inputs. The workflow additionally compiles and lints Android code and installs the APK on an Android 15 emulator to check rendering, navigation, saving, dialog back handling, and storage rehydration.

Passing automation does not establish testing on a physical phone or every Android version. The preview uses debug signing and rules-based coaching. Production signing, connected AI, bank sync, and broader device/accessibility testing remain future work.

## 1.3 feature verification

Local checks cover transfers and reversal, card debt, account reconciliation, CSV quoting and duplicate detection, transfer-safe reports, savings history, legacy migration, and existing forecast rules (28 tests). Browser form checks exercise account creation, transfers, reports, contributions, CSV preview/import, budgets, recurring settlement, and edits/deletions. Android CI compiles, lints, and runs the installed WebView smoke test, bridge availability, reminder due-date counting, and persistence.

Daily alarms are inexact; delivery timing and file-provider interactions still require physical-device testing. Preview signing remains per-build: keep a full JSON backup before uninstalling. The previous release remains available for rollback; retain that backup before restoring an older build because the older schema does not preserve new account/history fields.

## Version 1.4 workspace

The screenshot-guided redesign adds dashboard preferences, account history, filtered cash-flow reports, manual holdings, and explicit long-term scenarios. Local verification: 38 calculation tests and both UI regression scripts pass. Android compile, lint, instrumentation, and APK signature checks run in the release workflow before publication. Investment values never increase spendable cash; transfers remain excluded from spending. No personal screenshot data is bundled. Historical values are recorded only from saved observations.

