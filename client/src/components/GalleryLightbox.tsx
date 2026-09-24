import type { PortfolioItem } from "@/lib/card";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect } from "react";

interface GalleryLightboxProps {
  items: PortfolioItem[];
  currentIndex: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function GalleryLightbox({
  items,
  currentIndex,
  onClose,
  onNavigate,
}: GalleryLightboxProps) {
  const isOpen = currentIndex !== null && currentIndex >= 0 && currentIndex < items.length;
  const currentItem = isOpen ? items[currentIndex] : null;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        onNavigate((currentIndex - 1 + items.length) % items.length);
      } else if (e.key === "ArrowRight") {
        onNavigate((currentIndex + 1) % items.length);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, currentIndex, items.length, onClose, onNavigate]);

  return (
    <AnimatePresence>
      {isOpen && currentItem && (
        <motion.div
          className="gallery-lightbox-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label={currentItem.description ? currentItem.description.slice(0, 50) : "Photo detail"}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="gallery-lightbox-topbar">
            <span className="gallery-lightbox-counter">
              {currentIndex + 1} / {items.length}
            </span>
            <button
              type="button"
              className="gallery-lightbox-btn gallery-lightbox-close"
              onClick={onClose}
              aria-label="Close photo gallery"
            >
              <X size={20} />
            </button>
          </div>

          <div className="gallery-lightbox-main">
            {items.length > 1 && (
              <button
                type="button"
                className="gallery-lightbox-nav prev"
                onClick={() => onNavigate((currentIndex - 1 + items.length) % items.length)}
                aria-label="Previous image"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            <div className="gallery-lightbox-content">
              <div className="gallery-lightbox-image-wrap">
                <img
                  src={currentItem.url}
                  alt={currentItem.description || "Gallery image"}
                  className="gallery-lightbox-image"
                />
              </div>

              {currentItem.description && (
                <motion.div
                  className="gallery-lightbox-caption"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={currentItem.id || currentIndex}
                >
                  <p className="gallery-lightbox-desc">{currentItem.description}</p>
                </motion.div>
              )}
            </div>

            {items.length > 1 && (
              <button
                type="button"
                className="gallery-lightbox-nav next"
                onClick={() => onNavigate((currentIndex + 1) % items.length)}
                aria-label="Next image"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
