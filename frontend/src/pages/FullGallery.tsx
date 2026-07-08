import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { resolveImageUrl } from '@/lib/utils';
import { get } from '@/api/api';
import { Button } from '@/components/ui/button';

type LayoutItem = { id: string; x: number; y: number; w: number; h: number; z?: number };
const DESIGN_WIDTH_FALLBACK = 1200;
const DESIGN_HEIGHT_FALLBACK = 800;

type SlideConfig = { image_ids: string[]; interval_ms: number; transition_ms: number; aspect_ratio: string };


interface GalleryImage {
    _id: string;
    src: string;
    title: string;
    category: string;
  // Optional long description support if present on backend later
  description?: string;
}

const fetchGalleryImages = () => get<GalleryImage[]>('/gallery/');

// Match the static layout manager's size rhythm
const SIZE_PATTERN: Array<'lg' | 'md' | 'sm'> = ['lg', 'sm', 'sm', 'md', 'sm', 'lg', 'sm', 'md'];
const sizeClass = (size: 'lg' | 'md' | 'sm') => {
  // Use column and row spans for a dynamic, professional masonry layout.
  // This preserves visual variety while ensuring images have proper, non-distorted proportions.
  if (size === 'lg') return 'col-span-2 row-span-2';
  if (size === 'md') return 'row-span-2';
  return 'col-span-1 row-span-1';
};

