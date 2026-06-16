import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ImageOff } from "lucide-react";
import { cn } from "../../lib/utils";

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

  // Reset status when the source changes
  useEffect(() => {
    setInternalStatus(src ? "loading" : "error");
  }, [src]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setInternalStatus("loaded");
    onLoad?.(e);
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
