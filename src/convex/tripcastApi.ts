import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";

export type CheckpointSource = "right_click" | "tap_add_mode" | "long_press";

export type Checkpoint = {
  _id: string;
  _creationTime: number;
  title: string;
  note?: string;
  lat: number;
  lon: number;
  source: CheckpointSource;
  clientId: string;
  createdAt: number;
  updatedAt: number;
};

export type AddCheckpointArgs = {
  title?: string;
  note?: string;
  lat: number;
  lon: number;
  source: CheckpointSource;
  clientId: string;
};

export const tripcastApi = {
  checkpoints: {
    listCheckpoints: (anyApi as any).checkpoints.listCheckpoints as FunctionReference<
      "query",
      "public",
      {},
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
