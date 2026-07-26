# Operations eight-phase UAT checklist

## Sales and admin

- [ ] Dispatch date selector uses the order creation date in Asia/Bangkok.
- [ ] Eight dispatch cards show the selected date and active backlog.
- [ ] Each dispatch row shows its creation date.
- [ ] The right panel shows current daily orders grouped by driver.
- [ ] Vehicle report daily/monthly/fuel totals match source records.
- [ ] Driver, vehicle, plate, and responsible-person records can be added and edited.
- [ ] Disable actions preserve historical rows.
- [ ] Selected-row and filtered-all CSV exports open correctly in Excel.
- [ ] Chiang Mai orders require one Tuesday, Wednesday, or Friday round.
- [ ] Store/pack completion remains unchanged.
- [ ] One ready round can be queued once; a blocked round returns blocking order IDs.

## Accounting

- [ ] An allowlisted `@hillkoff.com` Google account completes OTP login.
- [ ] Only the vehicle report navigation is visible.
- [ ] Report filters, master data, and CSV controls work.
- [ ] Direct Firestore reads and non-report APIs are denied.

## Driver

- [ ] Existing username/password login remains unchanged.
- [ ] Vehicle selection loads the live master and falls back to the static master.
- [ ] Mileage start, segment, and end submissions work.
- [ ] Daily/weekly inspection and fuel submissions work.
- [ ] Delivery completion stores an exact vehicle snapshot or unresolved status.
- [ ] No Chiang Mai round control is visible.

## Store and pack

- [ ] Existing queues, checks, return/rework, photos, and archive actions work.
- [ ] No round selector or new required step appears.

## Release

- [ ] Backup completed before vehicle-master seed.
- [ ] `ACCOUNTING_EMAIL_ALLOWLIST` configured in deployment environment.
- [ ] Vehicle-master dry run reports 21 records and zero writes.
- [ ] Unit tests, Firestore rules tests, lint, and production build pass.
- [ ] Post-release error rates, Firestore reads, CSV downloads, and round conflicts are monitored.
