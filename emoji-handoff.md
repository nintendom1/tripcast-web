# Emoji Reactions Handoff

## Goal / Intention
Enable Travelers and Followers to react to Stories (Checkpoints) and Missions with a preset set of emojis. This adds a layer of social interaction and feedback without requiring full comments.

## Usecase
- A Follower sees a Story about a great meal and reacts with "❤️".
- A Traveler completes a difficult Mission and Followers react with "👍" or "😹".
- Both roles can see aggregate counts of reactions and their own specific reaction.

## Implementation Details (Backend Tasks)

### 1. Schema Changes
- Create a `reactions` table:
  ```typescript
  {
    targetId: string,   // checkpointId or missionId
    targetType: "checkpoint" | "mission",
    userId: string,     // The user who reacted
    emoji: string,      // The emoji character
    createdAt: number
  }
  ```
- Add indexes on `targetId` and `userId` for efficient lookup and aggregation.

### 2. Mutation: `toggleReaction`
- **Location**: `reactions:toggleReaction`
- **Arguments**: `token: string`, `targetId: string`, `targetType: "checkpoint" | "mission"`, `emoji: string`.
- **Logic**:
  - Verify the user session via `token`.
  - Check if the user already has a reaction on this `targetId`.
  - If they have a reaction with the **same** emoji: Remove it (toggle off).
  - If they have a reaction with a **different** emoji: Replace it (one emoji per user per target).
  - If they have **no** reaction: Add the new one.

### 3. Data Aggregation
- When returning `JournalEvent` or `Mission` objects, include a `reactions` field of type `ReactionSummary`:
  ```typescript
  {
    counts: { "❤️": 5, "👍": 2 }, // Map of emoji to count
    myReaction: "❤️"            // The emoji from the current user's reaction (if any)
  }
  ```
- This should be implemented in the respective query handlers (`listJournalEvents`, `getMission`, `travelerListMissions`, etc.).

## Frontend State
The frontend is already built to handle the `reactions` field and call the `toggleReaction` mutation. Components involved:
- `src/components/ui/ReactionSection.tsx`: Orchestrates the display and interaction.
- `src/components/ui/ReactionTray.tsx`: The UI for the emoji picker and badges.
- `src/convex/tripcastApi.ts`: Updated with the new types and mutation placeholder.

## Sounds
The frontend expects `music.sfx("bubble")` or similar to be available (already integrated).
