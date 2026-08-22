import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Cloud,
  Images,
  Loader2,
  MapPin,
  Settings,
} from "lucide-react";

import { Button } from "../../components/ui/button";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import {
  Sheet,
  SheetCloseButton,
  SheetContent,
  SheetTitle,
} from "../../components/ui/sheet";
import type { LiveTrailSample } from "../../convex/tripcastApi";
import type { StoryImageDraft } from "../journal/storyImageUpload";
import { useCenteringCalibration } from "../../debug/useCenteringCalibration";
import {
  photoLibrary,
  type PhotoAsset,
  type PhotoAuthorizationStatus,
  type PhotoLibraryAdapter,
} from "./photoLibrary";

export type RouletteLocation = {
  lat: number;
  lon: number;
  source: "photo" | "trail";
  deltaMs?: number;
};

type NearestTrailResult = {
  capturedAtMs: number;
  sample: LiveTrailSample | null;
  deltaMs: number | null;
};

export type PhotoRouletteSelection = {
  asset: PhotoAsset;
  image: StoryImageDraft;
  location: RouletteLocation | null;
};

type PhotoRouletteSheetProps = {
  open: boolean;
  hidden?: boolean;
  cutoffAt: number | null | undefined;
  queuedAssetIds?: ReadonlySet<string>;
  adapter?: PhotoLibraryAdapter;
  resolveNearestTrail: (capturedAtMs: number[]) => Promise<NearestTrailResult[]>;
  onMapCoordinate: (coordinate: { lat: number; lon: number }, settled: boolean) => void;
  onUsePhoto: (selection: PhotoRouletteSelection) => void;
  onClose: () => void;
};

type PrepareState =
  | { type: "idle" }
  | { type: "checking"; assetId: string }
  | { type: "requiresDownload"; assetId: string }
  | { type: "downloading"; assetId: string; progress: number }
  | { type: "prepared"; assetId: string; image: StoryImageDraft }
  | { type: "error"; assetId: string; message: string };

type SessionPhase = "idle" | "opening" | "refreshing" | "ready" | "empty" | "error";

const PAGE_SIZE = 24;
const TRAIL_WINDOW_RADIUS = 5;
const LAST_ASSET_STORAGE_KEY = "tripcast.photo-roulette.last-asset";

function readCachedAssetId() {
  try {
    return localStorage.getItem(LAST_ASSET_STORAGE_KEY);
  } catch {
    return null;
  }
}

function cacheAssetId(assetId: string) {
  try {
    localStorage.setItem(LAST_ASSET_STORAGE_KEY, assetId);
  } catch {
    // Photo restoration is best-effort when browser storage is unavailable.
  }
}

