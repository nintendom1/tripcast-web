export function PendingTrailPreview({ theme }: { theme: "meadow" | "constellation" }) {
  const pending = theme === "constellation" ? "#7dd3fc" : "#2563a6";
  const casing = theme === "constellation" ? "#0b1f3a" : "#ffffff";
  const background = theme === "constellation" ? "#081525" : "#dcebdc";
  return (
    <div className="rounded-xl p-4" style={{ background }} aria-label={`${theme} pending trail preview`}>
      <svg viewBox="0 0 320 140" className="w-full" role="img" aria-label="Dashed transmitted trail followed by dotted pending breadcrumbs">
        <path d="M20 105 C70 90 85 55 135 67" fill="none" stroke={casing} strokeWidth="6" strokeDasharray="6 6" />
        <path d="M20 105 C70 90 85 55 135 67" fill="none" stroke={theme === "constellation" ? "#ffd86a" : "#444444"} strokeWidth="3" strokeDasharray="6 6" />
        <path d="M135 67 C180 75 205 30 300 42" fill="none" stroke={casing} strokeWidth="6" strokeDasharray="1 3" strokeLinecap="round" />
        <path d="M135 67 C180 75 205 30 300 42" fill="none" stroke={pending} strokeWidth="3" strokeDasharray="1 3" strokeLinecap="round" />
        {[175, 225, 280].map((x, index) => <circle key={x} cx={x} cy={[64, 42, 40][index]} r="5" fill={casing} stroke={pending} strokeWidth="2" />)}
      </svg>
    </div>
  );
}
