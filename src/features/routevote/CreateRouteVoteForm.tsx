import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useMutation } from "convex/react";
import { tripcastApi, type EnergyImpact, type ResultsVisibility } from "../../convex/tripcastApi";
import { useDebugLogger } from "../../debug/useDebugLogger";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { DialogueBox } from "../../components/rpg/DialogueBox";
import { haversineDistanceMiles } from "../../lib/routeVoteUtils";

type OptionFormValue = {
  title: string;
  description: string;
  locationLabel: string;
  lat: string;
  lon: string;
  estimatedCostUsd: string;
  estimatedDurationMinutes: string;
  estimatedEnergyImpact: EnergyImpact | "";
};

type FormValues = {
  title: string;
  description: string;
  expiresAtLocal: string;
  resultsVisibility: ResultsVisibility;
  options: OptionFormValue[];
};

const EMPTY_OPTION: OptionFormValue = {
  title: "",
  description: "",
  locationLabel: "",
  lat: "",
  lon: "",
  estimatedCostUsd: "",
  estimatedDurationMinutes: "",
  estimatedEnergyImpact: "",
};

const DEFAULT_TITLE = "Where should I go next?";
const DEFAULT_CLOSE_HOURS = 1;
const CLOSE_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "12 hours", hours: 12 },
  { label: "72 hours", hours: 72 },
] as const;

type CreateRouteVoteFormProps = {
  token: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
  onRequestCoordinatePick: (
    optionIndex: number,
    callback: (coord: { lat: number; lon: number }) => void,
  ) => void;
  referenceLocation: { lat: number; lon: number } | null;
};

function parseOptionalFloat(value: string): number | undefined {
  const n = parseFloat(value);
  return isNaN(n) ? undefined : n;
}

function parseOptionalInt(value: string): number | undefined {
  const n = parseInt(value, 10);
  return isNaN(n) ? undefined : n;
}

function toLocalDateTimeInputValue(timestamp: number) {
  const date = new Date(timestamp);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(timestamp - offsetMs).toISOString().slice(0, 16);
}

function closeTimeFromNow(hours: number) {
  return toLocalDateTimeInputValue(Date.now() + hours * 60 * 60 * 1000);
}

function DistanceWarning({
  lat,
  lon,
  referenceLocation,
}: {
  lat: string;
  lon: string;
  referenceLocation: { lat: number; lon: number } | null;
}) {
  if (!referenceLocation || !lat || !lon) return null;
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) return null;
  const dist = haversineDistanceMiles(
    referenceLocation.lat,
    referenceLocation.lon,
    latNum,
    lonNum,
  );
  if (dist <= 20) return null;
  return (
    <p className="text-xs text-amber-600">
      ⚠ {dist.toFixed(0)} mi from your current location — double-check coordinates
    </p>
  );
}

function OptionEditor({
  index,
  control,
  register,
  errors,
  canRemove,
  onRemove,
  onPickOnMap,
  referenceLocation,
}: {
  index: number;
  control: ReturnType<typeof useForm<FormValues>>["control"];
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  canRemove: boolean;
  onRemove: () => void;
  onPickOnMap: () => void;
  referenceLocation: { lat: number; lon: number } | null;
}) {
  const lat = useWatch({ control, name: `options.${index}.lat` });
  const lon = useWatch({ control, name: `options.${index}.lon` });
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-md border bg-muted/30 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Option {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Remove
          </button>
        )}
      </div>

      <Input
        {...register(`options.${index}.title`, {
          required: "Title required",
          maxLength: { value: 120, message: "Max 120 chars" },
        })}
        placeholder="Option title"
      />
      {errors.options?.[index]?.title && (
        <span className="text-destructive text-xs">{errors.options[index]?.title?.message}</span>
      )}

      <Input
        {...register(`options.${index}.locationLabel`)}
        placeholder="Location label (optional)"
      />

      <div className="grid grid-cols-2 gap-2">
        <Input
          {...register(`options.${index}.lat`)}
          placeholder="Latitude"
          type="number"
          step="any"
        />
        <Input
          {...register(`options.${index}.lon`)}
          placeholder="Longitude"
          type="number"
          step="any"
        />
      </div>

      <button
        type="button"
        onClick={onPickOnMap}
        className="text-xs text-muted-foreground hover:text-foreground underline text-left"
      >
        ↗ Pick on map
      </button>

      <DistanceWarning lat={lat} lon={lon} referenceLocation={referenceLocation} />

      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground underline text-left"
        aria-expanded={isExpanded}
      >
        {isExpanded ? "Hide details" : "More details"}
      </button>

      {isExpanded && (
        <div className="flex flex-col gap-2 border-t pt-2">
          <Textarea
            {...register(`options.${index}.description`)}
            rows={2}
            placeholder="Description (optional)"
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              {...register(`options.${index}.estimatedCostUsd`)}
              placeholder="Est. cost USD"
              type="number"
              step="0.01"
              min="0"
            />
            <Input
              {...register(`options.${index}.estimatedDurationMinutes`)}
              placeholder="Duration (min)"
              type="number"
              min="0"
            />
          </div>

          <select
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            {...register(`options.${index}.estimatedEnergyImpact`)}
          >
            <option value="">Energy impact (optional)</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      )}
    </div>
  );
}

