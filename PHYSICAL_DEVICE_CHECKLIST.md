# Cash Compass — Physical Device Test Checklist

Manual verification for real Android devices. Run through before any production release.

## Setup
- [ ] Install release APK on a physical device (not emulator)
- [ ] Fresh install (clear data / uninstall first)
- [ ] Android version: ___  Device: ___

## First launch
- [ ] App opens without crash, onboarding offers guided setup
- [ ] "Start guided setup" walks through profile, accounts, payday
- [ ] Skip setup leaves a usable blank state with helpful empty states

## Core flows
- [ ] Add expense with photo receipt (camera) — photo attaches and shows 🧾
- [ ] Quick-add: amount + category in two taps
- [ ] Voice entry works (if supported on device)
- [ ] Edit and delete a transaction; cash balance updates correctly
- [ ] Transfer between accounts nets to zero

## Reminders & notifications
- [ ] Bill reminder fires at the scheduled time
- [ ] Tapping the notification opens the app to the right screen
- [ ] Weekly summary notification arrives Sunday (if enabled)

## Backup & restore
- [ ] Plain backup: copy JSON, restore on fresh install — data matches
- [ ] Encrypted backup: set passphrase, download, restore with passphrase
- [ ] Wrong passphrase shows a clear error (not a crash)
- [ ] Automatic backup rotates and restores from You → Automatic backups

## Wallet / notification capture
- [ ] Grant notification access; make a Google Wallet purchase
- [ ] Purchase appears in Wallet inbox within a minute
- [ ] Review and categorize it; transaction is created
- [ ] Pause capture stops new items; resume restarts

## Performance
- [ ] Import or generate 1,000+ transactions; lists stay smooth
- [ ] Search filters respond without lag
- [ ] Reports render in under 2 seconds

## Device-specific
- [ ] Rotate to landscape: layout adapts, no clipped buttons
- [ ] Foldable (if available): unfold/fold keeps state, dual-screen sensible
- [ ] Dark mode (system): app follows or stays readable
- [ ] Small screen (≤360dp): no overlapping text
- [ ] TalkBack: key flows (add transaction, view budget) are navigable

## Upgrade
- [ ] Install new APK over old version: data survives, no reinstall needed
- [ ] After upgrade, version in You tab matches release notes

## Sign-off
Tester: ___  Date: ___  Build: ___
Notes:
