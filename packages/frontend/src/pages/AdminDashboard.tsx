import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import {
  AdminAlbumSummary,
  AdminAlbumDetailResponse,
  LightroomExportResponse,
  StudioSettings,
  Photo,
  Stroke,
  denormalizePoint,
} from '@shotpik/shared';
import {
  Camera,
  Plus,
  RefreshCw,
  Lock,
  Unlock,
  Trash2,
  ExternalLink,
  Share2,
  Copy,
  Check,
  Download,
  FolderSync,
  Layers,
  Settings as SettingsIcon,
  MessageSquare,
  Paintbrush,
  AlertCircle,
  X,
  Loader2,
  HardDrive,
  CheckCircle2,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  // Navigation tabs: 'albums' | 'settings'
  const [activeNavTab, setActiveNavTab] = useState<'albums' | 'settings'>('albums');

  // Albums state
  const [albums, setAlbums] = useState<AdminAlbumSummary[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [syncingAlbumId, setSyncingAlbumId] = useState<string | null>(null);

  // Create album modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    customerName: '',
    gdriveFolderUrl: '',
    maxSelections: 30,
    deadlineAt: '',
    serverMountPath: '',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Companion & Export Drawer / Modal
  const [activeExportAlbum, setActiveExportAlbum] = useState<AdminAlbumSummary | null>(null);
  const [albumDetail, setAlbumDetail] = useState<AdminAlbumDetailResponse | null>(null);
  const [lightroomExport, setLightroomExport] = useState<LightroomExportResponse | null>(null);
  const [loadingExportData, setLoadingExportData] = useState(false);
  const [copiedType, setCopiedType] = useState<'link' | 'lightroom' | 'captureone' | null>(null);

  // NAS Copy state
  const [nasMountPath, setNasMountPath] = useState('');
  const [isNasCopying, setIsNasCopying] = useState(false);
  const [nasCopyResult, setNasCopyResult] = useState<{
    success: boolean;
    copiedCount: number;
    errors: string[];
  } | null>(null);

  // Brush Preview Modal
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [previewStrokes, setPreviewStrokes] = useState<Stroke[]>([]);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);

  // Studio Settings state
  const [settings, setSettings] = useState<StudioSettings>({
    id: 'default',
    studioName: '',
    slogan: '',
    phone: '',
    email: '',
    logoUrl: '',
    watermarkText: '',
    customDomain: '',
  });
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsToast, setSettingsToast] = useState<string | null>(null);

  // Global toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Fetch albums list
  const fetchAlbums = useCallback(async () => {
    try {
      setLoadingAlbums(true);
      const res = await fetch('/api/admin/albums');
      if (!res.ok) throw new Error('Không thể tải danh sách album');
      const data = await res.json();
      setAlbums(data.albums || []);
    } catch (err: any) {
      console.error('[Admin] Fetch albums error:', err);
      showToast(err.message || 'Lỗi khi tải danh sách album', 'error');
    } finally {
      setLoadingAlbums(false);
    }
  }, []);

  // Fetch studio settings
  const fetchSettings = useCallback(async () => {
    try {
      setLoadingSettings(true);
      const res = await fetch('/api/admin/settings');
      if (!res.ok) throw new Error('Không thể tải cài đặt studio');
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
      }
    } catch (err: any) {
      console.error('[Admin] Fetch settings error:', err);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    fetchAlbums();
    fetchSettings();
  }, [fetchAlbums, fetchSettings]);

  // Handle create album submit
  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim() || !createForm.customerName.trim() || !createForm.gdriveFolderUrl.trim()) {
      setCreateError('Vui lòng điền đầy đủ tiêu đề, tên khách hàng và link Google Drive.');
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);

      const res = await fetch('/api/admin/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title.trim(),
          customerName: createForm.customerName.trim(),
          gdriveFolderUrl: createForm.gdriveFolderUrl.trim(),
          maxSelections: Number(createForm.maxSelections) || 30,
          serverMountPath: createForm.serverMountPath.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lỗi khi tạo album mới');
      }

      // If deadlineAt was provided, update it via PATCH
      if (createForm.deadlineAt) {
        const isoDeadline = new Date(createForm.deadlineAt).toISOString();
        await fetch(`/api/admin/albums/${data.id || data.album.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deadlineAt: isoDeadline }),
        });
      }

      showToast(
        `Đã tạo album "${createForm.title}" thành công với ${data.importedPhotosCount || 0} ảnh được quét từ Google Drive!`
      );
      setIsCreateModalOpen(false);
      setCreateForm({
        title: '',
        customerName: '',
        gdriveFolderUrl: '',
        maxSelections: 30,
        deadlineAt: '',
        serverMountPath: '',
      });
      fetchAlbums();
    } catch (err: any) {
      console.error('[Admin] Create album error:', err);
      setCreateError(err.message || 'Không thể tạo album');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle album lock toggle
  const handleToggleLock = async (album: AdminAlbumSummary) => {
    try {
      const res = await fetch(`/api/admin/albums/${album.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLocked: !album.isLocked }),
      });
      if (!res.ok) throw new Error('Không thể thay đổi trạng thái khoá');
      setAlbums((prev) =>
        prev.map((a) => (a.id === album.id ? { ...a, isLocked: !a.isLocked } : a))
      );
      showToast(
        `Đã ${!album.isLocked ? 'khoá' : 'mở khoá'} album "${album.title}".`
      );
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi cập nhật trạng thái khoá', 'error');
    }
  };

  // Handle Google Drive sync
  const handleSyncAlbum = async (album: AdminAlbumSummary) => {
    try {
      setSyncingAlbumId(album.id);
      const res = await fetch(`/api/admin/albums/${album.id}/sync`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi đồng bộ Google Drive');
      showToast(
        `Đồng bộ hoàn tất! Tổng cộng: ${data.totalPhotos} ảnh (+${data.newPhotosAdded} mới).`
      );
      fetchAlbums();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi quét lại thư mục Drive', 'error');
    } finally {
      setSyncingAlbumId(null);
    }
  };

  // Handle delete album
  const handleDeleteAlbum = async (album: AdminAlbumSummary) => {
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xoá vĩnh viễn album "${album.title}" của khách "${album.customerName}"? Toàn bộ lựa chọn, bình luận và ghi chú sẽ bị xoá.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/albums/${album.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Không thể xoá album');
      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
      showToast(`Đã xoá album "${album.title}".`);
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xoá album', 'error');
    }
  };

  // Open Export & Companion Drawer
  const openExportModal = async (album: AdminAlbumSummary) => {
    setActiveExportAlbum(album);
    setNasMountPath(album.serverMountPath || '');
    setNasCopyResult(null);
    try {
      setLoadingExportData(true);
      const [detailRes, lrRes] = await Promise.all([
        fetch(`/api/admin/albums/${album.id}`),
        fetch(`/api/admin/albums/${album.id}/export/lightroom`),
      ]);

      if (detailRes.ok) {
        const detailData: AdminAlbumDetailResponse = await detailRes.json();
        setAlbumDetail(detailData);
      }
      if (lrRes.ok) {
        const lrData: LightroomExportResponse = await lrRes.json();
        setLightroomExport(lrData);
      }
    } catch (err) {
      console.error('[Admin] Fetch export data error:', err);
    } finally {
      setLoadingExportData(false);
    }
  };

  // Copy helper
  const handleCopy = (text: string, type: 'link' | 'lightroom' | 'captureone') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  // Download QR Code Canvas as PNG
  const handleDownloadQR = () => {
    if (!activeExportAlbum) return;
    const canvas = document.getElementById(
      `qr-canvas-${activeExportAlbum.id}`
    ) as HTMLCanvasElement;
    if (!canvas) return;
    const pngUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `QR_${activeExportAlbum.slug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Server-Side NAS Copy
  const handleTriggerNasCopy = async () => {
    if (!activeExportAlbum) return;
    try {
      setIsNasCopying(true);
      setNasCopyResult(null);
      const res = await fetch(
        `/api/admin/albums/${activeExportAlbum.id}/export/nas-copy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverMountPath: nasMountPath.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lỗi khi sao chép file RAW trên NAS');
      }
      setNasCopyResult({
        success: data.success,
        copiedCount: data.copiedCount,
        errors: data.errors || [],
      });
      showToast(
        `Đã sao chép thành công ${data.copiedCount} file RAW vào thư mục đích trên máy chủ!`
      );
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi copy file RAW', 'error');
    } finally {
      setIsNasCopying(false);
    }
  };

  // Handle Save Studio Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi lưu cài đặt');
      if (data.settings) setSettings(data.settings);
      setSettingsToast('Đã lưu thông tin studio thành công!');
      setTimeout(() => setSettingsToast(null), 3000);
    } catch (err: any) {
      showToast(err.message || 'Không thể lưu cài đặt', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // Selected photos for the client feedback inspector
  const selectedPhotosWithFeedback = useMemo(() => {
    if (!albumDetail) return [];
    const photoMap = new Map(albumDetail.photos.map((p) => [p.id, p]));
    const chooserMap = new Map(albumDetail.choosers.map((c) => [c.id, c]));

    // Group selections by photoId
    const distinctSelectedIds = Array.from(
      new Set(albumDetail.selections.map((s) => s.photoId))
    );

    return distinctSelectedIds
      .map((photoId) => {
        const photo = photoMap.get(photoId);
        if (!photo) return null;

        const photoSelections = albumDetail.selections.filter(
          (s) => s.photoId === photoId
        );
        const likedChoosers = Array.from(
          new Set(photoSelections.map((s) => s.chooserId))
        )
          .map((cid) => chooserMap.get(cid))
          .filter(Boolean);

        const photoComments = albumDetail.comments.filter(
          (c) => c.photoId === photoId
        );
        const photoBrushes = albumDetail.brushNotes.filter(
          (b) => b.photoId === photoId
        );

        return {
          photo,
          likedChoosers,
          comments: photoComments,
          brushNotes: photoBrushes,
        };
      })
      .filter(Boolean);
  }, [albumDetail]);

  // Draw strokes onto preview canvas
  const drawPreviewStrokes = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const img = previewImgRef.current;
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of previewStrokes) {
      if (!stroke.points || stroke.points.length === 0) continue;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color || '#ef4444';
      ctx.lineWidth = stroke.width || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const first = denormalizePoint(stroke.points[0], canvas.width, canvas.height);
      ctx.moveTo(first.x, first.y);

      if (stroke.points.length === 1) {
        ctx.lineTo(first.x + 0.5, first.y + 0.5);
      } else {
        for (let i = 1; i < stroke.points.length; i++) {
          const pt = denormalizePoint(stroke.points[i], canvas.width, canvas.height);
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.stroke();
    }
  }, [previewStrokes]);

  useEffect(() => {
    if (previewPhoto && previewStrokes.length > 0) {
      drawPreviewStrokes();
      window.addEventListener('resize', drawPreviewStrokes);
      return () => window.removeEventListener('resize', drawPreviewStrokes);
    }
  }, [previewPhoto, previewStrokes, drawPreviewStrokes]);

  const openBrushPreview = (photo: Photo, note: any) => {
    let strokes: Stroke[] = [];
    if (note.strokes && Array.isArray(note.strokes)) {
      strokes = note.strokes;
    } else {
      try {
        strokes = JSON.parse(note.pathsJson);
      } catch {
        strokes = [];
      }
    }
    setPreviewPhoto(photo);
    setPreviewStrokes(strokes);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold border animate-fade-in ${
            toast.type === 'success'
              ? 'bg-zinc-900 text-emerald-400 border-emerald-500/40'
              : 'bg-zinc-900 text-rose-400 border-rose-500/40'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="w-full bg-zinc-900/95 border-b border-zinc-800 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-600 to-amber-600 flex items-center justify-center text-white shadow-md">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm sm:text-base text-zinc-100 tracking-tight">
                Shotpik Studio Admin
              </h1>
              <p className="text-[11px] text-zinc-400">Quản lý chọn ảnh & Xuất file RAW</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveNavTab('albums')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                activeNavTab === 'albums'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Albums ({albums.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveNavTab('settings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                activeNavTab === 'settings'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Cài đặt Studio</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeNavTab === 'albums' ? (
          <div className="space-y-6">
            {/* Header row: Action buttons & Stats */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">Danh Sách Album Ảnh</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Theo dõi tiến độ khách chọn ảnh, xuất câu lệnh lọc Lightroom và tải file companion.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchAlbums}
                  disabled={loadingAlbums}
                  className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors"
                  title="Tải lại danh sách"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingAlbums ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-950/40 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tạo Album Mới</span>
                </button>
              </div>
            </div>

            {/* Albums Grid */}
            {loadingAlbums && albums.length === 0 ? (
              <div className="p-16 text-center text-zinc-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-rose-500 mb-2" />
                <p className="text-xs">Đang tải danh sách album...</p>
              </div>
            ) : albums.length === 0 ? (
              <div className="p-16 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/30">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
                  <Camera className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-zinc-200">Chưa có album nào</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto mb-4">
                  Bắt đầu bằng cách tạo album mới từ liên kết thư mục Google Drive chứa ảnh chụp.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all"
                >
                  Tạo album đầu tiên
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {albums.map((album) => {
                  const percentage = Math.min(
                    100,
                    album.maxSelections > 0
                      ? Math.round((album.selectedPhotosCount / album.maxSelections) * 100)
                      : 0
                  );
                  const isSyncing = syncingAlbumId === album.id;

                  return (
                    <div
                      key={album.id}
                      className="rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700/80 p-5 shadow-xl flex flex-col justify-between transition-all"
                    >
                      {/* Top Info */}
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <h3 className="font-bold text-base text-zinc-100 line-clamp-1">
                              {album.title}
                            </h3>
                            <p className="text-xs text-zinc-400 mt-0.5">
                              Khách hàng: <span className="text-zinc-200 font-medium">{album.customerName}</span>
                            </p>
                          </div>
                          {album.isLocked ? (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
                              <Lock className="w-3 h-3" />
                              Đã khoá
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
                              <Unlock className="w-3 h-3" />
                              Đang chọn
                            </span>
                          )}
                        </div>

                        {/* Metrics Bar */}
                        <div className="mt-4 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-400 font-medium">Tiến độ chọn:</span>
                            <span className="font-bold text-zinc-200">
                              <span className="text-rose-400">{album.selectedPhotosCount}</span> /{' '}
                              {album.maxSelections} ảnh ({percentage}%)
                            </span>
                          </div>
                          {/* Progress */}
                          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                album.selectedPhotosCount >= album.maxSelections
                                  ? 'bg-rose-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                            <span>Tổng ảnh: {album.totalPhotos}</span>
                            <span>Người chọn: {album.choosersCount ?? 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Actions */}
                      <div className="pt-4 mt-4 border-t border-zinc-800/80 space-y-2.5">
                        <div className="flex items-center gap-2">
                          {/* Export Companion Drawer Button */}
                          <button
                            type="button"
                            onClick={() => openExportModal(album)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Xuất & Đồng bộ RAW</span>
                          </button>

                          {/* Direct Client Album Link */}
                          <Link
                            to={`/albums/${album.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                            title="Mở trang chọn ảnh của khách"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        </div>

                        {/* Secondary controls: Lock Toggle, Re-sync, Delete */}
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <button
                            type="button"
                            onClick={() => handleToggleLock(album)}
                            className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                          >
                            {album.isLocked ? (
                              <>
                                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Mở khoá</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5 text-amber-400" />
                                <span>Khoá chọn</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSyncAlbum(album)}
                            disabled={isSyncing}
                            className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                            title="Quét lại thư mục Google Drive để bổ sung ảnh mới"
                          >
                            <FolderSync
                              className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-rose-400' : ''}`}
                            />
                            <span>{isSyncing ? 'Đang quét...' : 'Quét lại Drive'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteAlbum(album)}
                            className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                            title="Xoá album này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Studio Settings Tab */
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-100">Cấu Hình Thương Hiệu Studio</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Thiết lập thông tin thương hiệu, hotline, logo hiển thị trên tất cả album khách hàng.
              </p>
            </div>

            {loadingSettings ? (
              <div className="p-12 text-center text-zinc-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-rose-500 mb-2" />
                <p className="text-xs">Đang tải cấu hình studio...</p>
              </div>
            ) : (
              <form
                onSubmit={handleSaveSettings}
                className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-5"
              >
                {settingsToast && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{settingsToast}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                      Tên Studio <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={settings.studioName}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, studioName: e.target.value }))
                      }
                      placeholder="Shotpik Studio"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                      Khẩu hiệu / Slogan
                    </label>
                    <input
                      type="text"
                      value={settings.slogan || ''}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, slogan: e.target.value }))
                      }
                      placeholder="Lưu giữ khoảnh khắc quý giá"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                      Số điện thoại Hotline
                    </label>
                    <input
                      type="text"
                      value={settings.phone || ''}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="0901234567"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                      Email liên hệ
                    </label>
                    <input
                      type="email"
                      value={settings.email || ''}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, email: e.target.value }))
                      }
                      placeholder="contact@studio.vn"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                    URL Logo Studio (Ảnh vuông hoặc ngang)
                  </label>
                  <input
                    type="url"
                    value={settings.logoUrl || ''}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, logoUrl: e.target.value }))
                    }
                    placeholder="https://example.com/logo.png"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                    Watermark chữ ký (Chống sao chép)
                  </label>
                  <input
                    type="text"
                    value={settings.watermarkText || ''}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, watermarkText: e.target.value }))
                    }
                    placeholder="© Shotpik Studio"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-950/40 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {savingSettings ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>Lưu Cài Đặt</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>

      {/* Create Album Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-zinc-100">Tạo Album Mới</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAlbum} className="p-6 space-y-4">
              {createError && (
                <div className="p-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Tiêu đề Album <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="Ví dụ: Tiệc Cưới Tuấn & Lan"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  disabled={isCreating}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Tên Khách Hàng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.customerName}
                  onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })}
                  placeholder="Ví dụ: Nguyễn Tuấn & Mai Lan"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  disabled={isCreating}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Link Thư Mục Google Drive (Hoặc Folder ID) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.gdriveFolderUrl}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, gdriveFolderUrl: e.target.value })
                  }
                  placeholder="https://drive.google.com/drive/folders/1aBcDeFgHi..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  disabled={isCreating}
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Lưu ý: Thư mục Google Drive cần được chia sẻ ở chế độ "Bất kỳ ai có đường liên kết đều có thể xem".
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">
                    Hạn mức ảnh chọn tối đa
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={createForm.maxSelections}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        maxSelections: parseInt(e.target.value, 10) || 30,
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                    disabled={isCreating}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">
                    Hạn chốt chọn ảnh (Tùy chọn)
                  </label>
                  <input
                    type="date"
                    value={createForm.deadlineAt}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, deadlineAt: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  Đường dẫn thư mục RAW trên NAS / Máy chủ (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={createForm.serverMountPath}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, serverMountPath: e.target.value })
                  }
                  placeholder="/mnt/nas/wedding_photos hoặc D:\RAW\Wedding_2026"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  disabled={isCreating}
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isCreating}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-950/40 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang quét Google Drive...</span>
                    </>
                  ) : (
                    <span>Tạo và quét ảnh</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export & Photographer Companion Drawer */}
      {activeExportAlbum && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-fade-in">
          <div
            className="absolute inset-0"
            onClick={() => setActiveExportAlbum(null)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-2xl bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col h-full z-10 overflow-y-auto">
            {/* Drawer Header */}
            <div className="p-5 border-b border-zinc-800 bg-zinc-950/80 sticky top-0 z-20 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-zinc-100">
                  Xuất File & Công Cụ Nhiếp Ảnh Gia
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Album: <span className="text-zinc-200 font-medium">{activeExportAlbum.title}</span> (
                  {activeExportAlbum.customerName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveExportAlbum(null)}
                className="p-2 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingExportData ? (
              <div className="p-16 text-center text-zinc-500 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-rose-500 mb-2" />
                <p className="text-xs">Đang tải dữ liệu lựa chọn và xuất file...</p>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* 1. QR Code & Client Link Sharing */}
                <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-4">
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-rose-500" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      1. Chia Sẻ Album Cho Khách Hàng
                    </h4>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    {/* Rendered Canvas QR Code */}
                    <div className="p-3 bg-white rounded-xl shadow-md flex-shrink-0">
                      <QRCodeCanvas
                        id={`qr-canvas-${activeExportAlbum.id}`}
                        value={`${window.location.origin}/albums/${activeExportAlbum.slug}`}
                        size={120}
                        level="H"
                        includeMargin={false}
                      />
                    </div>

                    <div className="space-y-3 w-full">
                      <p className="text-xs text-zinc-400">
                        Khách hàng quét mã QR bằng camera điện thoại hoặc nhấn liên kết bên dưới để chọn ảnh:
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/albums/${activeExportAlbum.slug}`}
                          className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 select-all font-mono"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              `${window.location.origin}/albums/${activeExportAlbum.slug}`,
                              'link'
                            )
                          }
                          className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center gap-1.5 transition-colors flex-shrink-0"
                        >
                          {copiedType === 'link' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedType === 'link' ? 'Đã chép' : 'Chép link'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleDownloadQR}
                        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Tải ảnh mã QR (PNG)</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Lightroom & Capture One 1-Click Filter Copy */}
                <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                        2. Lọc Ảnh Nhanh (Lightroom & Capture One)
                      </h4>
                    </div>
                    <span className="text-xs font-semibold text-rose-400">
                      {lightroomExport?.selectedCount ?? 0} ảnh đã chọn
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400">
                    Dán câu lệnh này vào ô tìm kiếm Text Filter (chọn Contains / Filename) để lọc ngay các ảnh khách đã chọn:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Lightroom Copy */}
                    <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200">
                          Adobe Lightroom
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(lightroomExport?.query || '', 'lightroom')
                          }
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-200 transition-colors"
                        >
                          {copiedType === 'lightroom' ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedType === 'lightroom' ? 'Đã chép' : 'Sao chép'}</span>
                        </button>
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400 truncate bg-zinc-950 px-2 py-1.5 rounded-lg border border-zinc-800/60">
                        {lightroomExport?.query || 'Chưa có ảnh chọn'}
                      </div>
                    </div>

                    {/* Capture One Copy */}
                    <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200">Capture One</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              (lightroomExport as any)?.captureOneQuery ||
                                lightroomExport?.query.replace(/,/g, '') ||
                                '',
                              'captureone'
                            )
                          }
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-200 transition-colors"
                        >
                          {copiedType === 'captureone' ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedType === 'captureone' ? 'Đã chép' : 'Sao chép'}</span>
                        </button>
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400 truncate bg-zinc-950 px-2 py-1.5 rounded-lg border border-zinc-800/60">
                        {(lightroomExport as any)?.captureOneQuery ||
                          lightroomExport?.query.replace(/,/g, '') ||
                          'Chưa có ảnh chọn'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Companion Scripts (.bat / .sh) */}
                <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-teal-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      3. Kịch Bản Tự Động Gom File RAW Offline
                    </h4>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Tải script và đặt vào thư mục chứa ảnh gốc RAW (CR3, ARW, NEF, DNG...). Chạy script để tự động tìm và copy đúng các file khách đã chọn sang thư mục riêng:
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={`/api/admin/albums/${activeExportAlbum.id}/export/script?os=win`}
                      download={`copy_raw_${activeExportAlbum.slug}.bat`}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-400" />
                      <span>Tải copy_raw.bat (Windows)</span>
                    </a>

                    <a
                      href={`/api/admin/albums/${activeExportAlbum.id}/export/script?os=mac`}
                      download={`copy_raw_${activeExportAlbum.slug}.sh`}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400" />
                      <span>Tải copy_raw.sh (macOS / Linux)</span>
                    </a>
                  </div>
                </div>

                {/* 4. NAS Server-Side RAW Copy */}
                <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      4. Sao Chép File RAW Trực Tiếp Trên NAS / Server
                    </h4>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Nếu bạn lưu trữ thư viện ảnh trên NAS hoặc ổ cứng gắn trực tiếp vào máy chủ, Shotpik có thể tự động sao chép file RAW sang thư mục `Selected_RAW`:
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={nasMountPath}
                        onChange={(e) => setNasMountPath(e.target.value)}
                        placeholder="Nhập đường dẫn mount NAS (ví dụ: /mnt/nas/albums/wedding hoặc D:\RAW)"
                        className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                      />
                      <button
                        type="button"
                        onClick={handleTriggerNasCopy}
                        disabled={isNasCopying || !nasMountPath.trim()}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
                      >
                        {isNasCopying ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FolderSync className="w-3.5 h-3.5" />
                        )}
                        <span>{isNasCopying ? 'Đang copy...' : 'Copy trên NAS'}</span>
                      </button>
                    </div>

                    {nasCopyResult && (
                      <div
                        className={`p-3 rounded-xl border text-xs ${
                          nasCopyResult.success
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                        }`}
                      >
                        <p className="font-semibold">
                          Đã sao chép: {nasCopyResult.copiedCount} file RAW vào thư mục đích.
                        </p>
                        {nasCopyResult.errors.length > 0 && (
                          <ul className="mt-1 list-disc list-inside text-rose-400 text-[11px]">
                            {nasCopyResult.errors.map((e, idx) => (
                              <li key={idx}>{e}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. Client Feedback Inspector */}
                <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-rose-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                        5. Chi Tiết Lựa Chọn & Yêu Cầu Chỉnh Sửa ({selectedPhotosWithFeedback.length})
                      </h4>
                    </div>
                  </div>

                  {selectedPhotosWithFeedback.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">
                      Khách hàng chưa chọn ảnh nào hoặc chưa có ghi chú chỉnh sửa.
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                      {selectedPhotosWithFeedback.map((item) => {
                        if (!item) return null;
                        const { photo, likedChoosers, comments, brushNotes } = item;

                        return (
                          <div
                            key={photo.id}
                            className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row items-start gap-3.5"
                          >
                            <img
                              src={photo.thumbUrl}
                              alt={photo.fileName}
                              className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-zinc-700/80 flex-shrink-0"
                            />

                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-bold text-zinc-200 truncate">
                                  {photo.fileName}
                                </span>

                                {/* Chooser badges */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  {likedChoosers.map((c: any) => (
                                    <span
                                      key={c.id}
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                                      style={{
                                        color: c.color || '#e11d48',
                                        backgroundColor: `${c.color || '#e11d48'}15`,
                                        borderColor: `${c.color || '#e11d48'}30`,
                                      }}
                                    >
                                      <span
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: c.color || '#e11d48' }}
                                      />
                                      {c.name}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Comments list */}
                              {comments.length > 0 && (
                                <div className="space-y-1">
                                  {comments.map((cmt) => (
                                    <div
                                      key={cmt.id}
                                      className="text-xs text-zinc-300 bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/60 flex items-start gap-1.5"
                                    >
                                      <MessageSquare className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                                      <div className="min-w-0 flex-1">
                                        {cmt.tag && (
                                          <span className="text-[10px] font-bold text-rose-400 mr-1.5 bg-rose-500/10 px-1.5 py-0.2 rounded">
                                            {cmt.tag}
                                          </span>
                                        )}
                                        <span className="text-zinc-300">{cmt.text}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Brush notes preview button */}
                              {brushNotes.length > 0 && (
                                <div className="pt-1">
                                  <button
                                    type="button"
                                    onClick={() => openBrushPreview(photo, brushNotes[0])}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium transition-colors"
                                  >
                                    <Paintbrush className="w-3 h-3 text-rose-400" />
                                    <span>Xem hình vẽ khoanh vùng ({brushNotes.length})</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Brush Note Preview Modal */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
              <div className="flex items-center gap-2">
                <Paintbrush className="w-4 h-4 text-rose-500" />
                <span className="font-semibold text-xs sm:text-sm text-zinc-100">
                  Xem ghi chú khoanh vùng: {previewPhoto.fileName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative flex-1 p-4 flex items-center justify-center bg-zinc-950 overflow-hidden">
              <div className="relative inline-block max-w-full max-h-[75vh]">
                <img
                  ref={previewImgRef}
                  src={previewPhoto.fullUrl || previewPhoto.thumbUrl}
                  alt={previewPhoto.fileName}
                  onLoad={drawPreviewStrokes}
                  className="max-w-full max-h-[75vh] object-contain rounded shadow-2xl block"
                />
                <canvas
                  ref={previewCanvasRef}
                  className="absolute inset-0 pointer-events-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
