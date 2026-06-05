# Handoff: Backend Implementation for Invite Status Check

The frontend of TripCast now performs an upfront check on invite links to avoid letting users fill out registration forms for expired or invalid invites.

## Required Backend Implementation

Please implement the `getInviteStatus` query in the `followers` namespace.

### Function Reference (for `src/convex/tripcastApi.ts`)

The following has already been added to the API definition:

```typescript
export type InviteStatus = {
  status: "valid" | "expired" | "already_used" | "invalid";
};

// ... inside tripcastApi.followers ...
getInviteStatus: (anyApi as any).followers.getInviteStatus as FunctionReference<
  "query",
  "public",
  { inviteToken: string },
  InviteStatus
>,
```

### Business Logic Requirements

The `getInviteStatus` query should:

1.  **Look up the invite token** in the database.
2.  **Verify if it exists**: If not found, return `{ status: "invalid" }`.
3.  **Check for usage**: If the invite was a "single-use" invite and has already been redeemed, return `{ status: "already_used" }`.
4.  **Check for expiration**: If the invite has an expiration date and that date has passed, return `{ status: "expired" }`.
5.  **Verify validity**: If it exists, hasn't been used (if single-use), and hasn't expired, return `{ status: "valid" }`.

### Context

This query is called by `InviteRedemptionScreen.tsx` when a user visits a link with an `?invite=TOKEN` parameter. The screen will only show the registration form if `status` is `"valid"`.
