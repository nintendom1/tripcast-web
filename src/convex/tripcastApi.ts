import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";

export type Role = "traveler" | "support_crew";

export type CheckpointSource = "right_click" | "tap_add_mode" | "long_press";

export type Checkpoint = {
  _id: string;
  _creationTime: number;
  title: string;
  note?: string;
  lat: number;
  lon: number;
  source: CheckpointSource;
  createdAt: number;
  updatedAt: number;
};

export type AddCheckpointArgs = {
  token: string;
  title?: string;
  note?: string;
  lat: number;
  lon: number;
  source: CheckpointSource;
};

export const tripcastApi = {
  auth: {
    signIn: (anyApi as any).auth.signIn as FunctionReference<
      "mutation",
      "public",
      { role: Role; code: string; clientId: string },
      { token: string; role: Role }
    >,
    currentSession: (anyApi as any).auth.currentSession as FunctionReference<
      "query",
      "public",
      { token: string },
      { role: Role } | null
    >,
    signOut: (anyApi as any).auth.signOut as FunctionReference<
      "mutation",
      "public",
      { token: string },
      null
    >,
  },
  checkpoints: {
    listCheckpoints: (anyApi as any).checkpoints.listCheckpoints as FunctionReference<
      "query",
      "public",
      { token: string },
      Checkpoint[]
    >,
    addCheckpoint: (anyApi as any).checkpoints.addCheckpoint as FunctionReference<
      "mutation",
      "public",
      AddCheckpointArgs,
      string
    >,
  },
} as const;
