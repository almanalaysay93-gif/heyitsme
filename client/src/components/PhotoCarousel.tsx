import type { PortfolioItem } from "@/lib/card";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface PhotoCarouselProps {
  items: PortfolioItem[];
  onSelectPhoto: (index: number) => void;
}

export function PhotoCarousel({ items, onSelectPhoto }: PhotoCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: items.length > 1,
    align: "start",
    skipSnaps: false,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback(
    (index: number) => {
      if (emblaApi) emblaApi.scrollTo(index);
    },
    [emblaApi]
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (!items.length) return null;

  return (
    <div className="photo-carousel-wrap">
      <div
        className="photo-carousel-viewport"
        ref={emblaRef}
        tabIndex={0}
        role="region"
        aria-label="Photo carousel"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") scrollPrev();
          if (e.key === "ArrowRight") scrollNext();
        }}
      >
        <div className="photo-carousel-container">
          {items.map((item, index) => (
            <div
              className="photo-carousel-slide"
              key={item.id || index}
              onClick={() => onSelectPhoto(index)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectPhoto(index);
                }
              }}
              aria-label={item.description ? `View photo: ${item.description.slice(0, 50)}` : `View photo ${index + 1}`}
            >
              <div className="photo-carousel-card">
                <img
                  src={item.url}
                  alt={item.description || "Photo"}
                  loading="lazy"
                  className="photo-carousel-img"
                />
                {item.description ? (
                  <div className="photo-carousel-card-overlay">
                    <div className="photo-carousel-card-text">
                      <p className="photo-carousel-desc">{item.description}</p>
                    </div>
                    <span className="photo-carousel-expand-btn" aria-hidden="true">
                      <Maximize2 size={16} />
                    </span>
                  </div>
                ) : (
                  <div className="photo-carousel-card-overlay photo-carousel-card-overlay-minimal">
                    <span className="photo-carousel-expand-btn photo-carousel-expand-btn-lone" aria-hidden="true">
                      <Maximize2 size={16} />
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {items.length > 1 && (
        <div className="photo-carousel-controls">
          <div className="photo-carousel-dots" role="tablist" aria-label="Slide indicators">
            {scrollSnaps.map((_, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === selectedIndex}
                aria-label={`Go to slide ${index + 1}`}
                className={`photo-carousel-dot ${index === selectedIndex ? "is-active" : ""}`}
                onClick={() => scrollTo(index)}
              />
            ))}
          </div>

          <div className="photo-carousel-arrows">
            <button
              type="button"
              className="photo-carousel-arrow"
              onClick={scrollPrev}
              disabled={!canScrollPrev && !emblaApi?.canScrollPrev()}
              aria-label="Previous slide"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="photo-carousel-arrow"
              onClick={scrollNext}
              disabled={!canScrollNext && !emblaApi?.canScrollNext()}
              aria-label="Next slide"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
