import { useRef, useState, type RefObject } from "react";
import { useMutation } from "convex/react";
import { ErrorBoundary } from "react-error-boundary";

import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetCloseButton, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOnlineStatus } from "../../components/resilience/useOnlineStatus";
import { tripcastApi } from "../../convex/tripcastApi";
import { useKeyboardInset } from "../../hooks/useKeyboardInset";
import { useTripContext } from "../../providers/TripContextProvider";
import {
  dateInputToMs,
  TRIP_FORM_SHEET_CLASS,
  TripDetailsFields,
  tripFormBodyStyle,
  validateTripDetails,
  type TripDetailsErrors,
  type TripDetailsValues,
} from "./EditTripSheet";
import { tripErrorInfo } from "./tripSwitchState";
import { useTravelerTrips } from "./useTravelerTrips";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-card-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type CopySource = { id: string; title: string };
const DEFAULTS_SOURCE: CopySource = { id: "defaults", title: "Defaults" };

type CopyFromSelectProps = {
  value: CopySource;
  onChange: (source: CopySource) => void;
};

/** The settings-source picker with the catalog behind it: "Load more" reaches beyond the first page. */
function CopyFromOptions({ value, onChange }: CopyFromSelectProps) {
  const { cards, status, loadMore } = useTravelerTrips(null);
  return (
    <CopyFromSelect
      value={value}
      onChange={onChange}
      trips={cards.filter((c) => c.deletingAt === undefined)}
      canLoadMore={status === "ready" || status === "loading-more"}
      loadingMore={status === "loading-more"}
      onLoadMore={loadMore}
    />
  );
}

type CopyFromSelectViewProps = CopyFromSelectProps & {
  trips: Array<{ tripId: string; title: string }>;
  canLoadMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

function CopyFromSelect({
  value,
  onChange,
  trips,
  canLoadMore,
  loadingMore,
  onLoadMore,
}: CopyFromSelectViewProps) {
  // The chosen source stays selectable even when the loaded pages no longer list it.
  const listed = trips.some((trip) => trip.tripId === value.id);
  const extra = value.id !== DEFAULTS_SOURCE.id && !listed ? [{ tripId: value.id, title: value.title }] : [];
  const options = [...extra, ...trips];
  return (
    <div className="grid gap-1">
      <label htmlFor="create-trip-copy-from" className="text-xs font-semibold text-[var(--ink-2)]">
        Copy settings from
      </label>
      <select
        id="create-trip-copy-from"
        className={SELECT_CLASS}
        value={value.id}
        aria-describedby="create-trip-copy-help"
        onChange={(e) => {
          const id = e.target.value;
          const chosen = options.find((trip) => trip.tripId === id);
          onChange(chosen ? { id, title: chosen.title } : DEFAULTS_SOURCE);
        }}
      >
        <option value="defaults">Defaults</option>
        {options.map((trip) => (
          <option key={trip.tripId} value={trip.tripId}>
            {trip.title}
          </option>
        ))}
      </select>
      {canLoadMore && onLoadMore ? (
        <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? "Loading…" : "Load more trips"}
        </Button>
      ) : null}
      <p id="create-trip-copy-help" className="text-xs text-[var(--ink-3)]">
        Copies settings only. Stories, expenses and budget amounts are never copied.
      </p>
    </div>
  );
}

export type CreateTripSheetProps = {
  onClose: () => void;
  /** Called with the new trip's id once the server has created it. */
  onCreated: (tripId: string) => void;
  /** Receives focus when the sheet closes (the control that opened it). */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Sheet that creates a planned trip: title (required, 80 characters at most), destinations, planned dates and the
 * settings source. Mount it only while open. The new trip is neither opened nor shared.
 */
export function CreateTripSheet({ onClose, onCreated, returnFocusRef }: CreateTripSheetProps) {
  const { token } = useTripContext();
  const createTrip = useMutation(tripcastApi.trips.createTrip);
  const online = useOnlineStatus();
  const sheetRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useKeyboardInset();
  const [values, setValues] = useState<TripDetailsValues>({ title: "", destinations: "", start: "", end: "" });
  const [copyFrom, setCopyFrom] = useState<CopySource>(DEFAULTS_SOURCE);
  const [errors, setErrors] = useState<TripDetailsErrors | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    const invalid = validateTripDetails(values);
    setErrors(invalid);
    setServerError(null);
    if (invalid) return;
    const destinations = values.destinations.trim();
    const plannedStartAt = dateInputToMs(values.start);
    const plannedEndAt = dateInputToMs(values.end);
    setSaving(true);
    try {
      const { tripId } = await createTrip({
        token,
        title: values.title.trim(),
        ...(destinations ? { destinationSummary: destinations } : {}),
        ...(plannedStartAt !== undefined ? { plannedStartAt } : {}),
        ...(plannedEndAt !== undefined ? { plannedEndAt } : {}),
        copySettingsFrom: copyFrom.id,
      });
      onCreated(tripId);
    } catch (error) {
      setServerError(tripErrorInfo(error, "Could not create the trip. Try again.").message);
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => (open || saving ? undefined : onClose())}>
      {/* Focus lands on the sheet, not a field, so no keyboard pops up on open. */}
      <SheetContent
        ref={sheetRef}
        side="bottom"
        nestedDialog
        initialFocus={sheetRef}
        finalFocus={returnFocusRef}
        className={TRIP_FORM_SHEET_CLASS}
      >
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>Create trip</SheetTitle>
          <SheetCloseButton />
        </SheetHeader>
        <SheetBody style={tripFormBodyStyle(keyboardInset)}>
          <form
            className="mx-auto grid w-full max-w-md gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <TripDetailsFields
              idPrefix="create-trip"
              values={values}
              errors={errors}
              onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
            >
              <ErrorBoundary
                fallbackRender={() => <CopyFromSelect value={copyFrom} onChange={setCopyFrom} trips={[]} />}
              >
                <CopyFromOptions value={copyFrom} onChange={setCopyFrom} />
              </ErrorBoundary>
            </TripDetailsFields>
            {!online ? <p className="text-xs text-[var(--ink-3)]">You're offline.</p> : null}
            {serverError ? (
              <p role="alert" className="text-xs text-[var(--ink-danger)]">
                {serverError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !online}>
                {saving ? "Creating…" : "Create trip"}
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
