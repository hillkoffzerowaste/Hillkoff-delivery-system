# Vehicle report data quality

The vehicle report combines `vehicle_usage_events`, `fuel_bills`, `driver_daily_assessments`, and delivered `orders`.

- New completed orders store an exact vehicle snapshot only when one unique vehicle is verified for the driver and Bangkok service date.
- Historical orders with one unique driver/day vehicle are labelled `historical-single-vehicle`.
- Driver/day groups with multiple vehicles are labelled ambiguous and are not assigned to a vehicle.
- Orders with no matching usage event are labelled unallocated and are not assigned to a vehicle.
- Driver-level order totals remain available even when vehicle allocation is unavailable.
- Automatically closed mileage records remain visible through the `autoClosed` flag.

Run the read-only reconciliation:

```powershell
node --env-file=.env.local scripts/audit-vehicle-report.mjs
```

The script does not write to Firestore.
