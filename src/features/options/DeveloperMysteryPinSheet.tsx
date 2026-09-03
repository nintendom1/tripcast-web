import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MapPin, Sparkles } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { Button } from "../../components/ui/button";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import { FeatureBoundary } from "../../components/resilience/FeatureBoundary";
import {
  Sheet,
  SheetBody,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import { tripcastApi, type DeveloperTestMysteryMissionResult } from "../../convex/tripcastApi";
import { useActiveUiContext } from "../../debug/useActiveUiContext";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { getLiveSharingEnabled } from "../../lib/liveSharingPreference";

const DEBUG_PINS_STORAGE_KEY = "tripcast.mystery.showAllPinsDebug";

export const DEVELOPER_MYSTERY_SAMPLE = {
  mysteryText: "LOOK UP // OLD STORIES",
  trueIntent:
    "Take a moment to look above the storefronts. The upper floors often preserve details from an earlier version of the neighborhood that most visitors walk right past.",
};

type CreateStatus =
  | { type: "idle" }
  | { type: "locating" }
  | { type: "creating" }
  | { type: "error"; message: string }
  | {
      type: "created";
      result: DeveloperTestMysteryMissionResult;
      accuracyMeters?: number;
      liveEnabled: boolean;
    };

export type DeveloperMysteryPinContentProps = {
  mysteryText: string;
  trueIntent: string;
  onMysteryTextChange: (value: string) => void;
  onTrueIntentChange: (value: string) => void;
  onAutofill: () => void;
  onCreate: () => void;
  status: CreateStatus;
  settingsEnabled?: boolean;
  debugPinsEnabled: boolean;
};

export function DeveloperMysteryPinContent({
  mysteryText,
  trueIntent,
  onMysteryTextChange,
  onTrueIntentChange,
  onAutofill,
  onCreate,
  status,
  settingsEnabled,
  debugPinsEnabled,
}: DeveloperMysteryPinContentProps) {
  const working = status.type === "locating" || status.type === "creating";
  const needsSetup = settingsEnabled === false || !debugPinsEnabled;

  return (
    <SheetBody className="grid gap-5 px-5 py-4 text-[var(--ink-1)]">
      <section className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--flag)]" aria-hidden="true" />
          <div className="grid gap-1">
            <p className="text-sm font-semibold">Create at this device&apos;s current location</p>
            <p className="text-sm text-[var(--ink-3)]">
              TripCast asks for one fresh, high-accuracy position when you create the pin. It uses the normal 75 m Mystery Mission arrival radius.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold">
          Mystery pin text
          <input
            value={mysteryText}
            onChange={(event) => onMysteryTextChange(event.target.value)}
            maxLength={120}
            placeholder="A short clue shown before arrival"
            className="h-11 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 font-normal text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--ink-1)] focus:ring-1 focus:ring-[var(--ink-1)]"
          />
          <span className="text-right text-xs font-normal text-[var(--ink-3)]">{mysteryText.length}/120</span>
        </label>

        <label className="grid gap-1.5 text-sm font-semibold">
          Spoken reveal
          <textarea
            value={trueIntent}
            onChange={(event) => onTrueIntentChange(event.target.value)}
            maxLength={3000}
            placeholder="The tourist-style story that should play when you arrive"
            className="min-h-36 resize-y rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 font-normal leading-relaxed text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--ink-1)] focus:ring-1 focus:ring-[var(--ink-1)]"
          />
          <span className="text-right text-xs font-normal text-[var(--ink-3)]">{trueIntent.length}/3000</span>
        </label>

        <Button type="button" variant="outline" onClick={onAutofill} disabled={working}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Autofill tourist sample
        </Button>
      </section>

      {settingsEnabled === undefined ? (
        <p className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--ink-3)]">
          Checking Mystery Mission settings...
        </p>
      ) : needsSetup ? (
        <p className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--ink-2)]">
          Creating this test will enable Mystery Missions and show debug Mystery pins on this device.
        </p>
      ) : null}

      {status.type === "error" ? (
        <p role="alert" className="rounded-xl border border-[var(--ink-danger)] bg-[var(--bg-danger)] px-3 py-2 text-sm text-[var(--ink-danger)]">
          {status.message}
        </p>
      ) : null}

      {status.type === "created" ? (
        <section role="status" className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
            <CheckCircle2 className="h-5 w-5 text-[var(--flag)]" aria-hidden="true" />
            Test Mystery pin created
          </div>
          <p className="text-sm text-[var(--ink-3)]">
            {status.result.lat.toFixed(5)}, {status.result.lon.toFixed(5)}
            {status.accuracyMeters !== undefined ? ` · ±${Math.round(status.accuracyMeters)} m` : ""}
          </p>
          <p className="text-sm text-[var(--ink-2)]">
            {status.liveEnabled
              ? "Live is on. The native proximity watcher will evaluate this pin on the next qualifying location fix."
              : "Live is off. Close Options and turn Live on from the map. The native proximity watcher will evaluate this pin on the next qualifying location fix."}
          </p>
        </section>
      ) : null}

      <Button
        type="button"
        onClick={onCreate}
        disabled={working || settingsEnabled === undefined || !mysteryText.trim() || !trueIntent.trim()}
      >
        {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
        {status.type === "locating"
          ? "Getting current location..."
          : status.type === "creating"
            ? "Creating test pin..."
            : "Create Test Mystery Pin"}
      </Button>
    </SheetBody>
  );
}

