import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { tripcastApi } from "../../convex/tripcastApi";
import { Button } from "../../components/ui/button";
export function PhotoQualityView({ original, busy, message, error, onChange }: { original?: boolean; busy?: boolean; message?: string; error?: string; onChange: () => void }) {
  return <section className="space-y-3 border-b pb-4">
    <h3 className="font-semibold">Photo viewing quality</h3>
    <p>Applies to you and all Followers. Current choice: {original === undefined ? "Loading…" : original ? "Original photos" : "Smaller photos"}.</p>
    <p>Original photos automatically download in replay and Stories. They may be several megabytes each, using more viewer bandwidth and Convex file transfer. Prepared copies are retained.</p>
    <p>Smaller photos use prepared previews with less detail; animations use a static frame. Stories load the original if a preview is unavailable; replay shows a placeholder. View original photo remains available in Stories.</p>
    <p>Switching does not delete photos or start or stop preparation. Downloads already in flight may finish; data already transferred cannot be recovered.</p>
    <Button disabled={busy || original === undefined} onClick={onChange}>{busy ? "Saving…" : original ? "Use smaller photos" : "Use original photos"}</Button>
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error} Retry using the button above.</p> : null}
  </section>;
}
export default function PhotoQualityControl({ token }: { token: string }) {
  const preference = useQuery(tripcastApi.replayImages.preference, { token });
  const save = useMutation(tripcastApi.replayImages.setPreference);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  async function change() {
    if (!preference || busy) return;
    setBusy(true); setError(undefined); setMessage(undefined);
    try { await save({ token, original: !preference.original }); setMessage("Photo quality saved for everyone."); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  return <PhotoQualityView original={preference?.original} busy={busy} error={error} message={message} onChange={() => { void change(); }} />;
}
