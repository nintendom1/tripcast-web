import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { tripcastApi } from "../../convex/tripcastApi";
import type { MysteryMissionExportRow } from "../../convex/tripcastApi";
import { useMusicSafe } from "../../providers/MusicProvider";

type BooleanChoice = "" | "true" | "false";

type Props = {
  open: boolean;
  token: string;
  mysteryMissionId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

type FormState = {
  lat: string;
  lon: string;
  region: string;
  locationName: string;
  mysteryText: string;
  trueIntent: string;
  spawnRadiusMiles: string;
  priority: string;
  tags: string;
  recommendedTimeOfDay: string;
  estimatedVisitMinutes: string;
  difficulty: string;
  sourceHint: string;
  expiresAt: string;
  spoilerSummary: string;
  locationType: string;
  indoorOutdoor: string;
  transitFriendly: BooleanChoice;
  requiresTicket: BooleanChoice;
  timeSensitive: BooleanChoice;
};

const EMPTY_FORM: FormState = {
  lat: "",
  lon: "",
  region: "",
  locationName: "",
  mysteryText: "",
  trueIntent: "",
  spawnRadiusMiles: "30",
  priority: "0",
  tags: "",
  recommendedTimeOfDay: "",
  estimatedVisitMinutes: "",
  difficulty: "",
  sourceHint: "",
  expiresAt: "",
  spoilerSummary: "",
  locationType: "",
  indoorOutdoor: "",
  transitFriendly: "",
  requiresTicket: "",
  timeSensitive: "",
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function booleanChoice(value: boolean | undefined): BooleanChoice {
  if (value === true) return "true";
  if (value === false) return "false";
  return "";
}

function nullableString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function nullableBoolean(value: BooleanChoice) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function formFromMission(row: MysteryMissionExportRow): FormState {
  return {
    lat: String(row.lat),
    lon: String(row.lon),
    region: row.region ?? "",
    locationName: row.locationName ?? "",
    mysteryText: row.mysteryText,
    trueIntent: row.trueIntent,
    spawnRadiusMiles: String(row.spawnRadiusMiles),
    priority: String(row.priority),
    tags: row.tags?.join(", ") ?? "",
    recommendedTimeOfDay: row.recommendedTimeOfDay ?? "",
    estimatedVisitMinutes: row.estimatedVisitMinutes ? String(row.estimatedVisitMinutes) : "",
    difficulty: row.difficulty ?? "",
    sourceHint: row.sourceHint ?? "",
    expiresAt: row.expiresAt ? String(row.expiresAt) : "",
    spoilerSummary: row.spoilerSummary ?? "",
    locationType: row.locationType ?? "",
    indoorOutdoor: row.indoorOutdoor ?? "",
    transitFriendly: booleanChoice(row.transitFriendly),
    requiresTicket: booleanChoice(row.requiresTicket),
    timeSensitive: booleanChoice(row.timeSensitive),
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-[var(--ink-3)]">
      {label}
      {children}
    </label>
  );
}

function BooleanSelect({
  value,
  onChange,
}: {
  value: BooleanChoice;
  onChange: (value: BooleanChoice) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as BooleanChoice)}
      className="h-9 rounded-md border border-[var(--line-soft)] bg-[var(--bg-card)] px-2 text-sm text-[var(--ink-1)] outline-none focus:border-[var(--ink-1)] focus:ring-1 focus:ring-[var(--ink-1)]"
    >
      <option value="">Unset</option>
      <option value="true">Yes</option>
      <option value="false">No</option>
    </select>
  );
}

