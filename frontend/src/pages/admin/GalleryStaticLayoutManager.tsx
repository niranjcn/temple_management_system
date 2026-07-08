import React, { useEffect, useMemo, useState } from 'react';
import { get, post } from '@/api/api';
import { resolveImageUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export interface GalleryImage {
  _id: string;
  src: string;
  title: string;
  category: string;
}

type Props = {
  images: GalleryImage[];
  onSaveComplete?: () => void; // Defines the callback for when saving is complete.
};

// Simple repeating size pattern for containers
const SIZE_PATTERN: Array<'lg' | 'md' | 'sm'> = ['lg', 'sm', 'sm', 'md', 'sm', 'lg', 'sm', 'md'];

function sizeClass(size: 'lg' | 'md' | 'sm') {
  // Use column and row spans for a dynamic, professional masonry layout.
  // This preserves visual variety while ensuring images have proper, non-distorted proportions.
  if (size === 'lg') return 'col-span-2 row-span-2';
  if (size === 'md') return 'row-span-2';
  return 'col-span-1 row-span-1';
}

const GalleryStaticLayoutManager: React.FC<Props> = ({ images, onSaveComplete }) => {
  const [order, setOrder] = useState<(string | null)[]>([]);
  const [saving, setSaving] = useState(false);

  // Build maps
  const imagesById = useMemo(() => Object.fromEntries(images.map((i) => [i._id, i])), [images]);

  // A Set for quick lookups of images already placed in the layout.
  const usedImageIds = useMemo(() => new Set(order.filter(Boolean)), [order]);

  // Load existing order from the backend on component mount.
  useEffect(() => {
    (async () => {
      try {
        const layout = await get<any>(`/gallery-layout/full`);
        const ord: string[] = Array.isArray(layout?.order) ? layout.order : [];
        const filtered = ord.filter((id) => !!imagesById[id]);
        // Fallback: auto-fill with all images if no layout is saved.
        if (filtered.length === 0) {
          setOrder(images.map((i) => i._id));
        } else {
          setOrder(filtered);
        }
      } catch {
        setOrder(images.map((i) => i._id));
      }
    })();
  }, [images, imagesById]);

  // Handles drag-and-drop operations.
  const onDragStartImage = (e: React.DragEvent, id: string, source: 'palette' | 'container', containerIndex?: number) => {
    try {
      e.dataTransfer.setData('text/gallery-image-id', id);
      e.dataTransfer.setData('text/source', source);
      if (source === 'container') {
        e.dataTransfer.setData('text/container-index', String(containerIndex ?? -1));
      }
    } catch {}
    e.dataTransfer.effectAllowed = 'move';
  };
  const onContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDropToContainer = (targetIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    let id = '';
    let source = '';
    try {
      id = e.dataTransfer.getData('text/gallery-image-id');
      source = e.dataTransfer.getData('text/source');
    } catch {}
    if (!id) return;
    setOrder((prev) => {
      const containerCount = images.length;
      const next = [...prev];
      while (next.length < containerCount) next.push(null);
      if (next.length > containerCount) next.length = containerCount;

      const existingIdx = next.findIndex((x) => x === id);
      const displaced = next[targetIdx] ?? null;

      // Place dragged image into target container.
      next[targetIdx] = id;

      if (existingIdx >= 0 && existingIdx !== targetIdx) {
        // If image came from another container, swap them.
        next[existingIdx] = displaced;
      } else if (existingIdx === -1) {
        // If image came from the palette, move the displaced image to an empty slot if possible.
        if (displaced && displaced !== id) {
          const emptyIdx = next.findIndex((x, i) => (x == null) && i !== targetIdx);
          if (emptyIdx !== -1) next[emptyIdx] = displaced;
        }
      }

      // Ensure the dragged image ID appears only once in the layout.
      for (let i = 0; i < next.length; i++) {
        if (i !== targetIdx && next[i] === id) next[i] = null;
      }

      return next;
    });
  };

  // Clears an image from a specific container.
  const onClearContainer = (idx: number) => {
    setOrder((prev) => {
      const next = [...prev];
      if (idx >= 0 && idx < next.length) next[idx] = null;
      return next;
    });
  };

  // Handles clicking an image in the palette to add it to, or remove it from, the layout.
  const handlePaletteClick = (id: string) => {
    if (usedImageIds.has(id)) {
      // Image is already in the layout, so remove it.
      setOrder(prev => {
          const next = [...prev];
          const indexToClear = next.indexOf(id);
          if (indexToClear !== -1) {
              next[indexToClear] = null;
          }
          return next;
      });
    } else {
      // Image is not in the layout, so add it to the first empty slot.
      setOrder(prev => {
          const next = [...prev];
          const emptyIdx = next.findIndex(slot => slot === null || slot === undefined);

          if (emptyIdx !== -1) {
              next[emptyIdx] = id;
              return next;
          } else {
              toast.warning('No empty slots available. Drag to replace an image.');
              return prev; // No empty slots available.
          }
      });
    }
  };

  // Saves the current layout order to the backend.
  const save = async () => {
    setSaving(true);
    try {
      await post(`/gallery-layout/full`, { mode: 'full', order: order.filter(Boolean) });
      toast.success('Gallery layout saved');
      onSaveComplete?.(); // Closes the layout manager upon a successful save.
    } catch (e) {
      console.error(e);
      toast.error('Failed to save gallery layout');
    } finally {
      setSaving(false);
    }
  };

  const containerCount = images.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="text-sm text-muted-foreground">Click an available image to add it, or click a placed image in the palette to remove it. You can also drag to arrange.</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOrder(images.map((i) => i._id))}>Auto-fill</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Layout'}</Button>
        </div>
      </div>

      {/* Masonry grid for arranging gallery images. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 grid-flow-row-dense">
        {Array.from({ length: containerCount }).map((_, idx) => {
          const size = SIZE_PATTERN[idx % SIZE_PATTERN.length];
          const id = order[idx];
          const img = id ? imagesById[id] : null;
          return (
            <div
              key={idx}
              className={`relative rounded-lg overflow-hidden bg-muted/40 border flex items-center justify-center group ${sizeClass(size)}`}
              onDragOver={onContainerDragOver}
              onDrop={onDropToContainer(idx)}
            >
              {img ? (
                <img
                  src={resolveImageUrl(img.src)}
                  alt={img.title}
                  className="w-full h-full object-cover"
                  draggable
                  onDragStart={(e) => onDragStartImage(e, img._id, 'container', idx)}
                />
              ) : (
                <div className="text-xs text-muted-foreground">Drop image here</div>
              )}
              {img && (
                <button
                  type="button"
                  className="absolute top-2 right-2 text-sm px-4 py-2 rounded-lg 
                            bg-red-600 text-white font-bold shadow-lg border-2 border-red-700
                            hover:bg-red-700 hover:scale-110 hover:shadow-xl 
                            focus:outline-none focus:ring-4 focus:ring-red-400 
                            active:scale-95 transition-all duration-200"
                  onClick={() => onClearContainer(idx)}
                >
                  Clear
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Palette of available images. */}
      <div>
        <div className="text-sm font-medium mb-2">Available Images</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {images.map((img) => {
            const isUsed = usedImageIds.has(img._id);
            return (
                <div
                    key={img._id}
                    className={`relative rounded border overflow-hidden transition-all cursor-pointer ${
                        isUsed
                        ? 'ring-2 ring-offset-2 ring-offset-background ring-purple-500 opacity-60'
                        : 'hover:opacity-80'
                    }`}
                    onClick={() => handlePaletteClick(img._id)}
                >
                    <img
                      src={resolveImageUrl(img.src)}
                      alt={img.title}
                      draggable
                      onDragStart={(e) => onDragStartImage(e, img._id, 'palette')}
                      className="w-full h-24 object-cover"
                      loading="lazy"
                    />
                </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GalleryStaticLayoutManager;

