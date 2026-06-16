# Backend Handoff: Image Dimensions Support

This document outlines the backend changes required to fully support layout preservation for images in the TripCast web app without destructive cropping.

## Goal
To avoid "jumping" layouts and destructive `object-cover` cropping, the frontend now supports dynamic aspect ratios via a `LoadingImage` component. This component needs the original (or compressed) image dimensions to reserve the correct amount of space while the image is downloading.

## Required Backend Changes

### 1. Schema Updates (`checkpoints` table)
Add two optional number fields to the `checkpoints` table:
- `imageWidth`: `v.optional(v.number())`
- `imageHeight`: `v.optional(v.number())`

### 2. Mutation Updates
Update the following mutations to accept and persist these new fields:
- `checkpoints:addCheckpoint`: Accept `imageWidth` and `imageHeight`.
- `checkpoints:updateCheckpoint`: Accept `imageWidth` and `imageHeight`.

### 3. Journal Event Logic
Ensure that when a checkpoint is transformed into a `JournalEvent` (e.g., in `listJournalEvents` or during event emission):
- The `imageWidth` and `imageHeight` from the checkpoint are included in the `JournalEvent` object.

## Note to Developer
The frontend is already updated to send these dimensions during upload/save and to consume them when available in the journal feed. It uses a `4:3` fallback when these fields are missing.

**Please delete this file once the backend changes have been implemented.**
