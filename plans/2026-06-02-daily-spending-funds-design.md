# Daily Spending Funds Design

## Summary

Add a daily Travel Funds mode alongside the existing whole-trip budget. Daily mode uses the existing budget amount field as a per-day USD allowance, requires a start date, excludes counted transactions before that date, and optionally carries forward overspending only.

## UX Flow

- Travel Funds settings offer `Trip` and `Daily` modes.
- Daily mode shows a required start date and a `Carry overspending forward` checkbox.
- The sheet summary keeps the existing meter, but daily mode labels the budget as today's allowance and shows prior overspend debt when it reduces today's remaining funds.
- Existing transaction lists remain unchanged; pre-start transactions can still be viewed but do not affect daily calculations.
- Add/Edit transaction forms expose a `Happened at` local date/time field. Editing this timestamp changes funds calculations but does not change linked Story, Mission, or Activity timestamps.

## Backend Behavior

- `travelFundsConfig` stores `budgetMode`, `carryoverMode`, and `fundsStartAt`.
- Existing configs default to trip mode and no carryover.
- Daily calculations use browser-local day boundaries passed by the frontend as epoch timestamps.
- Overspend carryover rolls negative variance forward. Unused daily budget can pay down previous overspending but cannot create extra positive allowance.
- Transaction timestamp edits reuse the existing `occurredAt` add/update argument and backend validation.

## Validation

- Trip mode remains unchanged.
- Daily mode requires a finite `fundsStartAt`.
- Budget remains a non-negative USD amount capped at the existing maximum.
- Public API changes require regenerating and copying `tripcastApi.ts` into the web repo.