function getStoredBoolean(key: string) {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function currentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This device does not provide browser location access."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 10_000,
    });
  });
}

function locationErrorText(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = Number((error as { code: unknown }).code);
    if (code === 1) return "Location permission was denied. Allow precise location access, then try again.";
    if (code === 2) return "Your current location is unavailable. Move somewhere with a clearer GPS view, then try again.";
    if (code === 3) return "TripCast could not get a current location within 15 seconds. Try again outdoors.";
  }
  return error instanceof Error ? error.message : "The test Mystery pin could not be created.";
}

function DeveloperMysteryPinBody({ open, token }: { open: boolean; token: string }) {
  const settings = useQuery(
    tripcastApi.mysteryMissions.travelerGetMysteryMissionSettings,
    open ? { token } : "skip",
  );
  const createTest = useMutation(tripcastApi.mysteryMissions.travelerCreateDeveloperTestMysteryMission);
  const [mysteryText, setMysteryText] = useState("");
  const [trueIntent, setTrueIntent] = useState("");
  const [status, setStatus] = useState<CreateStatus>({ type: "idle" });
  const [confirmSetup, setConfirmSetup] = useState(false);
  const [debugPinsEnabled, setDebugPinsEnabled] = useState(() => getStoredBoolean(DEBUG_PINS_STORAGE_KEY));
  const log = useDebugLogger("DeveloperMysteryPinSheet", "src/features/options/DeveloperMysteryPinSheet.tsx");

  useEffect(() => {
    if (!open) {
      setStatus({ type: "idle" });
      setConfirmSetup(false);
      return;
    }
    setDebugPinsEnabled(getStoredBoolean(DEBUG_PINS_STORAGE_KEY));
  }, [open]);

  const autofill = () => {
    setMysteryText(DEVELOPER_MYSTERY_SAMPLE.mysteryText);
    setTrueIntent(DEVELOPER_MYSTERY_SAMPLE.trueIntent);
    setStatus({ type: "idle" });
    log.logUi("action:developer-mystery-pin:autofill");
  };

  const create = async () => {
    const trimmedMysteryText = mysteryText.trim();
    const trimmedTrueIntent = trueIntent.trim();
    if (!trimmedMysteryText || !trimmedTrueIntent) {
      setStatus({ type: "error", message: "Enter both the Mystery pin text and spoken reveal." });
      return;
    }

    setStatus({ type: "locating" });
    log.logUi("action:developer-mystery-pin:locating");
    try {
      const position = await currentPosition();
      setStatus({ type: "creating" });
      const result = await createTest({
        token,
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        mysteryText: trimmedMysteryText,
        trueIntent: trimmedTrueIntent,
      });

      try {
        localStorage.setItem(DEBUG_PINS_STORAGE_KEY, "true");
        setDebugPinsEnabled(true);
        window.dispatchEvent(new CustomEvent("tripcast:mystery-debug-pins", { detail: { enabled: true } }));
      } catch {
        // The test still exists and remains accessible from Missions and Mystery Mission management.
      }

      const liveEnabled = getLiveSharingEnabled();
      setStatus({ type: "created", result, accuracyMeters: position.coords.accuracy, liveEnabled });
      log.logUi("action:developer-mystery-pin:created", {
        mysteryMissionId: result.mysteryMissionId,
        accuracyMeters: position.coords.accuracy,
        liveEnabled,
      });
    } catch (error) {
      setStatus({ type: "error", message: locationErrorText(error) });
      log.error("action:developer-mystery-pin:failed", "error", {
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
  };

  const requestCreate = () => {
    if (settings?.enabled !== true || !debugPinsEnabled) {
      setConfirmSetup(true);
      return;
    }
    void create();
  };

  return (
    <>
      <DeveloperMysteryPinContent
        mysteryText={mysteryText}
        trueIntent={trueIntent}
        onMysteryTextChange={(value) => { setMysteryText(value); setStatus({ type: "idle" }); }}
        onTrueIntentChange={(value) => { setTrueIntent(value); setStatus({ type: "idle" }); }}
        onAutofill={autofill}
        onCreate={requestCreate}
        status={status}
        settingsEnabled={settings?.enabled}
        debugPinsEnabled={debugPinsEnabled}
      />
      <ConfirmModal
        open={confirmSetup}
        onOpenChange={setConfirmSetup}
        title="Enable Mystery Mission testing?"
        description="Creating this pin will enable Mystery Missions for the trip and show debug Mystery pins on this device. It will not turn Live on."
        confirmLabel="Enable and create"
        onConfirm={() => void create()}
      />
    </>
  );
}

type DeveloperMysteryPinSheetProps = {
  open: boolean;
  token: string;
  onOpenChange: (open: boolean) => void;
};

export default function DeveloperMysteryPinSheet({ open, token, onOpenChange }: DeveloperMysteryPinSheetProps) {
  const log = useDebugLogger("DeveloperMysteryPinSheet", "src/features/options/DeveloperMysteryPinSheet.tsx");

  useEffect(() => {
    log.logUi(open ? "sheet:open" : "sheet:close");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useActiveUiContext(open, {
    sheetName: "DeveloperMysteryPinSheet",
    label: "Create Test Mystery Pin",
    source: "options:developer",
    sourceLabel: "Options -> Developer -> Create Test Mystery Pin",
    file: "src/features/options/DeveloperMysteryPinSheet.tsx",
  }, { boundsSelector: "[data-role='developer-mystery-pin-sheet']" });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-role="developer-mystery-pin-sheet"
        className="max-h-[88dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start justify-between gap-2 px-5 pt-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <SheetTitle className="font-[var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--ink-1)]">
              Create Test Mystery Pin
            </SheetTitle>
            <p className="text-sm text-[var(--ink-3)]">Traveler-only proximity and native audio testing.</p>
          </div>
          <SheetCloseButton aria-label="Close test Mystery pin creator" />
        </div>

        <FeatureBoundary
          title="Test pin creator hit a snag."
          message="Close and reopen the Developer test pin creator, then try again."
          onClose={() => onOpenChange(false)}
          resetKeys={[open]}
        >
          <DeveloperMysteryPinBody open={open} token={token} />
        </FeatureBoundary>
      </SheetContent>
    </Sheet>
  );
}
