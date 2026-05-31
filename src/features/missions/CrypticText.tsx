import { useEffect, useMemo, useState } from "react";

type Props = {
  text: string;
  className?: string;
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const onChange = () => setReduced(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}

function distort(text: string, tick: number) {
  return text
    .split("")
    .map((char, index) => {
      if (!/[a-z]/i.test(char)) return char;
      return (index + tick) % 3 === 0 ? char.toUpperCase() : char.toLowerCase();
    })
    .join("");
}

export default function CrypticText({ text, className }: Props) {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const interval = window.setInterval(() => setTick((value) => value + 1), 420);
    return () => window.clearInterval(interval);
  }, [reduced]);

  const visualText = useMemo(
    () => (reduced ? text : distort(text, tick)),
    [reduced, text, tick],
  );

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{visualText}</span>
    </span>
  );
}
