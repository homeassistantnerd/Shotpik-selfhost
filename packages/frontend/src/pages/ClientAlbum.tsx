import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Photo,
  Chooser,
  Selection,
  Comment,
  BrushNote,
  Stroke,
  Album,
  StudioSettings,
  ClientAlbumResponse,
  ToggleSelectResponse,
  CreateChooserResponse,
  CreateCommentResponse,
  SaveBrushResponse,
  FinishAlbumResponse,
} from '@shotpik/shared';
import {
  QuotaBar,
  FilterTab,
  ChooserModal,
  CommentDrawer,
  BrushCanvas,
  PhotoSwipeGallery,
} from '../components';
import {
  Camera,
  Phone,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  User,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

export const ClientAlbum: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  // Hydrated data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [studio, setStudio] = useState<StudioSettings | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [choosers, setChoosers] = useState<Chooser[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [brushNotes, setBrushNotes] = useState<BrushNote[]>([]);

  // Active chooser state & modal
  const [activeChooserId, setActiveChooserId] = useState<string | null>(null);
  const [isChooserModalOpen, setIsChooserModalOpen] = useState(false);
  const [isCreatingChooser, setIsCreatingChooser] = useState(false);

  // Filter state
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [activeChooserFilter, setActiveChooserFilter] = useState<string | null>(null);
  const [activeSubGallery, setActiveSubGallery] = useState<string | null>(null);

  // Active drawers/modals
  const [commentPhoto, setCommentPhoto] = useState<Photo | null>(null);
  const [brushPhoto, setBrushPhoto] = useState<Photo | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);

  // Active chooser resolution
  const activeChooser = useMemo(() => {
    return choosers.find((c) => c.id === activeChooserId) || null;
  }, [choosers, activeChooserId]);

  // Fetch album data
  const fetchAlbum = useCallback(async () => {
    if (!slug) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/client/albums/${slug}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Không tìm thấy album hoặc đường dẫn không đúng.');
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Lỗi khi tải dữ liệu album.');
      }
      const data: ClientAlbumResponse = await res.json();
      setAlbum(data.album);
      setStudio(data.studio);
      setPhotos(data.photos || []);
      setChoosers(data.choosers || []);
      setSelections(data.selections || []);
      setComments(data.comments || []);
      setBrushNotes(data.brushNotes || []);

      // Check stored chooser in localStorage
      const storageKey = `shotpik_chooser_${slug}`;
      const savedChooserId = localStorage.getItem(storageKey);
      const existing = (data.choosers || []).find((c) => c.id === savedChooserId);

      if (existing) {
        setActiveChooserId(existing.id);
      } else if (!data.album.isLocked) {
        // Prompt chooser modal if none active and album not locked
        setIsChooserModalOpen(true);
      }
    } catch (err: any) {
      console.error('[ClientAlbum] Fetch error:', err);
      setError(err.message || 'Không thể tải album.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchAlbum();
  }, [fetchAlbum]);

  // Handle chooser selection
  const handleSelectChooser = (chooserId: string) => {
    setActiveChooserId(chooserId);
    if (slug) {
      localStorage.setItem(`shotpik_chooser_${slug}`, chooserId);
    }
    setIsChooserModalOpen(false);
  };

  // Handle chooser creation
  const handleCreateChooser = async (name: string, color: string) => {
    if (!slug) return;
    try {
      setIsCreatingChooser(true);
      const res = await fetch(`/api/client/albums/${slug}/choosers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      const data: CreateChooserResponse = await res.json();
      if (!res.ok) {
        throw new Error((data as any).error || 'Không thể tạo người chọn');
      }

      const created = data.chooser;
      setChoosers((prev) => {
        const exists = prev.find((c) => c.id === created.id);
        if (exists) return prev;
        return [...prev, created];
      });
      handleSelectChooser(created.id);
    } finally {
      setIsCreatingChooser(false);
    }
  };

  // Handle photo selection (toggle like)
  const handleToggleSelect = async (photoId: string) => {
    if (!slug || !activeChooserId) {
      setIsChooserModalOpen(true);
      return;
    }
    if (album?.isLocked) {
      return;
    }

    try {
      const res = await fetch(`/api/client/albums/${slug}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoId,
          chooserId: activeChooserId,
        }),
      });

      const data: ToggleSelectResponse = await res.json();

      if (!res.ok) {
        if (data.limitReached) {
          setLimitWarning(
            data.error ||
              `Gói chụp đã đạt hạn mức tối đa (${album?.maxSelections || 30} ảnh). Vui lòng bỏ chọn bớt ảnh khác nếu muốn chọn ảnh này!`
          );
          return;
        }
        throw new Error(data.error || 'Không thể cập nhật lựa chọn ảnh.');
      }

      if (data.selected && data.selection) {
        setSelections((prev) => [...prev, data.selection!]);
      } else {
        setSelections((prev) =>
          prev.filter(
            (s) => !(s.photoId === photoId && s.chooserId === activeChooserId)
          )
        );
      }
    } catch (err: any) {
      console.error('[ClientAlbum] Toggle select error:', err);
      alert(err.message || 'Lỗi khi cập nhật ảnh chọn.');
    }
  };

  // Handle comment creation
  const handleAddComment = async (
    photoId: string,
    text: string,
    tag?: string | null
  ) => {
    if (!slug || !activeChooserId) {
      setIsChooserModalOpen(true);
      return;
    }
    const res = await fetch(`/api/client/albums/${slug}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoId,
        chooserId: activeChooserId,
        text,
        tag: tag || null,
      }),
    });
    const data: CreateCommentResponse = await res.json();
    if (!res.ok) {
      throw new Error((data as any).error || 'Không thể thêm ghi chú');
    }
    setComments((prev) => [...prev, data.comment]);
  };

  // Handle comment deletion
  const handleDeleteComment = async (commentId: string) => {
    if (!slug) return;
    const query = activeChooserId ? `?chooserId=${encodeURIComponent(activeChooserId)}` : '';
    const res = await fetch(
      `/api/client/albums/${slug}/comments/${commentId}${query}`,
      {
        method: 'DELETE',
        headers: activeChooserId ? { 'x-chooser-id': activeChooserId } : {},
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Không thể xoá ghi chú');
    }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  // Handle brush note save
  const handleSaveBrush = async (photoId: string, strokes: Stroke[]) => {
    if (!slug || !activeChooserId) {
      setIsChooserModalOpen(true);
      return;
    }
    const res = await fetch(`/api/client/albums/${slug}/brush`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoId,
        chooserId: activeChooserId,
        pathsJson: strokes,
      }),
    });
    const data: SaveBrushResponse & { deleted?: boolean } = await res.json();
    if (!res.ok) {
      throw new Error((data as any).error || 'Không thể lưu nét vẽ');
    }

    if (data.deleted) {
      setBrushNotes((prev) =>
        prev.filter(
          (b) => !(b.photoId === photoId && b.chooserId === activeChooserId)
        )
      );
    } else if (data.brushNote) {
      setBrushNotes((prev) => {
        const filtered = prev.filter(
          (b) => !(b.photoId === photoId && b.chooserId === activeChooserId)
        );
        return [...filtered, data.brushNote];
      });
    }
  };

  // Handle finish album
  const handleFinishAlbum = async () => {
    if (!slug) return;
    if (!activeChooserId) {
      setIsChooserModalOpen(true);
      return;
    }
    try {
      setIsFinishing(true);
      const res = await fetch(`/api/client/albums/${slug}/finish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chooser-id': activeChooserId,
        },
        body: JSON.stringify({ chooserId: activeChooserId }),
      });
      const data: FinishAlbumResponse & { album?: Album } = await res.json();
      if (!res.ok) {
        throw new Error((data as any).error || 'Không thể hoàn tất album');
      }

      setAlbum((prev) =>
        prev
          ? {
              ...prev,
              isLocked: true,
              selectionFinishedAt: data.finishedAt,
            }
          : null
      );
      setShowFinishConfirm(false);
    } catch (err: any) {
      console.error('[ClientAlbum] Finish error:', err);
      alert(err.message || 'Lỗi khi hoàn tất chọn ảnh.');
    } finally {
      setIsFinishing(false);
    }
  };

  // Compute distinct liked photo IDs across entire album
  const distinctSelectedCount = useMemo(() => {
    return new Set(selections.map((s) => s.photoId)).size;
  }, [selections]);

  // Extract available subGalleries
  const subGalleries = useMemo(() => {
    const set = new Set<string>();
    for (const p of photos) {
      if (p.subGallery && p.subGallery !== 'All') {
        set.add(p.subGallery);
      }
    }
    return Array.from(set);
  }, [photos]);

  // Filter photos based on active tabs, chooser filter, and subGallery
  const filteredPhotos = useMemo(() => {
    return photos.filter((photo) => {
      // Sub-gallery filter
      if (activeSubGallery && photo.subGallery !== activeSubGallery) {
        return false;
      }

      const photoSelections = selections.filter((s) => s.photoId === photo.id);
      const photoComments = comments.filter((c) => c.photoId === photo.id);
      const photoBrushes = brushNotes.filter((b) => b.photoId === photo.id);

      // Chooser filter dropdown
      if (activeChooserFilter) {
        const matchesChooser = photoSelections.some(
          (s) => s.chooserId === activeChooserFilter
        );
        if (!matchesChooser) return false;
      }

      // Tab filter
      if (activeTab === 'selected') {
        return photoSelections.length > 0;
      }
      if (activeTab === 'notes') {
        return photoComments.length > 0 || photoBrushes.length > 0;
      }

      return true;
    });
  }, [
    photos,
    selections,
    comments,
    brushNotes,
    activeTab,
    activeChooserFilter,
    activeSubGallery,
  ]);

  // Initial brush strokes when opening BrushCanvas
  const brushInitialStrokes = useMemo(() => {
    if (!brushPhoto) return [];
    // Prioritize active chooser note, then any note on this photo
    const note =
      brushNotes.find(
        (b) =>
          b.photoId === brushPhoto.id &&
          b.chooserId === (activeChooserId || undefined)
      ) || brushNotes.find((b) => b.photoId === brushPhoto.id);

    if (!note) return [];
    if ((note as any).strokes && Array.isArray((note as any).strokes)) {
      return (note as any).strokes;
    }
    try {
      return JSON.parse(note.pathsJson);
    } catch {
      return [];
    }
  }, [brushPhoto, brushNotes, activeChooserId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 text-rose-500 animate-spin mb-4" />
        <h2 className="text-lg font-semibold text-zinc-200">Đang tải album ảnh...</h2>
        <p className="text-xs text-zinc-400 mt-1">Vui lòng chờ trong giây lát</p>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4">
          <ShieldAlert className="w-10 h-10 stroke-1" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">Không thể truy cập album</h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6">
          {error || 'Album không tồn tại hoặc đã bị xoá.'}
        </p>
        <Link
          to="/admin"
          className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
        >
          Trở về Trang Quản Trị
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Studio Branding & Album Header */}
      <header className="w-full bg-zinc-900/90 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Studio Info */}
            <div className="flex items-center gap-3.5">
              {studio?.logoUrl ? (
                <img
                  src={studio.logoUrl}
                  alt={studio.studioName}
                  className="w-12 h-12 object-contain rounded-xl bg-zinc-950 p-1 border border-zinc-800"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-600 to-amber-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
                  <Camera className="w-6 h-6" />
                </div>
              )}
              <div>
                <h1 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <span>{studio?.studioName || 'Shotpik Studio'}</span>
                </h1>
                {studio?.slogan && (
                  <p className="text-xs text-zinc-400 font-medium">{studio.slogan}</p>
                )}
                {studio?.phone && (
                  <a
                    href={`tel:${studio.phone}`}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-rose-400 mt-0.5 transition-colors"
                  >
                    <Phone className="w-3 h-3" />
                    <span>Hotline: {studio.phone}</span>
                  </a>
                )}
              </div>
            </div>

            {/* Album Info & Deadline Badge */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="text-left sm:text-right">
                <div className="flex items-center sm:justify-end gap-2">
                  <span className="text-sm sm:text-base font-bold text-zinc-100">
                    {album.title}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Khách hàng: <span className="text-zinc-200 font-medium">{album.customerName}</span>
                </p>
              </div>

              {album.deadlineAt && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700/80 text-xs text-zinc-300">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Hạn chốt:{' '}
                    {new Date(album.deadlineAt).toLocaleDateString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )}

              {/* Chooser Quick Switcher on Top */}
              <button
                type="button"
                onClick={() => setIsChooserModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700 text-xs text-zinc-200 transition-colors"
              >
                {activeChooser ? (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: activeChooser.color || '#e11d48' }}
                    />
                    <span className="font-medium max-w-[120px] truncate">
                      {activeChooser.name}
                    </span>
                  </>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5 text-rose-400" />
                    <span>Chọn vai trò</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Locked completion banner */}
      {album.isLocked && (
        <div className="w-full bg-emerald-950/40 border-b border-emerald-800/60 px-4 py-3 text-center animate-fade-in">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-emerald-400 text-xs sm:text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>
              Album đã hoàn tất chọn ảnh
              {album.selectionFinishedAt &&
                ` vào ngày ${new Date(album.selectionFinishedAt).toLocaleDateString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}`}
              . Hiện tại album đang ở chế độ xem và không thể thay đổi thêm.
            </span>
          </div>
        </div>
      )}

      {/* Sticky Quota Bar */}
      <QuotaBar
        selectedCount={distinctSelectedCount}
        maxSelections={album.maxSelections}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeChooserFilter={activeChooserFilter}
        onChooserFilterChange={setActiveChooserFilter}
        choosers={choosers}
        subGalleries={subGalleries}
        activeSubGallery={activeSubGallery}
        onSubGalleryChange={setActiveSubGallery}
        isLocked={album.isLocked}
        onFinishAlbum={() => setShowFinishConfirm(true)}
        isFinishing={isFinishing}
        activeChooser={activeChooser}
        onOpenChooserModal={() => setIsChooserModalOpen(true)}
      />

      {/* Main Gallery Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto">
        {filteredPhotos.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <p className="text-base font-medium text-zinc-300">Không có ảnh phù hợp</p>
            <p className="text-xs text-zinc-400 mt-1">
              Thử chuyển tab bộ lọc hoặc chọn tất cả ảnh.
            </p>
            {activeTab !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('all');
                  setActiveChooserFilter(null);
                  setActiveSubGallery(null);
                }}
                className="mt-4 px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                Xem tất cả ảnh
              </button>
            )}
          </div>
        ) : (
          <PhotoSwipeGallery
            photos={filteredPhotos}
            choosers={choosers}
            selections={selections}
            comments={comments}
            brushNotes={brushNotes}
            activeChooser={activeChooser}
            maxSelections={album.maxSelections}
            isLocked={album.isLocked}
            onToggleSelect={handleToggleSelect}
            onOpenCommentDrawer={(p) => setCommentPhoto(p)}
            onOpenBrushCanvas={(p) => setBrushPhoto(p)}
            onOpenChooserModal={() => setIsChooserModalOpen(true)}
          />
        )}
      </main>

      {/* Chooser Modal */}
      <ChooserModal
        isOpen={isChooserModalOpen}
        onClose={activeChooserId ? () => setIsChooserModalOpen(false) : undefined}
        choosers={choosers}
        activeChooserId={activeChooserId}
        onSelectChooser={handleSelectChooser}
        onCreateChooser={handleCreateChooser}
        isCreating={isCreatingChooser}
      />

      {/* Comment Drawer */}
      <CommentDrawer
        isOpen={Boolean(commentPhoto)}
        onClose={() => setCommentPhoto(null)}
        photo={commentPhoto}
        comments={comments}
        choosers={choosers}
        activeChooser={activeChooser}
        onAddComment={handleAddComment}
        onDeleteComment={album.isLocked ? undefined : handleDeleteComment}
      />

      {/* Freehand Brush Canvas */}
      <BrushCanvas
        isOpen={Boolean(brushPhoto)}
        onClose={() => setBrushPhoto(null)}
        photo={brushPhoto}
        initialStrokes={brushInitialStrokes}
        onSave={handleSaveBrush}
      />

      {/* Quota Limit Warning Modal */}
      {limitWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-zinc-900 border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-100">Đã đạt hạn mức ảnh chọn</h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{limitWarning}</p>
            </div>
            <button
              type="button"
              onClick={() => setLimitWarning(null)}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-950/50 transition-all cursor-pointer"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}

      {/* Finish Album Confirmation Modal */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-100">Xác nhận hoàn tất chọn ảnh?</h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Bạn đã chọn{' '}
                <span className="text-emerald-400 font-bold">
                  {distinctSelectedCount} / {album.maxSelections}
                </span>{' '}
                ảnh. Sau khi bấm hoàn tất, album sẽ được khoá và gửi thông báo hoàn tất đến Studio.
                Bạn sẽ không thể thay đổi hoặc thêm bớt ảnh chọn nữa.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowFinishConfirm(false)}
                disabled={isFinishing}
                className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Tiếp tục chọn
              </button>
              <button
                type="button"
                onClick={handleFinishAlbum}
                disabled={isFinishing}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isFinishing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Xác nhận hoàn tất</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientAlbum;