export default function MysteryMissionEditSheet({
  open,
  token,
  mysteryMissionId,
  onOpenChange,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const music = useMusicSafe();
  const mission = useQuery(
    tripcastApi.mysteryMissions.travelerGetMysteryMissionForEdit,
    open && mysteryMissionId ? { token, mysteryMissionId } : "skip",
  ) as MysteryMissionExportRow | null | undefined;
  const patchMission = useMutation(tripcastApi.mysteryMissions.travelerPatchMysteryMission);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setError(null);
      setWorking(false);
      return;
    }
    if (mission) setForm(formFromMission(mission));
  }, [open, mission]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!mission || working) return;
    setWorking(true);
    setError(null);
    try {
      await patchMission({
        token,
        mysteryMissionId: mission._id,
        lat: Number(form.lat),
        lon: Number(form.lon),
        region: form.region,
        locationName: form.locationName,
        mysteryText: form.mysteryText,
        trueIntent: form.trueIntent,
        spawnRadiusMiles: Number(form.spawnRadiusMiles),
        priority: Number(form.priority),
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        recommendedTimeOfDay: nullableString(form.recommendedTimeOfDay),
        estimatedVisitMinutes: nullableNumber(form.estimatedVisitMinutes),
        difficulty: nullableString(form.difficulty),
        sourceHint: nullableString(form.sourceHint),
        expiresAt: nullableNumber(form.expiresAt),
        spoilerSummary: nullableString(form.spoilerSummary),
        locationType: nullableString(form.locationType),
        indoorOutdoor: nullableString(form.indoorOutdoor),
        transitFriendly: nullableBoolean(form.transitFriendly),
        requiresTicket: nullableBoolean(form.requiresTicket),
        timeSensitive: nullableBoolean(form.timeSensitive),
      });
      music.sfx("success");
      onSaved?.();
      onOpenChange(false);
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start justify-between gap-2 px-5 pt-2">
          <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold tracking-tight text-[var(--ink-1)]">
            Edit Mystery Mission
          </SheetTitle>
          <SheetCloseButton aria-label="Close Mystery Mission editor" />
        </div>
        <SheetBody className="grid gap-4 px-5 py-4 text-[var(--ink-1)]">
          {mission === undefined ? (
            <p className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--ink-3)]">
              Loading...
            </p>
          ) : mission === null ? (
            <p className="rounded-xl border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--ink-danger)]">
              Mystery Mission not found.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Latitude">
                  <Input value={form.lat} type="number" onChange={(event) => update("lat", event.target.value)} />
                </Field>
                <Field label="Longitude">
                  <Input value={form.lon} type="number" onChange={(event) => update("lon", event.target.value)} />
                </Field>
                <Field label="Region">
                  <Input value={form.region} onChange={(event) => update("region", event.target.value)} />
                </Field>
                <Field label="Location name">
                  <Input value={form.locationName} onChange={(event) => update("locationName", event.target.value)} />
                </Field>
                <Field label="Spawn radius miles">
                  <Input value={form.spawnRadiusMiles} type="number" onChange={(event) => update("spawnRadiusMiles", event.target.value)} />
                </Field>
                <Field label="Priority">
                  <Input value={form.priority} type="number" onChange={(event) => update("priority", event.target.value)} />
                </Field>
                <Field label="Estimated visit minutes">
                  <Input value={form.estimatedVisitMinutes} type="number" onChange={(event) => update("estimatedVisitMinutes", event.target.value)} />
                </Field>
                <Field label="Expires at">
                  <Input value={form.expiresAt} type="number" onChange={(event) => update("expiresAt", event.target.value)} />
                </Field>
              </div>

              <Field label="Mystery text">
                <Input value={form.mysteryText} maxLength={120} onChange={(event) => update("mysteryText", event.target.value)} />
              </Field>
              <Field label="True intent">
                <Textarea value={form.trueIntent} rows={4} maxLength={1000} onChange={(event) => update("trueIntent", event.target.value)} />
              </Field>
              <Field label="Spoiler summary">
                <Textarea value={form.spoilerSummary} rows={3} onChange={(event) => update("spoilerSummary", event.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Tags">
                  <Input value={form.tags} onChange={(event) => update("tags", event.target.value)} />
                </Field>
                <Field label="Difficulty">
                  <Input value={form.difficulty} onChange={(event) => update("difficulty", event.target.value)} />
                </Field>
                <Field label="Recommended time">
                  <Input value={form.recommendedTimeOfDay} onChange={(event) => update("recommendedTimeOfDay", event.target.value)} />
                </Field>
                <Field label="Source hint">
                  <Input value={form.sourceHint} onChange={(event) => update("sourceHint", event.target.value)} />
                </Field>
                <Field label="Location type">
                  <Input value={form.locationType} onChange={(event) => update("locationType", event.target.value)} />
                </Field>
                <Field label="Indoor/outdoor">
                  <Input value={form.indoorOutdoor} onChange={(event) => update("indoorOutdoor", event.target.value)} />
                </Field>
                <Field label="Transit friendly">
                  <BooleanSelect value={form.transitFriendly} onChange={(value) => update("transitFriendly", value)} />
                </Field>
                <Field label="Requires ticket">
                  <BooleanSelect value={form.requiresTicket} onChange={(value) => update("requiresTicket", value)} />
                </Field>
                <Field label="Time sensitive">
                  <BooleanSelect value={form.timeSensitive} onChange={(value) => update("timeSensitive", value)} />
                </Field>
              </div>

              {error ? <p role="alert" className="text-sm text-[var(--ink-danger)]">{error}</p> : null}
              <Button type="button" disabled={working} onClick={save}>
                {working ? "Saving..." : "Save Mystery Mission"}
              </Button>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
