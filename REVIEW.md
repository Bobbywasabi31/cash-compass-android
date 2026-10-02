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


## Version 1.5 Wallet import

The listener is protected by Android's BIND_NOTIFICATION_LISTENER_SERVICE permission, disabled in-app until opt-in, and source-filtered before content retention. A bounded private queue survives process restarts. Queue acknowledgments occur only after durable local plan writes and match notification revisions, preserving concurrent updates. Receipt IDs survive transaction edits, deletion, and backup normalization. Ambiguous currencies, failed/pending/refund text, unknown merchants, missing accounts, stale notices, and possible duplicates go to review. No network permission added.

Validation: 52 core tests, existing UI regressions, and a Wallet UI test cover parsing, idempotency, revision review, balances, storage-failure retry, and pause. Android instrumentation covers source filtering, queue persistence, duplicate delivery, and concurrent revision acknowledgment; CI compile/lint/device checks gate publication. Synthetic fixtures match the supplied merchant-title and amount-with-card screenshots, including numeric merchant prefixes, slashes, and wrapped card labels. Actual Android listener delivery on the physical phone still needs a new purchase check.

## Version 1.6 Sankey cash flow (roadmap item 21)

The existing report diagram now shares a cent-based Sankey model with the Cash Flow screen. Small and overflow groups are combined into Other with their members retained. Positive net income is Saved; overspending adds a funding-gap source. A common scale preserves band proportions without inflating tiny amounts. Empty and transfer-only periods show an empty state. The graph and exact-value tables respect the existing date, account, and category/merchant filters and never modify the plan.

Local verification: all 62 calculation tests pass, including ten Sankey regressions covering cents, grouping thresholds/caps, named Other, income-only/expense-only/break-even periods, deficits, empty/transfer-only periods, inclusive dates, account/merchant filters, reserved-name categories, large totals, and input immutability. Browser checks passed at desktop, 393px, and 320px widths for date/account filters, expandable grouping details, escaped labels, balanced SVG geometry, and contained horizontal scrolling. A dedicated Android WebView test checks the installed chart, funding-gap-to-savings account filtering, expandable Other details, custom report dates, and empty states. Android compile, lint, emulator tests, and APK signature verification remain release gates. No new permissions, network access, runtime libraries, or persisted schema changes are introduced.
