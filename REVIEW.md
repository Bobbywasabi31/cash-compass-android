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

Passing automation does not establish testing on a physical phone or every Android version. The preview uses debug signing and rules-based coaching. Production signing, connected AI, background notifications, recurring entries, and broader device/accessibility testing remain future work.