export default function CreateRouteVoteForm({
  token,
  onCreated,
  onCancel,
  onRequestCoordinatePick,
  referenceLocation,
}: CreateRouteVoteFormProps) {
  const createVote = useMutation(tripcastApi.routeVotes.travelerCreateRouteVote);
  const [selectedClosePreset, setSelectedClosePreset] = useState<number | null>(DEFAULT_CLOSE_HOURS);
  const log = useDebugLogger("CreateRouteVoteForm", "src/features/routevote/CreateRouteVoteForm.tsx");

  useEffect(() => {
    log.logInteraction("form:open");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: DEFAULT_TITLE,
      description: "",
      expiresAtLocal: closeTimeFromNow(DEFAULT_CLOSE_HOURS),
      resultsVisibility: "before_voting",
      options: [{ ...EMPTY_OPTION }, { ...EMPTY_OPTION }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "options" });

  async function onSubmit(values: FormValues) {
    log.logInteraction("form:submit");
    const expiresAt = new Date(values.expiresAtLocal).getTime();
    const options = values.options.map((o) => ({
      title: o.title.trim(),
      description: o.description.trim() || undefined,
      locationLabel: o.locationLabel.trim() || undefined,
      lat: parseOptionalFloat(o.lat),
      lon: parseOptionalFloat(o.lon),
      estimatedCostUsd: parseOptionalFloat(o.estimatedCostUsd),
      estimatedDurationMinutes: parseOptionalInt(o.estimatedDurationMinutes),
      estimatedEnergyImpact: (o.estimatedEnergyImpact || undefined) as EnergyImpact | undefined,
    }));

    try {
      const id = await createVote({
        token,
        title: values.title.trim() || DEFAULT_TITLE,
        description: values.description.trim() || undefined,
        expiresAt,
        resultsVisibility: values.resultsVisibility,
        options,
      });
      log.logInteraction("submit:success", { id });
      onCreated(id);
    } catch (err) {
      log.logInteraction("submit:error", { message: String(err) });
      throw err;
    }
  }

  function handlePickOnMap(index: number) {
    log.logInteraction("coordinate:pick-requested", { optionIndex: index });
    onRequestCoordinatePick(index, ({ lat, lon }) => {
      log.logInteraction("coordinate:picked", { optionIndex: index, lat, lon });
      setValue(`options.${index}.lat`, lat.toFixed(6), { shouldValidate: true });
      setValue(`options.${index}.lon`, lon.toFixed(6), { shouldValidate: true });
    });
  }

  function handleClosePreset(hours: number) {
    setSelectedClosePreset(hours);
    setValue("expiresAtLocal", closeTimeFromNow(hours), { shouldValidate: true });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <DialogueBox title="Propose a Route">
        <div className="flex flex-col gap-4 mt-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Title
            <Input
              {...register("title", {
                maxLength: { value: 200, message: "Max 200 characters" },
              })}
              placeholder={DEFAULT_TITLE}
            />
            {errors.title && (
              <span className="text-destructive text-xs">{errors.title.message}</span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Description{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
            <Textarea
              {...register("description", {
                maxLength: { value: 2000, message: "Max 2000 characters" },
              })}
              rows={2}
              placeholder="Additional context for the party…"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Voting Closes In
              <div className="grid grid-cols-3 gap-1">
                {CLOSE_PRESETS.map((preset) => (
                  <button
                    key={preset.hours}
                    type="button"
                    onClick={() => handleClosePreset(preset.hours)}
                    className={`h-8 rounded-md border px-2 text-xs ${
                      selectedClosePreset === preset.hours
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-input bg-background hover:bg-accent/50"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <Input
                type="datetime-local"
                {...register("expiresAtLocal", {
                  required: "Close time is required",
                  validate: (value) =>
                    new Date(value).getTime() > Date.now() ||
                    "Close time must be in the future",
                  onChange: () => setSelectedClosePreset(null),
                })}
              />
              {errors.expiresAtLocal && (
                <span className="text-destructive text-xs">
                  {errors.expiresAtLocal.message}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Results visible
              <select
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                {...register("resultsVisibility")}
              >
                <option value="before_voting">Always</option>
                <option value="after_voting">After voting</option>
                <option value="after_close">After close</option>
                <option value="traveler_only">Traveler only</option>
              </select>
            </label>
          </div>
        </div>
      </DialogueBox>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Options</span>
        {fields.map((field, index) => (
          <OptionEditor
            key={field.id}
            index={index}
            control={control}
            register={register}
            errors={errors}
            canRemove={fields.length > 2}
            onRemove={() => remove(index)}
            onPickOnMap={() => handlePickOnMap(index)}
            referenceLocation={referenceLocation}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ ...EMPTY_OPTION })}
        >
          + Add option
        </Button>
      </div>

      <div className="flex gap-2 justify-end pb-4">
        <Button type="button" variant="outline" onClick={() => { log.logInteraction("form:cancel"); onCancel(); }} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Proposing…" : "Propose Route"}
        </Button>
      </div>
    </form>
  );
}
