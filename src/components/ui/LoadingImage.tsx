import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ImageOff } from "lucide-react";
import { cn } from "../../lib/utils";

interface LoadingImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  aspectRatio?: string; // e.g., "4/3", "16/9", "square"
  containerClassName?: string;
}

export function LoadingImage({
  src,
  alt,
  aspectRatio = "4/3",
  className,
  containerClassName,
  onLoad,
  onError,
  ...props
}: LoadingImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setStatus("loaded");
    onLoad?.(e);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setStatus("error");
    onError?.(e);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--bg-paper-2)]",
        containerClassName
      )}
      style={{ aspectRatio }}
    >
      <AnimatePresence>
        {status === "loading" && (
          <motion.div
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
          "h-full w-full object-cover",
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
