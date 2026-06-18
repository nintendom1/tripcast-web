import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ImageOff } from "lucide-react";
import { cn } from "../../lib/utils";

// Local-dev image-load debug simulation. Both knobs default to 0 (no-op) and
// only affect the dev server — images normally load instantly from disk/cache,
// so the spinner, fade-in, and error states flash by too fast to inspect.
// Set in `.env.local`; see docs/loading-image-debug.md.
const SIM_LOAD_SLOW_MS = Number(import.meta.env.VITE_IMAGE_LOAD_SLOW_MS ?? 0);
const SIM_LOAD_FAIL_RATE = Number(import.meta.env.VITE_IMAGE_LOAD_FAIL_RATE ?? 0);
if (import.meta.env.DEV && (SIM_LOAD_SLOW_MS || SIM_LOAD_FAIL_RATE)) {
  // eslint-disable-next-line no-console
  console.info(`[LoadingImage SIM] slow=${SIM_LOAD_SLOW_MS}ms fail=${SIM_LOAD_FAIL_RATE}`);
}

interface LoadingImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"> {
  /** CSS aspect ratio (e.g. "4/3", "1/1", "16/9"). Used for the placeholder
   *  container before the image loads. */
  aspectRatio?: React.CSSProperties["aspectRatio"];
  /** Real image width in pixels, used to calculate dynamic aspect ratio. */
  imageWidth?: number;
  /** Real image height in pixels, used to calculate dynamic aspect ratio. */
  imageHeight?: number;
  containerClassName?: string;
  /** Optional override for the internal loading status. Useful for Storybook/Testing. */
  status?: "loading" | "loaded" | "error";
}

/**
 * An image component that preserves layout using an aspect-ratio container,
 * shows a loading spinner while downloading, and handles error states.
 */
export function LoadingImage({
  src,
  alt,
  aspectRatio: manualAspectRatio,
  imageWidth,
  imageHeight,
  className,
  containerClassName,
  onLoad,
  onError,
  status: statusOverride,
  ...props
}: LoadingImageProps) {
  const [internalStatus, setInternalStatus] = useState<"loading" | "loaded" | "error">("loading");
  const status = statusOverride ?? internalStatus;
  // Holds the simulated-delay timer so it can be cancelled if src changes or
  // the component unmounts before it fires. No-op unless SIM_LOAD_SLOW_MS is set.
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset status when the source changes; clear any pending sim-delay timer.
  useEffect(() => {
    setInternalStatus(src ? "loading" : "error");
    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, [src]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    // Debug: randomly force the error state so it can be inspected without a
    // broken URL. No-op unless VITE_IMAGE_LOAD_FAIL_RATE is set.
    if (SIM_LOAD_FAIL_RATE > 0 && Math.random() < SIM_LOAD_FAIL_RATE) {
      setInternalStatus("error");
      onError?.(e);
      return;
    }

    const img = e.currentTarget;

    // Fire onLoad now while the event is live (consumers read e.currentTarget),
    // and defer only the visual "loaded" status (the fade-in).
    onLoad?.(e);

    const finalize = () => {
      setInternalStatus("loaded");
    };

    // Debug: hold the spinner so the loading → fade-in transition is visible.
    if (SIM_LOAD_SLOW_MS > 0) {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      delayTimerRef.current = setTimeout(finalize, SIM_LOAD_SLOW_MS);
      return;
    }

    // Use the decode() API if available to ensure the image is ready to paint
    // without blocking the main thread. This prevents "right before it appears"
    // UI freezes on large photos.
    if (typeof img.decode === "function") {
      img
        .decode()
        .catch(() => {
          /* ignore decode errors, fallback to immediate show */
        })
        .finally(finalize);
    } else {
      finalize();
    }
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setInternalStatus("error");
    onError?.(e);
  };

  // Precedence: manual prop > calculated from dimensions > fallback 4:3
  const effectiveAspectRatio =
    manualAspectRatio ??
    (imageWidth && imageHeight ? `${imageWidth}/${imageHeight}` : "4/3");

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--bg-paper-2)]",
        containerClassName
      )}
      style={{ aspectRatio: effectiveAspectRatio }}
    >
      <AnimatePresence>
        {status === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Loader2 className="h-6 w-6 animate-spin text-[var(--ink-3)]" />
          </motion.div>
        )}
        {status === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--ink-3)]"
          >
            <ImageOff className="h-6 w-6" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Failed to load</span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.img
        src={src}
        alt={alt}
        decoding="async"
        className={cn(
          "h-full w-full",
          status === "loaded" ? "opacity-100" : "opacity-0",
          className
        )}
        initial={false}
        animate={{ opacity: status === "loaded" ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    </div>
  );
}
