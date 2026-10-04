import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useConvex, useQuery } from "convex/react";
import { tripcastApi, type ReplayImageInventoryItem } from "../../convex/tripcastApi";
import { Sheet, SheetBody, SheetContent, SheetTitle, SheetCloseButton } from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { FeatureBoundary } from "../../components/resilience/FeatureBoundary";
import { preparationStore, prepareReplayImages, readPreparationInventory, type PreparationState } from "../journal/replayImagePreparation";

export type PreparationViewProps = {
  open: boolean; onOpenChange: (open: boolean) => void; items: ReplayImageInventoryItem[];
  children?: ReactNode;
  progress: PreparationState; loading?: boolean; previewUrl?: string | null;
  onPreview: () => void; onPrepare: () => void; onStop: () => void;
};
export function ReplayImagePreparationView({ open, onOpenChange, items, progress, loading, previewUrl, onPreview, onPrepare, onStop, children }: PreparationViewProps) {
  const [reviewed, setReviewed] = useState(false);
  const ready = items.filter(item => item.status === "ready").length;
  const failed = items.filter(item => item.status === "failed").length;
  const pendingBytes = items.filter(item => item.status !== "ready").reduce((sum, item) => sum + item.bytes, 0);
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-lg">
      <div className="flex items-center justify-between gap-3 px-4 pt-4"><SheetTitle>Prepare replay images</SheetTitle><SheetCloseButton /></div>
      <SheetBody className="space-y-4">
        <p>Runs in this browser while the app stays open. Originals are preserved. Interrupted work can resume; an interrupted image may download again.</p>
        <p>{loading ? "Loading photo inventory…" : `${items.length} unique Story photos · ${ready} Ready · ${items.length - ready - failed} Pending · ${failed} Failed`}</p>
        <p>Estimated remaining original downloads: {(pendingBytes / 1_000_000).toFixed(1)} MB. Prepared previews: {(items.reduce((sum, item) => sum + item.previewBytes, 0) / 1_000_000).toFixed(2)} MB.</p>
        {previewUrl ? <img src={previewUrl} alt="Prepared replay preview for quality review" className="max-h-72 w-full object-contain" /> : null}
        <p>Review faces, scenery, night photos, fine detail and orientation before bulk preparation. Animated photos use a static preview.</p>
        <label className="flex gap-2"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I have reviewed representative previews.</label>
        {progress.error ? <p role="alert">{progress.error}</p> : null}
        {progress.running ? <><p role="status">Processed {progress.completed} of {progress.total}</p><Button type="button" disabled={progress.stopping} onClick={onStop}>{progress.stopping ? "Stopping after current image…" : "Stop after current image"}</Button></> : <div className="flex flex-wrap gap-4">
          <Button type="button" disabled={loading || ready === items.length} onClick={onPreview}>Prepare one preview</Button>
          <Button type="button" disabled={loading || !reviewed || ready === items.length} onClick={onPrepare}>Prepare remaining images</Button>
        </div>}
        {children}
      </SheetBody>
    </SheetContent>
  </Sheet>;
}
function PreparationBody({ open, token, onOpenChange }: { open: boolean; token: string; onOpenChange: (open: boolean) => void }) {
  const client = useConvex();
  const progress = useSyncExternalStore(preparationStore.subscribe, preparationStore.getSnapshot);
  const [items, setItems] = useState<ReplayImageInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!open || progress.running) return;
    let cancelled = false;
    void readPreparationInventory(client, token).then(value => { if (!cancelled) { setItems(value); setLoading(false); } }).catch(reason => { if (!cancelled) { setError(String(reason)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [client, token, open, progress.running]);
  const remaining = items.filter(item => item.status !== "ready").map(item => item.source);
  return <ReplayImagePreparationView open={open} onOpenChange={onOpenChange} items={items} loading={loading} progress={{ ...progress, error: error ?? progress.error }} previewUrl={previewUrl}
    onStop={preparationStore.stop}
    onPrepare={() => { void prepareReplayImages(client, token, remaining); }}
    onPreview={() => { const source = remaining[0]; if (source) void prepareReplayImages(client, token, [source]).then(async () => setPreviewUrl(await client.query(tripcastApi.replayImages.getUrl, { token, imageId: source }))).catch(reason => setError(String(reason))); }}>
    <RoutePreparationControls token={token} open={open} imagesReady={!loading && remaining.length === 0} />
  </ReplayImagePreparationView>;
}
export default function ReplayImagePreparationSheet(props: { open: boolean; token: string; onOpenChange: (open: boolean) => void }) {
  return <FeatureBoundary title="Replay preparation unavailable" resetKeys={[props.token, props.open]}>{props.open ? <PreparationBody {...props} /> : null}</FeatureBoundary>;
}

function RoutePreparationControls({ token, open, imagesReady }: { token: string; open: boolean; imagesReady: boolean }) {
  const client = useConvex();
  const manifest = useQuery(tripcastApi.replayRoutes.manifest, open ? { token } : "skip");
  const metrics = useQuery(tripcastApi.replayRoutes.metrics, open && manifest?.ready ? { token } : "skip");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(enable: boolean) {
    setBusy(true); setError(null);
    try {
      if (enable) await client.mutation(tripcastApi.replayRoutes.enable, { token, enabled: !manifest?.enabled });
      else await client.mutation(tripcastApi.replayRoutes.prepare, { token });
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t pt-4">
    <h3>Completed-trip route</h3>
    <p>Preparation runs on Convex in small batches and preserves raw GPS. Review Follow route as the Traveler before enabling it for Followers.</p>
    {metrics ? <p>{metrics.rawPoints} raw points → {metrics.retainedPoints} replay points in {metrics.chunks} chunks. Coordinate payload: {(metrics.payloadBytes / 1_000_000).toFixed(2)} MB per fresh replay (database overhead and Stories excluded). Mystery projection: {metrics.mysteryReady ? "Ready" : "Not ready"}. Checkpoint pins: {metrics.checkpointPinsReady ? "Ready" : "Not ready"}.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {!manifest?.ready ? <Button type="button" disabled={busy || !manifest?.ended || !imagesReady} onClick={() => { void run(false); }}>{manifest?.revision ? "Resume route preparation" : "Prepare compact route"}</Button> : <>
      <label className="flex gap-2"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I verified turns, Story coverage, timing, resume and privacy.</label>
      <Button type="button" disabled={busy || (!manifest.enabled && (!reviewed || !imagesReady))} onClick={() => { void run(true); }}>{manifest.enabled ? "Disable compact route for Followers" : "Enable validated compact route"}</Button>
    </>}
  </section>;
}
