import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PhotoSwipe from 'photoswipe';
import { Photo, Chooser, Selection, Comment, BrushNote } from '@shotpik/shared';
import {
  Heart,
  MessageSquare,
  Paintbrush,
  AlertCircle
} from 'lucide-react';

export interface PhotoSwipeGalleryProps {
  photos: Photo[];
  choosers: Chooser[];
  selections: Selection[];
  comments: Comment[];
  brushNotes: BrushNote[];
  activeChooser: Chooser | null;
  maxSelections: number;
  isLocked: boolean;
  onToggleSelect: (photoId: string) => Promise<void> | void;
  onOpenCommentDrawer: (photo: Photo) => void;
  onOpenBrushCanvas: (photo: Photo) => void;
  onOpenChooserModal?: () => void;
}

export const PhotoSwipeGallery: React.FC<PhotoSwipeGalleryProps> = ({
  photos,
  choosers,
  selections,
  comments,
  brushNotes,
  activeChooser,
  maxSelections,
  isLocked,
  onToggleSelect,
  onOpenCommentDrawer,
  onOpenBrushCanvas,
  onOpenChooserModal,
}) => {
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);
  const [quotaToast, setQuotaToast] = useState<string | null>(null);
  const pswpRef = useRef<PhotoSwipe | null>(null);

  // Auto-dismiss quota toast
  useEffect(() => {
    if (quotaToast) {
      const timer = setTimeout(() => setQuotaToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [quotaToast]);

  // Clean up PhotoSwipe on unmount
  useEffect(() => {
    return () => {
      if (pswpRef.current) {
        pswpRef.current.destroy();
        pswpRef.current = null;
      }
    };
  }, []);

  // Map choosers for quick lookup
  const chooserMap = useMemo(() => {
    return new Map(choosers.map((c) => [c.id, c]));
  }, [choosers]);

  // Distinct photo IDs that have at least one like
  const distinctLikedPhotoIds = useMemo(() => {
    return new Set(selections.map((s) => s.photoId));
  }, [selections]);

  // Selections grouped by photoId
  const selectionsByPhoto = useMemo(() => {
    const map = new Map<string, Selection[]>();
    for (const sel of selections) {
      const list = map.get(sel.photoId) || [];
      list.push(sel);
      map.set(sel.photoId, list);
    }
    return map;
  }, [selections]);

  // Comment count by photoId
  const commentCountByPhoto = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of comments) {
      map.set(c.photoId, (map.get(c.photoId) || 0) + 1);
    }
    return map;
  }, [comments]);

  // Brush notes by photoId
  const brushNotesByPhoto = useMemo(() => {
    const map = new Map<string, BrushNote[]>();
    for (const b of brushNotes) {
      const list = map.get(b.photoId) || [];
      list.push(b);
      map.set(b.photoId, list);
    }
    return map;
  }, [brushNotes]);

  // Handle like toggle with quota and lock feedback
  const handleLike = async (e: React.MouseEvent, photoId: string) => {
    e.stopPropagation();

    if (isLocked) {
      setQuotaToast('Album đã được khoá. Không thể thay đổi lựa chọn.');
      return;
    }

    if (!activeChooser) {
      if (onOpenChooserModal) {
        onOpenChooserModal();
      } else {
        setQuotaToast('Vui lòng chọn người chọn ảnh trước.');
      }
      return;
    }

    const photoSels = selectionsByPhoto.get(photoId) || [];
    const isAlreadyLikedByMe = photoSels.some((s) => s.chooserId === activeChooser.id);
    const isPhotoAlreadyLikedByAnyone = photoSels.length > 0;

    // Quota reached check for new distinct photo selection
    if (
      !isAlreadyLikedByMe &&
      !isPhotoAlreadyLikedByAnyone &&
      distinctLikedPhotoIds.size >= maxSelections
    ) {
      setQuotaToast(`Đã đạt giới hạn tối đa ${maxSelections} ảnh! Vui lòng bỏ bớt ảnh khác.`);
      return;
    }

    try {
      await onToggleSelect(photoId);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setQuotaToast(err.message);
      } else {
        setQuotaToast('Không thể cập nhật lựa chọn');
      }
    }
  };

  // Open PhotoSwipe v5 Lightbox
  const openLightbox = (index: number) => {
    if (pswpRef.current) {
      pswpRef.current.destroy();
    }

    const pswp = new PhotoSwipe({
      dataSource: photos.map((p) => ({
        src: p.fullUrl,
        msrc: p.thumbUrl,
        width: p.width || 2048,
        height: p.height || 1365,
        alt: p.fileName,
      })),
      index,
      bgOpacity: 0.94,
      wheelToZoom: true,
      closeOnVerticalDrag: true,
      padding: { top: 20, bottom: 90, left: 20, right: 20 },
    });

    pswp.on('change', () => {
      setActiveLightboxIndex(pswp.currIndex);
    });

    pswp.on('close', () => {
      setActiveLightboxIndex(null);
    });

    pswp.on('destroy', () => {
      pswpRef.current = null;
      setActiveLightboxIndex(null);
    });

    pswp.init();
    pswpRef.current = pswp;
    setActiveLightboxIndex(index);
  };

  const activePhoto =
    activeLightboxIndex !== null && photos[activeLightboxIndex]
      ? photos[activeLightboxIndex]
      : null;

  const activePhotoSelections = activePhoto ? selectionsByPhoto.get(activePhoto.id) || [] : [];
  const isActivePhotoLikedByMe = activeChooser
    ? activePhotoSelections.some((s) => s.chooserId === activeChooser.id)
    : false;
  const activePhotoCommentCount = activePhoto ? commentCountByPhoto.get(activePhoto.id) || 0 : 0;
  const activePhotoHasBrush = activePhoto ? (brushNotesByPhoto.get(activePhoto.id) || []).length > 0 : false;

  return (
    <div className="w-full">
      {/* Toast Alert */}
      {quotaToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900 border border-rose-500/50 text-rose-300 text-xs font-medium shadow-2xl animate-bounce">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{quotaToast}</span>
        </div>
      )}

      {/* Grid of photos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 p-4 sm:p-6">
        {photos.map((photo, index) => {
          const photoSels = selectionsByPhoto.get(photo.id) || [];
          const isLikedByMe = activeChooser
            ? photoSels.some((s) => s.chooserId === activeChooser.id)
            : false;
          const isLikedByAny = photoSels.length > 0;
          const commentCount = commentCountByPhoto.get(photo.id) || 0;
          const hasBrush = (brushNotesByPhoto.get(photo.id) || []).length > 0;

          // Unique choosers who liked this photo
          const likedChoosers = Array.from(
            new Set(photoSels.map((s) => s.chooserId))
          )
            .map((id) => chooserMap.get(id))
            .filter((c): c is Chooser => Boolean(c));

          return (
            <div
              key={photo.id}
              onClick={() => openLightbox(index)}
              className={`group relative rounded-xl overflow-hidden bg-zinc-900 border transition-all duration-200 cursor-pointer aspect-[3/2] ${
                isLikedByMe
                  ? 'border-rose-500/80 shadow-lg shadow-rose-950/30 ring-1 ring-rose-500/40'
                  : isLikedByAny
                  ? 'border-zinc-700/80'
                  : 'border-zinc-800 hover:border-zinc-700 hover:scale-[1.01]'
              }`}
            >
              {/* Photo Thumbnail */}
              <img
                src={photo.thumbUrl}
                alt={photo.fileName}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />

              {/* Gradient overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity" />

              {/* Top Bar: Clean filename & Indicator icons */}
              <div className="absolute top-2 inset-x-2 flex items-center justify-between gap-1 pointer-events-none">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-zinc-300 border border-white/10 truncate max-w-[70%]">
                  {photo.fileName}
                </span>

                {/* Annotation indicators */}
                <div className="flex items-center gap-1">
                  {commentCount > 0 && (
                    <span
                      className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/90 text-zinc-950 shadow-sm"
                      title={`${commentCount} ghi chú`}
                    >
                      <MessageSquare className="w-2.5 h-2.5 fill-current" />
                      <span>{commentCount}</span>
                    </span>
                  )}
                  {hasBrush && (
                    <span
                      className="p-1 rounded-md bg-rose-500/90 text-white shadow-sm"
                      title="Có hình vẽ khoanh vùng"
                    >
                      <Paintbrush className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Bar: Heart Like Button & Chooser Color Dots */}
              <div className="absolute bottom-2 inset-x-2 flex items-center justify-between gap-2">
                {/* Chooser dots showing who liked this photo */}
                <div className="flex items-center -space-x-1 overflow-hidden pointer-events-none">
                  {likedChoosers.map((chooser) => (
                    <span
                      key={chooser.id}
                      className="w-3.5 h-3.5 rounded-full border-2 border-zinc-900 shadow-sm flex-shrink-0"
                      style={{ backgroundColor: chooser.color || '#e11d48' }}
                      title={`Được chọn bởi ${chooser.name}`}
                    />
                  ))}
                </div>

                {/* Heart Toggle Button */}
                <button
                  type="button"
                  onClick={(e) => handleLike(e, photo.id)}
                  disabled={isLocked}
                  className={`p-2 rounded-full backdrop-blur-md transition-all active:scale-90 ${
                    isLikedByMe
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/60 ring-2 ring-white/20'
                      : isLikedByAny
                      ? 'bg-black/60 text-rose-400 hover:bg-rose-600 hover:text-white border border-white/10'
                      : 'bg-black/50 text-zinc-300 hover:bg-black/80 hover:text-rose-400 border border-white/10'
                  }`}
                  aria-label="Chọn ảnh"
                  title={isLikedByMe ? 'Bỏ chọn ảnh này' : 'Chọn ảnh này'}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${
                      isLikedByMe || isLikedByAny ? 'fill-current' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* PhotoSwipe Custom Floating Action Bar Overlay */}
      {activePhoto &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="pswp__custom-overlay-backdrop fixed inset-x-0 bottom-6 z-[100005] flex justify-center px-4 pointer-events-none">
            <div className="pswp__custom-action-bar flex items-center gap-2 sm:gap-3 px-4 py-2.5 rounded-2xl bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 shadow-2xl pointer-events-auto">
              {/* Photo filename */}
              <span className="text-xs font-medium text-zinc-300 hidden md:inline truncate max-w-[150px] border-r border-zinc-700/80 pr-3">
                {activePhoto.fileName}
              </span>

              {/* Heart Like / Unlike button */}
              <button
                type="button"
                onClick={(e) => handleLike(e, activePhoto.id)}
                disabled={isLocked}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isActivePhotoLikedByMe
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                    : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${isActivePhotoLikedByMe ? 'fill-current' : ''}`}
                />
                <span>{isActivePhotoLikedByMe ? 'Đã chọn' : 'Chọn ảnh'}</span>
              </button>

              {/* Comment Drawer Trigger */}
              <button
                type="button"
                onClick={() => onOpenCommentDrawer(activePhoto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                title="Mở ghi chú chỉnh sửa"
              >
                <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                <span>Ghi chú</span>
                {activePhotoCommentCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {activePhotoCommentCount}
                  </span>
                )}
              </button>

              {/* Brush Canvas Trigger */}
              <button
                type="button"
                onClick={() => {
                  if (pswpRef.current) {
                    pswpRef.current.close();
                  }
                  onOpenBrushCanvas(activePhoto);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  activePhotoHasBrush
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                }`}
                title="Vẽ khoanh vùng yêu cầu chỉnh sửa"
              >
                <Paintbrush className="w-3.5 h-3.5 text-rose-400" />
                <span>Khoanh vùng</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