function formatCaptureDate(value: number | null) {
  if (value === null) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDelta(deltaMs: number) {
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "under 1 min away";
  if (minutes < 60) return `${minutes} min away`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr away`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} away`;
}

function shortestLongitude(from: number, to: number, progress: number) {
  let difference = to - from;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  const value = from + difference * progress;
  return ((value + 540) % 360) - 180;
}

function deckIndexFromScroll(deck: HTMLDivElement, assetCount: number) {
  const cards = deck.querySelectorAll<HTMLElement>("[data-photo-roulette-card]");
  if (cards.length < 2) return 0;
  const maxScroll = Math.max(0, deck.scrollWidth - deck.clientWidth);
  const snapPositions = Array.from(cards, (card) => Math.max(
    0,
    Math.min(maxScroll, card.offsetLeft + card.offsetWidth / 2 - deck.clientWidth / 2),
  ));
  for (let index = 0; index < snapPositions.length - 1; index += 1) {
    const from = snapPositions[index];
    const to = snapPositions[index + 1];
    if (deck.scrollLeft <= to) {
      const progress = to > from ? (deck.scrollLeft - from) / (to - from) : 0;
      return Math.max(0, Math.min(assetCount - 1, index + progress));
    }
  }
  return Math.min(assetCount - 1, snapPositions.length - 1);
}

export function PhotoRouletteSheet({
  open,
  hidden = false,
  cutoffAt,
  queuedAssetIds = new Set<string>(),
  adapter = photoLibrary,
  resolveNearestTrail,
  onMapCoordinate,
  onUsePhoto,
  onClose,
}: PhotoRouletteSheetProps) {
  const [authorization, setAuthorization] = useState<PhotoAuthorizationStatus | "loading">("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("idle");
  const [total, setTotal] = useState(0);
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [windowOffset, setWindowOffset] = useState(0);
  const [activeAbsoluteIndex, setActiveAbsoluteIndex] = useState(0);
  const [scrubIndex, setScrubIndex] = useState(0);
  const [thumbnails, setThumbnails] = useState<Record<string, { data: string | null; isInCloud: boolean }>>({});
  const [trailLocations, setTrailLocations] = useState<Record<string, RouletteLocation | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [prepareState, setPrepareState] = useState<PrepareState>({ type: "idle" });
  const deckRef = useRef<HTMLDivElement>(null);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMapUpdateRef = useRef(0);
  const trailRequestsRef = useRef(new Set<string>());
  const pendingScrollAssetIdRef = useRef<string | null>(null);
  const pageRequestRef = useRef(0);
  const assetsRef = useRef(assets);
  const suppressTapUntilRef = useRef(0);
  const deliveredAssetIdRef = useRef<string | null>(null);
  const calibration = useCenteringCalibration();
  assetsRef.current = assets;

  const activeLocalIndex = Math.max(
    0,
    Math.min(assets.length - 1, activeAbsoluteIndex - windowOffset),
  );

  const locationFor = useCallback((asset: PhotoAsset | undefined): RouletteLocation | null | undefined => {
    if (!asset) return null;
    if (asset.lat !== null && asset.lon !== null) {
      return { lat: asset.lat, lon: asset.lon, source: "photo" };
    }
    if (asset.capturedAt === null) return null;
    return trailLocations[asset.id];
  }, [trailLocations]);

  const startSession = useCallback(async (cutoffAtMs: number | null) => {
    const requestId = ++pageRequestRef.current;
    setError(null);
    setLoadingPage(false);
    setSessionPhase(assetsRef.current.length > 0 ? "refreshing" : "opening");
    const session = await adapter.startSession(cutoffAtMs);
    if (pageRequestRef.current !== requestId) return;
    setSessionId(session.sessionId);
    setTotal(session.total);
    if (session.total === 0) {
      setAssets([]);
      setWindowOffset(0);
      setActiveAbsoluteIndex(0);
      setScrubIndex(0);
      setSessionPhase("empty");
      return;
    }
    const cachedAssetId = readCachedAssetId();
    let cachedIndex: number | null = null;
    if (cachedAssetId) {
      try {
        cachedIndex = await adapter.getAssetIndex(session.sessionId, cachedAssetId);
      } catch {
        // A stale identifier or older native shell should still open at newest.
      }
    }
    if (pageRequestRef.current !== requestId) return;
    const targetIndex = cachedIndex ?? 0;
    const maxPageOffset = Math.max(0, session.total - PAGE_SIZE);
    const initialOffset = Math.max(
      0,
      Math.min(maxPageOffset, targetIndex - Math.floor(PAGE_SIZE / 2)),
    );
    const firstPage = await adapter.getAssets(session.sessionId, initialOffset, PAGE_SIZE);
    if (pageRequestRef.current !== requestId) return;
    const cachedLocalIndex = cachedAssetId
      ? firstPage.assets.findIndex((asset) => asset.id === cachedAssetId)
      : -1;
    const resolvedAbsoluteIndex = cachedLocalIndex >= 0
      ? initialOffset + cachedLocalIndex
      : Math.max(0, Math.min(session.total - 1, targetIndex));
    const initialLocalIndex = resolvedAbsoluteIndex - initialOffset;
    setWindowOffset(initialOffset);
    setAssets(firstPage.assets);
    setActiveAbsoluteIndex(resolvedAbsoluteIndex);
    setScrubIndex(resolvedAbsoluteIndex);
    pendingScrollAssetIdRef.current = firstPage.assets[initialLocalIndex]?.id ?? null;
    setSessionPhase(firstPage.assets.length > 0 ? "ready" : "empty");
  }, [adapter]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        let status = await adapter.getAuthorizationStatus();
        if (status === "notDetermined") status = await adapter.requestAuthorization();
        if (cancelled) return;
        setAuthorization(status);
        if (status === "authorized" || status === "limited") {
          if (cutoffAt === undefined) {
            setSessionPhase(assetsRef.current.length > 0 ? "refreshing" : "opening");
            return;
          }
          await startSession(cutoffAt);
        }
      } catch (nextError) {
        if (!cancelled) {
          setSessionPhase("error");
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [adapter, cutoffAt, open, startSession]);

  useEffect(() => {
    if (open) return;
    pageRequestRef.current += 1;
    if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
    setSessionId(null);
    setSessionPhase("idle");
    setLoadingPage(false);
    setPrepareState({ type: "idle" });
    void adapter.endSession().catch(() => {});
  }, [adapter, open]);

  const centerAssetInDeck = useCallback((assetId: string) => {
    const deck = deckRef.current;
    if (!assetId || !deck) return;
    const card = Array.from(deck.querySelectorAll<HTMLElement>("[data-photo-roulette-card]"))
      .find((element) => element.dataset.assetId === assetId);
    if (!card) return;
    const maxScroll = Math.max(0, deck.scrollWidth - deck.clientWidth);
    deck.scrollLeft = Math.max(
      0,
      Math.min(maxScroll, card.offsetLeft + card.offsetWidth / 2 - deck.clientWidth / 2),
    );
  }, []);

  useLayoutEffect(() => {
    const assetId = pendingScrollAssetIdRef.current;
    if (!assetId) return;
    centerAssetInDeck(assetId);
    pendingScrollAssetIdRef.current = null;
  }, [assets, centerAssetInDeck]);

  useEffect(() => {
    if (!open) return;
    let handle: { remove: () => Promise<void> } | null = null;
    void adapter.onDownloadProgress((event) => {
      setPrepareState((current) => current.type === "downloading" && current.assetId === event.assetId
        ? { ...current, progress: event.progress }
        : current);
    }).then((nextHandle) => { handle = nextHandle; });
    return () => { void handle?.remove(); };
  }, [adapter, open]);

  useEffect(() => {
    if (!open || assets.length === 0) return;
    const nearby = assets
      .slice(Math.max(0, activeLocalIndex - 2), activeLocalIndex + 3)
      .filter((asset) => thumbnails[asset.id] === undefined)
      .map((asset) => asset.id);
    if (nearby.length === 0) return;
    let cancelled = false;
    void adapter.getThumbnails(nearby, 360, 360).then((results) => {
      if (cancelled) return;
      setThumbnails((current) => {
        const next = { ...current };
        for (const result of results) next[result.id] = { data: result.data, isInCloud: result.isInCloud };
        return next;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeLocalIndex, adapter, assets, open, thumbnails]);

  useEffect(() => {
    if (!open || assets.length === 0) return;
    const windowAssets = assets.slice(
      Math.max(0, activeLocalIndex - TRAIL_WINDOW_RADIUS),
      activeLocalIndex + TRAIL_WINDOW_RADIUS + 1,
    );
    const pendingRequests = trailRequestsRef.current;
    const candidates = windowAssets.filter((asset) =>
      asset.lat === null
      && asset.lon === null
      && asset.capturedAt !== null
      && trailLocations[asset.id] === undefined
      && !pendingRequests.has(asset.id),
    );
    if (candidates.length === 0) return;
    for (const asset of candidates) pendingRequests.add(asset.id);
    void resolveNearestTrail(candidates.map((asset) => asset.capturedAt!))
      .then((results) => {
        setTrailLocations((current) => {
          const next = { ...current };
          candidates.forEach((asset, index) => {
            const result = results[index];
            next[asset.id] = result?.sample && result.deltaMs !== null
              ? {
                  lat: result.sample.lat,
                  lon: result.sample.lon,
                  source: "trail",
                  deltaMs: result.deltaMs,
                }
              : null;
          });
          return next;
        });
      })
      .catch(() => {
        setTrailLocations((current) => {
          const next = { ...current };
          for (const asset of candidates) next[asset.id] = null;
          return next;
        });
      });
  }, [activeLocalIndex, assets, open, resolveNearestTrail, trailLocations]);

  const loadWindowAround = useCallback((requestedIndex: number) => {
    if (!sessionId || total === 0) return;
    const targetIndex = Math.max(0, Math.min(total - 1, Math.round(requestedIndex)));
    const maxPageOffset = Math.max(0, total - PAGE_SIZE);
    const pageOffset = Math.max(
      0,
      Math.min(maxPageOffset, targetIndex - Math.floor(PAGE_SIZE / 2)),
    );
    const requestId = ++pageRequestRef.current;
    setLoadingPage(true);
    void adapter.getAssets(sessionId, pageOffset, PAGE_SIZE)
      .then((page) => {
        if (pageRequestRef.current !== requestId || page.assets.length === 0) return;
        const localIndex = Math.max(0, Math.min(page.assets.length - 1, targetIndex - pageOffset));
        pendingScrollAssetIdRef.current = page.assets[localIndex]?.id ?? null;
        setWindowOffset(pageOffset);
        setAssets(page.assets);
        setActiveAbsoluteIndex(pageOffset + localIndex);
        setScrubIndex(pageOffset + localIndex);
      })
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)))
      .finally(() => {
        if (pageRequestRef.current === requestId) setLoadingPage(false);
      });
  }, [adapter, sessionId, total]);

  useEffect(() => {
    if (!sessionId || loadingPage || assets.length === 0) return;
    const nearNewerEdge = activeLocalIndex <= 4 && windowOffset > 0;
    const nearOlderEdge = activeLocalIndex >= assets.length - 5
      && windowOffset + assets.length < total;
    if (nearNewerEdge || nearOlderEdge) loadWindowAround(activeAbsoluteIndex);
  }, [
    activeAbsoluteIndex,
    activeLocalIndex,
    assets.length,
    loadWindowAround,
    loadingPage,
    sessionId,
    total,
    windowOffset,
  ]);

  useEffect(() => {
    const coordinate = locationFor(assets[activeLocalIndex]);
    if (coordinate) onMapCoordinate(coordinate, true);
  }, [activeLocalIndex, assets, locationFor, onMapCoordinate]);

  useEffect(() => {
    const asset = assets[activeLocalIndex];
    if (!asset) return;
    cacheAssetId(asset.id);
    setScrubIndex(activeAbsoluteIndex);
  }, [activeAbsoluteIndex, activeLocalIndex, assets]);

  const seekToAbsoluteIndex = useCallback((requestedIndex: number) => {
    if (!sessionId || total === 0) return;
    const targetIndex = Math.max(0, Math.min(total - 1, Math.round(requestedIndex)));
    const targetLocalIndex = targetIndex - windowOffset;
    const targetAsset = assets[targetLocalIndex];
    if (targetLocalIndex >= 0 && targetLocalIndex < assets.length && targetAsset) {
      setActiveAbsoluteIndex(targetIndex);
      setScrubIndex(targetIndex);
      requestAnimationFrame(() => centerAssetInDeck(targetAsset.id));
      return;
    }
    loadWindowAround(targetIndex);
  }, [assets, centerAssetInDeck, loadWindowAround, sessionId, total, windowOffset]);

  const handleScrubberChange = useCallback((nextIndex: number) => {
    setScrubIndex(nextIndex);
    if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
    scrubTimerRef.current = setTimeout(() => seekToAbsoluteIndex(nextIndex), 120);
  }, [seekToAbsoluteIndex]);

  const handleScroll = useCallback(() => {
    const deck = deckRef.current;
    if (!deck || deck.clientWidth <= 0) return;
    suppressTapUntilRef.current = performance.now() + 220;
    const fractionalIndex = deckIndexFromScroll(deck, assets.length);
    const lowerIndex = Math.floor(fractionalIndex);
    const upperIndex = Math.min(assets.length - 1, Math.ceil(fractionalIndex));
    const lower = locationFor(assets[lowerIndex]);
    const upper = locationFor(assets[upperIndex]);
    const now = performance.now();
    if (now - lastMapUpdateRef.current >= 100) {
      const progress = fractionalIndex - lowerIndex;
      if (lower && upper) {
        onMapCoordinate({
          lat: lower.lat + (upper.lat - lower.lat) * progress,
          lon: shortestLongitude(lower.lon, upper.lon, progress),
        }, false);
      } else if (lower || upper) {
        const coordinate = lower ?? upper!;
        onMapCoordinate(coordinate, false);
      }
      lastMapUpdateRef.current = now;
    }
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(() => {
      const nextLocalIndex = Math.round(deckIndexFromScroll(deck, assets.length));
      setActiveAbsoluteIndex(windowOffset + nextLocalIndex);
    }, 140);
  }, [assets, locationFor, onMapCoordinate, windowOffset]);

  const activeAsset = assets[activeLocalIndex];
  const activeLocationState = locationFor(activeAsset);
  const activeLocation = activeLocationState ?? null;

  async function preparePhoto(asset: PhotoAsset, networkAccessAllowed: boolean) {
    setError(null);
    deliveredAssetIdRef.current = null;
    setPrepareState(networkAccessAllowed
      ? { type: "downloading", assetId: asset.id, progress: 0 }
      : { type: "checking", assetId: asset.id });
    try {
      const prepared = await adapter.prepareAsset(asset.id, networkAccessAllowed);
      if (prepared === "requiresDownload") {
        setPrepareState({ type: "requiresDownload", assetId: asset.id });
        return;
      }
      setPrepareState({ type: "prepared", assetId: asset.id, image: prepared });
    } catch (nextError) {
      setPrepareState({
        type: "error",
        assetId: asset.id,
        message: nextError instanceof Error ? nextError.message : String(nextError),
      });
    }
  }

  function handlePhotoTap(asset: PhotoAsset, localIndex: number) {
    if (
      performance.now() < suppressTapUntilRef.current
      || sessionPhase !== "ready"
      || prepareState.type === "checking"
      || prepareState.type === "downloading"
      || prepareState.type === "prepared"
    ) return;
    const absoluteIndex = windowOffset + localIndex;
    setActiveAbsoluteIndex(absoluteIndex);
    setScrubIndex(absoluteIndex);
    cacheAssetId(asset.id);
    const coordinate = locationFor(asset);
    if (coordinate) onMapCoordinate(coordinate, true);
    void preparePhoto(asset, false);
  }

  useEffect(() => {
    if (prepareState.type !== "prepared") return;
    const asset = assets.find((candidate) => candidate.id === prepareState.assetId);
    if (!asset) return;
    const location = locationFor(asset);
    if (location === undefined || deliveredAssetIdRef.current === asset.id) return;
    deliveredAssetIdRef.current = asset.id;
    setPrepareState({ type: "idle" });
    onUsePhoto({ asset, image: prepareState.image, location });
  }, [assets, locationFor, onUsePhoto, prepareState]);

  async function cancelDownload() {
    if (prepareState.type !== "downloading") return;
    await adapter.cancelPrepare(prepareState.assetId).catch(() => {});
    setPrepareState({ type: "idle" });
  }

  async function refreshLimitedAccess() {
    await adapter.manageLimitedAccess();
    await adapter.endSession();
    if (cutoffAt !== undefined) await startSession(cutoffAt);
  }

  const permissionBlocked = authorization === "denied" || authorization === "restricted";
  const isPreparing = prepareState.type === "checking"
    || prepareState.type === "downloading"
    || prepareState.type === "prepared";
  const downloadAsset = prepareState.type === "requiresDownload"
    ? assets.find((asset) => asset.id === prepareState.assetId)
    : undefined;
  const preparationError = prepareState.type === "error" && prepareState.assetId === activeAsset?.id
    ? prepareState.message
    : null;

  return (
    <Sheet
      open={open && !hidden}
      modal={false}
      disablePointerDismissal={calibration}
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
    >
      <SheetContent
        side="bottom"
        showBackdrop={false}
        mapAdjacent
        data-role="photo-roulette-sheet"
        className="z-[11] h-[44dvh] rounded-t-[var(--radius-sheet)] border-0 bg-[var(--bg-paper)] px-0 pt-0 !pb-[100px] shadow-[var(--shadow-card)]"
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && open && !hidden && activeLocation) {
            onMapCoordinate(activeLocation, true);
          }
        }}
      >
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0">
            <SheetTitle className="font-[var(--font-display)] text-xl font-extrabold text-[var(--ink-1)]">
              Photo Roulette
            </SheetTitle>
          </div>
          <SheetCloseButton aria-label="Close Photo Roulette" />
        </div>

        {authorization === "loading" && assets.length === 0 ? (
          <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-[var(--ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening Photos…
          </div>
        ) : permissionBlocked ? (
          <div className="mx-4 grid flex-1 place-content-center gap-3 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 text-center">
            <Images className="mx-auto h-8 w-8 text-[var(--ink-3)]" />
            <p className="text-sm font-semibold text-[var(--ink-1)]">Photos access is off</p>
            <p className="text-xs text-[var(--ink-3)]">Allow access in iPhone Settings to browse photos on the map.</p>
            <Button type="button" onClick={() => void adapter.openSettings()}>
              <Settings className="h-4 w-4" /> Open Settings
            </Button>
          </div>
        ) : sessionPhase === "error" && assets.length === 0 ? (
          <div className="mx-4 flex min-h-36 flex-col items-center justify-center gap-2 text-center text-sm text-[var(--ink-3)]">
            <Images className="h-8 w-8" />
            <span>Couldn’t open Photos.</span>
            {error ? <span role="alert" className="text-xs text-[var(--ink-danger)]">{error}</span> : null}
          </div>
        ) : sessionPhase === "empty" ? (
          <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-sm text-[var(--ink-3)]">
            <Images className="h-8 w-8" />
            <span>{cutoffAt === null ? "No accessible photos found." : "No photos found since the trip start."}</span>
          </div>
        ) : assets.length === 0 ? (
          <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-[var(--ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening Photos…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 px-4 pb-1 text-xs text-[var(--ink-3)]">
              <span className="flex items-center gap-1.5">
                {total > 0 ? `${Math.min(scrubIndex + 1, total)} of ${total}` : ""}
                {sessionPhase === "refreshing" ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Refreshing…</>
                ) : null}
              </span>
              {authorization === "limited" ? (
                <button type="button" className="font-semibold text-[var(--flag)]" onClick={() => void refreshLimitedAccess()}>
                  Manage Access
                </button>
              ) : null}
            </div>
            {total > 1 ? (
              <div className="px-4 pb-2">
                <input
                  type="range"
                  min={0}
                  max={total - 1}
                  step={1}
                  value={Math.min(scrubIndex, total - 1)}
                  aria-label="Photo timeline"
                  aria-valuetext={`Photo ${Math.min(scrubIndex + 1, total)} of ${total}`}
                  onChange={(event) => handleScrubberChange(Number(event.currentTarget.value))}
                  disabled={sessionPhase !== "ready" || loadingPage}
                  className="block h-1.5 w-full cursor-pointer accent-[var(--flag)] disabled:cursor-wait disabled:opacity-60"
                />
                <div className="mt-0.5 flex justify-between text-[9px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
                  <span>Newest</span>
                  <span>{loadingPage ? "Loading…" : "Oldest"}</span>
                </div>
              </div>
            ) : null}
            <div
              ref={deckRef}
              data-photo-roulette-deck
              onScroll={handleScroll}
              className="flex h-[calc(29vw+0.5rem)] max-h-[8.5rem] shrink-0 snap-x snap-mandatory items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-[35.5%] touch-pan-x"
            >
              {assets.map((asset, index) => {
                const thumbnail = thumbnails[asset.id];
                const queued = queuedAssetIds.has(asset.id);
                const active = index === activeLocalIndex;
                const preparingThisPhoto = prepareState.type !== "idle"
                  && prepareState.type !== "error"
                  && prepareState.assetId === asset.id;
                return (
                  <button
                    type="button"
                    key={asset.id}
                    data-photo-roulette-card
                    data-asset-id={asset.id}
                    aria-label={`Use photo ${windowOffset + index + 1} of ${total}, captured ${formatCaptureDate(asset.capturedAt)}`}
                    aria-pressed={active}
                    disabled={sessionPhase !== "ready" || isPreparing}
                    onClick={() => handlePhotoTap(asset, index)}
                    className={`relative aspect-square w-[29vw] min-w-[29vw] shrink-0 snap-center overflow-hidden rounded-lg bg-[var(--bg-card)] transition disabled:cursor-wait ${
                      active
                        ? "ring-2 ring-[var(--flag)] ring-offset-2 ring-offset-[var(--bg-paper)]"
                        : "opacity-75"
                    }`}
                  >
                    {thumbnail?.data ? (
                      <img src={thumbnail.data} alt="" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[var(--ink-3)]">
                        {thumbnail === undefined ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-5 w-5" />}
                      </span>
                    )}
                    {queued ? (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--bg-card)] p-1 text-[var(--green)] shadow">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                    {preparingThisPhoto ? (
                      <span className="absolute inset-0 grid place-items-center bg-black/35 text-white">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="min-h-11 px-4 pt-2">
              <p className="truncate text-xs font-medium text-[var(--ink-2)]">{formatCaptureDate(activeAsset?.capturedAt ?? null)}</p>
              <p className="flex items-center gap-1 truncate text-[11px] text-[var(--ink-3)]">
                <MapPin className="h-3 w-3 shrink-0" />
                {activeLocationState === undefined
                  ? "Finding trail match…"
                  : activeLocation?.source === "photo"
                    ? "Photo GPS · tap a photo to use it"
                    : activeLocation?.source === "trail" && activeLocation.deltaMs !== undefined
                      ? `Trail match · ${formatDelta(activeLocation.deltaMs)} · tap to use`
                      : "Location unavailable · tap to place manually"}
              </p>
            </div>
          </>
        )}

        {prepareState.type === "downloading" ? (
          <div className="mx-4 mb-2 flex items-center gap-3 text-xs text-[var(--ink-3)]">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--meter-track)]">
              <div className="h-full bg-[var(--flag)]" style={{ width: `${Math.round(prepareState.progress * 100)}%` }} />
            </div>
            <span>{Math.round(prepareState.progress * 100)}%</span>
            <button type="button" className="font-semibold" onClick={() => void cancelDownload()}>Cancel</button>
          </div>
        ) : null}
        {error || preparationError ? (
          <p role="alert" className="mx-4 mb-2 text-xs text-[var(--ink-danger)]">{preparationError ?? error}</p>
        ) : null}
      </SheetContent>
      <ConfirmModal
        open={downloadAsset !== undefined}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && prepareState.type === "requiresDownload") {
            setPrepareState({ type: "idle" });
          }
        }}
        title="Download this photo from iCloud?"
        description="The full photo is stored in iCloud. Downloading it may use cellular data. Nothing is uploaded until you save the Story."
        confirmLabel="Download & use"
        cancelLabel="Cancel"
        closeOnConfirm={false}
        onConfirm={() => {
          if (downloadAsset) void preparePhoto(downloadAsset, true);
        }}
      />
    </Sheet>
  );
}
