import { useRef, useState, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetCloseButton, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOnlineStatus } from "../../components/resilience/useOnlineStatus";
import { tripcastApi, type TripCard, type TripDetailsPatch } from "../../convex/tripcastApi";
import { useTripMutation } from "../../convex/useTrip";
import { useTripContext } from "../../providers/TripContextProvider";
import { tripErrorInfo } from "./tripSwitchState";

// Shared by the create and edit sheets. They live here, not in CreateTripSheet, because that sheet is a lazy chunk
// (it lists trips) and this file must not pull its subscription into the header.
export const TRIP_TITLE_MAX = 80;

export type TripDetailsValues = { title: string; destinations: string; start: string; end: string };
export type TripDetailsErrors = { title?: string; dates?: string };

/** `YYYY-MM-DD` (a date input value) to local midnight in ms; `undefined` when blank or invalid. */
export function dateInputToMs(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const ms = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

/** Local `YYYY-MM-DD` for a date input; blank when unset. */
export function msToDateInput(ms: number | undefined): string {
  if (ms === undefined) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function validateTripDetails(values: TripDetailsValues): TripDetailsErrors | null {
  const errors: TripDetailsErrors = {};
  const title = values.title.trim();
  if (!title) errors.title = "Title is required.";
  else if (title.length > TRIP_TITLE_MAX) errors.title = `Title must be ${TRIP_TITLE_MAX} characters or fewer.`;
  const start = dateInputToMs(values.start);
  const end = dateInputToMs(values.end);
  if (start !== undefined && end !== undefined && end < start) {
    errors.dates = "The planned end cannot be before the planned start.";
  }
  return errors.title || errors.dates ? errors : null;
}

type TripDetailsFieldsProps = {
  idPrefix: string;
  values: TripDetailsValues;
  errors: TripDetailsErrors | null;
  onChange: (patch: Partial<TripDetailsValues>) => void;
  titleRef?: RefObject<HTMLInputElement | null>;
  children?: ReactNode;
};

/** Title, destinations and planned dates, shared by the create and edit sheets. */
export function TripDetailsFields({ idPrefix, values, errors, onChange, titleRef, children }: TripDetailsFieldsProps) {
  const label = "text-xs font-semibold text-[var(--ink-2)]";
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <label htmlFor={`${idPrefix}-title`} className={label}>
          Title
        </label>
        <Input
          id={`${idPrefix}-title`}
          ref={titleRef}
          value={values.title}
          required
          aria-invalid={errors?.title ? true : undefined}
          aria-describedby={errors?.title ? `${idPrefix}-title-error` : undefined}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        {errors?.title ? (
          <p id={`${idPrefix}-title-error`} role="alert" className="text-xs text-[var(--ink-danger)]">
            {errors.title}
          </p>
        ) : null}
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${idPrefix}-destinations`} className={label}>
          Destinations
        </label>
        <Input
          id={`${idPrefix}-destinations`}
          value={values.destinations}
          onChange={(e) => onChange({ destinations: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <label htmlFor={`${idPrefix}-start`} className={label}>
            Planned start
          </label>
          <Input
            id={`${idPrefix}-start`}
            type="date"
            value={values.start}
            onChange={(e) => onChange({ start: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${idPrefix}-end`} className={label}>
            Planned end
          </label>
          <Input
            id={`${idPrefix}-end`}
            type="date"
            value={values.end}
            aria-invalid={errors?.dates ? true : undefined}
            onChange={(e) => onChange({ end: e.target.value })}
          />
        </div>
      </div>
      {errors?.dates ? (
        <p role="alert" className="text-xs text-[var(--ink-danger)]">
          {errors.dates}
        </p>
      ) : null}
      {children}
    </div>
  );
}

const valuesOf = (card: TripCard): TripDetailsValues => ({
  title: card.title,
  destinations: card.destinationSummary ?? "",
  start: msToDateInput(card.plannedStartAt),
  end: msToDateInput(card.plannedEndAt),
});

export type EditTripSheetProps = {
  /** The card being edited. Pass the live card: Reload takes its latest values and revision. */
  card: TripCard;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Sheet that edits a card's title, destinations and planned dates. It sends the revision the card had when the
 * sheet opened (or when last reloaded) and always names the card's own `tripId`, never the viewed trip. A revision
 * conflict offers "Reload", which reloads the card's values. Mount it only while open.
 */
export function EditTripSheet({ card, onClose, returnFocusRef }: EditTripSheetProps) {
  const { token } = useTripContext();
  const updateTrip = useTripMutation(tripcastApi.trips.updateTrip);
  const online = useOnlineStatus();
  const titleRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState(() => valuesOf(card));
  // What the form started from (or was last reloaded to): only fields that differ from it are sent.
  const [baseline, setBaseline] = useState(() => valuesOf(card));
  const [revision, setRevision] = useState(card.revision);
  const [errors, setErrors] = useState<TripDetailsErrors | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = () => {
    setValues(valuesOf(card));
    setBaseline(valuesOf(card));
    setRevision(card.revision);
    setConflict(false);
    setServerError(null);
    setErrors(null);
  };

  const submit = async () => {
    if (saving || conflict) return;
    const invalid = validateTripDetails(values);
    setErrors(invalid);
    setServerError(null);
    if (invalid) return;
    const destinations = values.destinations.trim();
    // Only what the Traveler changed: a date they did not touch is never rewritten (it may carry a time or
    // timezone set elsewhere), and a save with no change makes no call and bumps no revision.
    const patch: TripDetailsPatch = {};
    if (values.title.trim() !== baseline.title.trim()) patch.title = values.title.trim();
    if (destinations !== baseline.destinations.trim()) patch.destinationSummary = destinations || null;
    if (values.start !== baseline.start) patch.plannedStartAt = dateInputToMs(values.start) ?? null;
    if (values.end !== baseline.end) patch.plannedEndAt = dateInputToMs(values.end) ?? null;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await updateTrip({ token, tripId: card.tripId, expectedRevision: revision, patch });
      onClose();
    } catch (error) {
      const info = tripErrorInfo(error, "Could not save the trip. Try again.");
      if (info.code === "trip_revision_conflict") setConflict(true);
      else setServerError(info.message);
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => (open || saving ? undefined : onClose())}>
      <SheetContent
        side="right"
        showBackdrop={false}
        data-sheet-nested-dialog=""
        initialFocus={titleRef}
        finalFocus={returnFocusRef}
      >
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>Edit {card.title}</SheetTitle>
          <SheetCloseButton />
        </SheetHeader>
        <SheetBody>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <TripDetailsFields
              idPrefix={`edit-trip-${card.tripId}`}
              values={values}
              errors={errors}
              titleRef={titleRef}
              onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
            />
            {!online ? <p className="text-xs text-[var(--ink-3)]">You're offline.</p> : null}
            {conflict ? (
              <div role="alert" className="flex items-center justify-between gap-2 text-xs text-[var(--ink-danger)]">
                <span>Changed elsewhere. Reload?</span>
                <Button type="button" variant="outline" size="sm" onClick={reload}>
                  Reload
                </Button>
              </div>
            ) : null}
            {serverError ? (
              <p role="alert" className="text-xs text-[var(--ink-danger)]">
                {serverError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || conflict || !online}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