const LotusSvg = ({ className }: { className?: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      aria-hidden="true"
      className={className}
    >
      {/* Center circle (Brightest Red - red-400) */}
      <circle cx="100" cy="100" r="10" fill="currentColor" />

      {/* Inner petals (Brighter Red - red-500/600) */}
      <g id="inner" fill="currentColor" stroke="currentColor" strokeWidth="1" transform="translate(100,100)">
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(0)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(30)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(60)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(90)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(120)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(150)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(180)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(210)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(240)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(270)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(300)" />
        <path d="M0,-15 C5,-25, 15,-25, 0,-35 C-15,-25, -5,-25, 0,-15 Z" transform="rotate(330)" />
      </g>

      {/* Middle petals (Medium Red - red-600/700) */}
      <g id="middle" fill="currentColor" stroke="currentColor" strokeWidth="1.5" transform="translate(100,100)">
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(15)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(45)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(75)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(105)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(135)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(165)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(195)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(225)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(255)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(285)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(315)" />
        <path d="M0,-25 C10,-40, 25,-40, 0,-60 C-25,-40, -10,-40, 0,-25 Z" transform="rotate(345)" />
      </g>

      {/* Outer petals (Darkest Red - red-800/900) */}
      <g id="outer" fill="currentColor" stroke="currentColor" strokeWidth="2" transform="translate(100,100)">
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(0)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(30)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(60)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(90)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(120)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(150)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(180)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(210)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(240)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(270)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(300)" />
        <path d="M0,-40 C15,-60, 40,-60, 0,-90 C-40,-60, -15,-60, 0,-40 Z" transform="rotate(330)" />
      </g>
    </svg>
);


const FullGallery = () => {
  const location = useLocation() as any;
  const fromAdmin: string | undefined = location.state?.fromAdmin;
  const { data: galleryImages, isLoading, isError } = useQuery<GalleryImage[]>({
      queryKey: ['gallery'],
      queryFn: fetchGalleryImages,
  });

  // attempt to load layout
  const [layout, setLayout] = useState<LayoutItem[] | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [designW, setDesignW] = useState<number>(DESIGN_WIDTH_FALLBACK);
  const [designH, setDesignH] = useState<number>(DESIGN_HEIGHT_FALLBACK);
  useEffect(() => {
    (async () => {
      try {
  const data = await get<{ items?: LayoutItem[]; design_width?: number; design_height?: number; order?: string[] }>(`/gallery-layout/full`);
  setLayout((data.items && data.items.length) ? data.items : null);
  setOrder((data.order && data.order.length) ? data.order : null);
        setDesignW(data.design_width || DESIGN_WIDTH_FALLBACK);
        setDesignH(data.design_height || DESIGN_HEIGHT_FALLBACK);
      } catch {
        setLayout(null);
        setDesignW(DESIGN_WIDTH_FALLBACK);
        setDesignH(DESIGN_HEIGHT_FALLBACK);
      }
    })();
  }, []);

  const imagesById = useMemo(() => Object.fromEntries((galleryImages || []).map(i => [i._id, i])), [galleryImages]);
  const filteredLayout = useMemo(() => {
    if (!layout) return [] as LayoutItem[];
    return layout.filter((it) => !!imagesById[it.id]);
  }, [layout, imagesById]);

  const orderedImages = useMemo(() => {
    if (!order) return [] as GalleryImage[];
    return order.map((id) => imagesById[id]).filter(Boolean) as GalleryImage[];
  }, [order, imagesById]);

  // Slideshow state
  const [slides, setSlides] = useState<string[]>([]);
  const [intervalMs, setIntervalMs] = useState(4000);
  const [transitionMs, setTransitionMs] = useState(600);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '1:1' | '21:9'>('16:9');
  const [currentIdx, setCurrentIdx] = useState(0);
  // read-only on this page

  useEffect(() => {
    (async () => {
      try {
        const cfg = await get<SlideConfig>('/slideshow/');
        // Only keep slides that still exist
        const ids = (cfg.image_ids || []).filter((id) => !!imagesById[id]);
        setSlides(ids);
        setIntervalMs(cfg.interval_ms || 4000);
        setTransitionMs(cfg.transition_ms || 600);
        const ar = (cfg.aspect_ratio || '16:9') as any;
        setAspectRatio(ar);
      } catch {
        // no config yet, ignore
      }
    })();
  }, [imagesById]);

  useEffect(() => {
    if (!slides.length) return;
    const t = setInterval(() => {
      setCurrentIdx((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => clearInterval(t);
  }, [slides, intervalMs]);

  // Saving not allowed here; managed from Manage Gallery

  const arPadding = useMemo(() => {
    switch (aspectRatio) {
      case '4:3': return '75%';
      case '1:1': return '100%';
      case '21:9': return `${(9/21)*100}%`;
      default: return `${(9/16)*100}%`;
    }
  }, [aspectRatio]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onResize = () => {
      const w = el.clientWidth;
      const s = Math.min(w / designW, 1);
      setScale(s);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const hasLayout = (filteredLayout.length > 0 || (order && order.length > 0)) && galleryImages && galleryImages.length > 0;

  // Modal viewer state (for non-slideshow images)
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<GalleryImage | null>(null);
  const openViewer = (img: GalleryImage) => {
    setViewerImage(img);
    setViewerOpen(true);
  };
  const closeViewer = () => {
    setViewerOpen(false);
    setViewerImage(null);
  };

  // Reusable thumbnail overlay component styles: show title top-left only
  const ThumbOverlay: React.FC<{ title?: string }>=({ title }) => (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-white text-xs font-medium max-w-[85%] truncate">
        {title || ''}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-sacred py-20 relative overflow-hidden bg-yellow-100/20">
        <LotusSvg className="absolute -top-40 -right-40 w-[300px] h-[300px] md:w-[600px] md:h-[600px] opacity-20 z-0 animate-spin-slow text-red-700" />
        <LotusSvg className="absolute -bottom-40 -left-40 w-[300px] h-[300px] md:w-[600px] md:h-[600px] opacity-20 z-0 animate-spin-slow text-yellow-400" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mb-12">
          <Link to={fromAdmin || "/"} state={undefined} className="inline-flex items-center text-primary hover:text-primary/80 mb-4">
            <ArrowLeft className="h-5 w-5 mr-2" />
            {fromAdmin ? 'Back to Admin' : 'Back to Home'}
          </Link>
          <h1 className="text-4xl md:text-5xl font-playfair font-bold text-center text-foreground">
            Our <span className="text-primary">Gallery</span>
          </h1>
        </div>

        {isLoading && (
          <div className="text-center py-20">Loading gallery...</div>
        )}
        {isError && (
          <div className="text-center py-20">Error fetching gallery.</div>
        )}

        {/* Slideshow (top center) */}
        {!isLoading && !isError && (
          <div className="w-full flex justify-center mb-10">
            <div className="w-full max-w-5xl">
              <div className="relative">
                <div className="relative w-full" style={{ paddingTop: arPadding }}>
                  <div className="absolute inset-0 overflow-hidden rounded-lg shadow-lg bg-slate-900">
                    {slides.length > 0 ? (
                      slides.map((id, idx) => {
                        const img = imagesById[id];
                        if (!img) return null;
                        const visible = idx === currentIdx;
                        return (
                          <img
                            key={id}
                            src={resolveImageUrl(img.src)}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://placehold.co/1200x675'; }}
                            alt={img.title}
                            className="absolute inset-0 w-full h-full object-cover transition-opacity"
                            style={{ opacity: visible ? 1 : 0, transitionDuration: `${transitionMs}ms` }}
                          />
                        );
                      })
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-white/80">No slideshow images selected.</div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-200">Interval: {intervalMs}ms • Transition: {transitionMs}ms • AR: {aspectRatio}</span>
                  </div>
                  {slides.length > 1 && (
                    <div className="flex gap-2">
                      <Button size="icon" variant="outline" onClick={() => setCurrentIdx((i) => (i - 1 + slides.length) % slides.length)}>&lt;</Button>
                      <Button size="icon" variant="outline" onClick={() => setCurrentIdx((i) => (i + 1) % slides.length)}>&gt;</Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* If a saved layout exists, render it scaled; otherwise fallback to grid */}
        {!isLoading && !isError && hasLayout ? (
          order && order.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 grid-flow-row-dense">
              {orderedImages.map((img, idx) => {
                const size = SIZE_PATTERN[idx % SIZE_PATTERN.length];
                return (
                <div
                  key={img._id}
                  className={`relative rounded-lg overflow-hidden bg-muted/40 border group cursor-pointer hover:shadow-lg hover:shadow-primary/10 transition ${sizeClass(size)}`}
                  onClick={() => openViewer(img)}
                >
                  <img
                    src={resolveImageUrl(img.src)}
                    alt={img.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://placehold.co/600x400'; }}
                  />
                  <ThumbOverlay title={img.title} />
                </div>
                );
              })}
            </div>
          ) : (
          <div ref={containerRef} className="w-full overflow-auto">
            <div
              className="relative"
              style={{ width: designW * scale, height: designH * scale }}
            >
              <div
                className="absolute left-0 top-0"
                style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: designW, height: designH }}
              >
                {filteredLayout.map((it) => {
                  const img = imagesById[it.id];
                  if (!img) return null;
                  return (
                    <div key={it.id} className="absolute rounded-lg overflow-hidden bg-muted/40 border hover:shadow-lg hover:shadow-primary/10 transition group cursor-pointer"
                      style={{ left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.z ?? 1 }}
                      onClick={() => openViewer(img)}
                    >
                      <img
                        src={resolveImageUrl(img.src)}
                        alt={img.title}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.src = 'https://placehold.co/600x400'; }}
                      />
                      <ThumbOverlay title={img.title} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )
        ) : (!isLoading && !isError) ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 grid-flow-row-dense">
            {galleryImages?.map((image, idx) => {
              const size = SIZE_PATTERN[idx % SIZE_PATTERN.length];
              return (
              <div
                key={image._id}
                className={`relative rounded-lg overflow-hidden bg-muted/40 border group cursor-pointer hover:shadow-lg hover:shadow-primary/10 transition ${sizeClass(size)}`}
                onClick={() => openViewer(image)}
              >
                <img
                  src={resolveImageUrl(image.src)}
                  alt={image.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onError={(e) => { e.currentTarget.src = 'https://placehold.co/600x400' }}
                />
                <ThumbOverlay title={image.title} />
              </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Image viewer modal (simple overlay) */}
      {viewerOpen && viewerImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeViewer}>
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button className="absolute -top-10 right-0 text-white/80 hover:text-white text-sm" onClick={closeViewer}>Close ✕</button>
            <div className="rounded-lg overflow-hidden bg-slate-900 border border-white/10">
              <img src={resolveImageUrl(viewerImage.src)} alt={viewerImage.title} className="w-full max-h-[70vh] object-contain bg-black" />
              {(viewerImage.title || viewerImage.description) && (
                <div className="p-4 text-white/90 space-y-1">
                  {viewerImage.title && <div className="text-lg font-semibold">{viewerImage.title}</div>}
                  {viewerImage.description && <div className="text-sm text-white/80">{viewerImage.description}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No configuration modal here; this page is read-only for slideshow config */}
    </div>
  );
};

export default FullGallery;