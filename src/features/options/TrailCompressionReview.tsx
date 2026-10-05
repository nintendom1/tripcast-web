import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useConvex, useQuery } from "convex/react";
import { MapPinMinus } from "lucide-react";
import { tripcastApi, type ReplayRouteManifest, type ReplayRoutePreview, type ReplayRoutePreviewPoint } from "../../convex/tripcastApi";
import { Sheet, SheetBody, SheetContent, SheetTitle, SheetCloseButton } from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { FeatureBoundary } from "../../components/resilience/FeatureBoundary";
import { preparationStore, readPreparationInventory } from "../journal/replayImagePreparation";
import ReplayImagePreparationSheet from "./ReplayImagePreparationSheet";
import TrailCompressionMap from "./TrailCompressionMap";

type PreviewState = { points: ReplayRoutePreviewPoint[]; done: boolean; loading: boolean; stopping: boolean; started: boolean; error: string | null };
export type TrailCompressionViewProps = PreviewState & {
  hidden?: boolean; open: boolean; onOpenChange: (open: boolean) => void; stale: boolean; ended?: boolean;
  imageStatus: string; onImages: () => void; onLoad: (all: boolean) => void; onStop: () => void; onReload: () => void;
  onCompress: () => void; busy: boolean; ready: boolean; children?: ReactNode;
};
export function TrailCompressionView(props: TrailCompressionViewProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const kept = props.points.filter(p => p.kept).length;
  return <Sheet open={props.open} onOpenChange={props.onOpenChange}>
    <SheetContent side="bottom" className={`h-dvh max-h-dvh rounded-none ${props.hidden ? "invisible pointer-events-none" : ""}`} data-trail-compression-review>
      <div className="flex items-center justify-between gap-3 px-4 pt-4"><SheetTitle className="flex items-center gap-2"><MapPinMinus aria-hidden="true" />Compress trail</SheetTitle><SheetCloseButton /></div>
      <SheetBody className="space-y-4 pb-8">
        <p>Compare the original GPS with the proposed compact replay route. No original points are deleted. Compression runs on Convex in small batches.</p>
        <div className="flex flex-wrap items-center gap-2"><p>{props.imageStatus} Images can be prepared separately.</p><Button variant="outline" onClick={props.onImages}>Prepare images</Button></div>
        {props.ended === undefined ? <p role="status">Loading trip status…</p> : !props.ended ? <p>Complete the trip before previewing or compressing its trail.</p> : null}
        {props.stale ? <p role="alert">The route changed. Reload preview before compressing.</p> : null}
        {props.error ? <p role="alert">{props.error}</p> : null}
        <p role="status">{props.points.length.toLocaleString()} loaded · {kept.toLocaleString()} Kept · {(props.points.length - kept).toLocaleString()} Omitted from replay. {props.done ? (props.points.length ? "Entire trip displayed." : "This trip has no GPS points.") : "Partial view — whole-trip totals are not yet known."}{props.loading ? " Loading…" : ""}</p>
        <TrailCompressionMap points={props.stale ? [] : props.points} />
        <div className="flex flex-wrap gap-3">
          {props.stale ? <Button onClick={props.onReload} disabled={props.loading}>Reload preview</Button> : <>
            <Button variant="outline" disabled={props.loading || props.done || !props.ended} onClick={() => props.onLoad(false)}>{props.error ? "Retry next batch" : "Load next batch"}</Button>
            <Button variant="outline" disabled={props.loading || props.done || !props.ended} onClick={() => props.onLoad(true)}>Show entire trip (uses more memory)</Button>
          </>}
          {props.loading ? <Button variant="outline" disabled={props.stopping} onClick={props.onStop}>{props.stopping ? "Stopping after current request…" : "Stop loading"}</Button> : null}
        </div>
        {!props.ready ? <section className="space-y-3 border-t pt-4">
          {!props.done ? <p>Only part of the trip is displayed. Compression will process the entire trip.</p> : null}
          <label className="flex gap-2"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I understand compression processes the entire trip and preserves original GPS.</label>
          <Button disabled={!acknowledged || !props.started || !props.ended || props.stale || props.busy || props.loading} onClick={props.onCompress}>{props.busy ? "Starting compression…" : "Compress entire trip"}</Button>
        </section> : null}
        {props.children}
      </SheetBody>
    </SheetContent>
  </Sheet>;
}
const emptyPreview: PreviewState = { points: [], done: false, loading: false, stopping: false, started: false, error: null };
function ReviewBody({ token, onOpenChange }: { token: string; onOpenChange: (open: boolean) => void }) {
  const client = useConvex();
  const manifest = useQuery(tripcastApi.replayRoutes.manifest, { token });
  const metrics = useQuery(tripcastApi.replayRoutes.metrics, manifest?.ready ? { token } : "skip");
  const [preview, setPreview] = useState(emptyPreview);
  const [snapshot, setSnapshot] = useState<Pick<ReplayRouteManifest, "sourceRevision" | "compressionVersion"> | null>(null);
  const cursor = useRef<Pick<ReplayRoutePreview, "day" | "cursor">>({ day: null, cursor: null });
  const worker = useRef({ epoch: 0, running: false, stop: false });
  const latest = useRef(manifest);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [imageStatus, setImageStatus] = useState("Loading image status…");
  const progress = useSyncExternalStore(preparationStore.subscribe, preparationStore.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [requested, setRequested] = useState(false);
  const [reviewedRevision, setReviewedRevision] = useState<string | null>(null);
  const stale = !!snapshot && !!manifest && (!manifest.ended || snapshot.sourceRevision !== manifest.sourceRevision || snapshot.compressionVersion !== manifest.compressionVersion);
  useEffect(() => { latest.current = manifest; }, [manifest]);
  useEffect(() => () => { worker.current.epoch++; worker.current.stop = true; worker.current.running = false; initial.current = false; }, []);
  useEffect(() => {
    let cancelled = false;
    void readPreparationInventory(client, token).then(items => {
      if (!cancelled) setImageStatus(`${items.filter(p => p.status === "ready").length}/${items.length} images ready · ${items.filter(p => p.status === "failed").length} failed.`);
    }).catch(() => { if (!cancelled) setImageStatus("Image status unavailable."); });
    return () => { cancelled = true; };
  }, [client, token, progress.running, imagesOpen]);
  const load = useCallback(async (all: boolean, reset = false) => {
    const source = latest.current;
    if (!source?.ended || worker.current.running) return;
    const identity = reset ? source : snapshot ?? source;
    if (identity.sourceRevision !== source.sourceRevision || identity.compressionVersion !== source.compressionVersion) return;
    const epoch = worker.current.epoch;
    worker.current.running = true; worker.current.stop = false;
    if (reset) cursor.current = { day: null, cursor: null };
    setSnapshot({ sourceRevision: identity.sourceRevision, compressionVersion: identity.compressionVersion });
    setPreview(p => ({ ...(reset ? emptyPreview : p), loading: true, stopping: false, error: null }));
    try {
      let pages = 0;
      do {
        const result = await client.query(tripcastApi.replayRoutes.preview, { token, sourceRevision: identity.sourceRevision, compressionVersion: identity.compressionVersion, ...cursor.current });
        if (worker.current.epoch !== epoch) return;
        if (latest.current?.sourceRevision !== identity.sourceRevision || !latest.current?.ended) break;
        cursor.current = { day: result.day, cursor: result.cursor };
        setPreview(p => ({ ...p, points: [...p.points, ...result.points], done: result.done, started: true }));
        pages++;
        if (result.done || worker.current.stop || (!all && pages >= 8)) break;
      } while (true);
    } catch (reason) { if (worker.current.epoch === epoch) setPreview(p => ({ ...p, error: String(reason) })); }
    finally {
      if (worker.current.epoch === epoch) { worker.current.running = false; setPreview(p => ({ ...p, loading: false, stopping: false })); }
    }
  }, [client, token, snapshot]);
  const initial = useRef(false);
  useEffect(() => { if (manifest?.ended && !initial.current) { initial.current = true; void load(false); } }, [manifest?.ended, load]);
  async function compress() {
    if (!snapshot) return;
    setBusy(true);
    try { await client.mutation(tripcastApi.replayRoutes.prepare, { token, ...snapshot }); setRequested(true); }
    catch (reason) { setPreview(p => ({ ...p, error: String(reason) })); }
    finally { setBusy(false); }
  }
  async function enable(enabled: boolean) {
    setDeliveryMessage("");
    setBusy(true);
    try { await client.mutation(tripcastApi.replayRoutes.enable, { token, enabled }); setDeliveryMessage("Trail quality saved for everyone."); }
    catch (reason) { setPreview(p => ({ ...p, error: String(reason) })); }
    finally { setBusy(false); }
  }
  return <>
    <TrailCompressionView {...preview} open hidden={imagesOpen} onOpenChange={onOpenChange} stale={stale} ended={manifest?.ended} imageStatus={imageStatus} onImages={() => setImagesOpen(true)} onLoad={all => { void load(all); }} onStop={() => { worker.current.stop = true; setPreview(p => ({ ...p, stopping: true })); }} onReload={() => { void load(false, true); }} onCompress={() => { void compress(); }} busy={busy} ready={!!manifest?.ready}>
      <section className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">Trail viewing quality</h3>
        <p>Applies to you and all Followers. {manifest?.originalOnly ? "Original trail selected for everyone." : manifest?.enabled ? "Compact trail selected for everyone." : manifest?.ready ? "Traveler preview: compact. Followers: original until enabled." : "Original trail is in use while no compact route is ready."}</p>
        <p>Original trail uses all recorded GPS points. It may load more slowly and use more data. The compact copy is retained. Switching does not delete GPS or start or stop preparation.</p>
        <p>Active replay pauses when trail quality changes. Continue resumes from the saved trip time. Requests already in flight may finish.</p>
        <Button disabled={busy || !manifest || manifest.originalOnly} onClick={() => { void enable(false); }}>{busy ? "Saving…" : "Use original trail"}</Button>
        {deliveryMessage ? <p role="status">{deliveryMessage}</p> : null}
      </section>
      {requested && !manifest?.ready ? <p role="status">Compression requested. Convex continues processing when this view closes. If interrupted, use Compress entire trip to resume.</p> : null}
      {metrics ? <p>{metrics.rawPoints} raw points → {metrics.retainedPoints} replay points in {metrics.chunks} chunks. Coordinate payload: {(metrics.payloadBytes / 1_000_000).toFixed(2)} MB (database overhead and Stories excluded). Mystery projection: {metrics.mysteryReady ? "Ready" : "Not ready"}. Checkpoint pins: {metrics.checkpointPinsReady ? "Ready" : "Not ready"}.</p> : null}
      {manifest?.ready ? <section className="space-y-3 border-t pt-4"><p>Compact route ready. Review Follow route as Traveler before enabling it for Followers.</p><label className="flex gap-2"><input type="checkbox" checked={reviewedRevision === manifest.sourceRevision} onChange={e => setReviewedRevision(e.target.checked ? manifest.sourceRevision : null)} />I verified turns, Story coverage, timing, resume and privacy.</label><Button disabled={busy || manifest.enabled || reviewedRevision !== manifest.sourceRevision} onClick={() => { void enable(true); }}>{manifest.enabled ? "Compact trail enabled" : "Use compact trail for everyone"}</Button></section> : null}
      <ReplayImagePreparationSheet token={token} open={imagesOpen} onOpenChange={setImagesOpen} />
    </TrailCompressionView>
  </>;
}
export default function TrailCompressionReview(props: { token: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <FeatureBoundary title="Trail compression unavailable" resetKeys={[props.token, props.open]}>{props.open ? <ReviewBody key={props.token} token={props.token} onOpenChange={props.onOpenChange} /> : null}</FeatureBoundary>;
}
