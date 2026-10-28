import React, { useState } from 'react';
import { Photo, Chooser, Comment } from '@shotpik/shared';
import { X, Send, Trash2, MessageSquare, Tag, AlertCircle } from 'lucide-react';

export interface CommentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  photo: Photo | null;
  comments: Comment[];
  choosers: Chooser[];
  activeChooser: Chooser | null;
  onAddComment: (photoId: string, text: string, tag?: string | null) => Promise<void> | void;
  onDeleteComment?: (commentId: string) => Promise<void> | void;
  isSubmitting?: boolean;
}

const RETOUCH_PRESETS = [
  '#Làm mịn da',
  '#Bóp eo / Thon dáng',
  '#Xoá người / vật thể',
  '#Chỉnh sáng / màu',
  '#Sửa mắt / nụ cười',
  '#Làm rõ nét',
];

export const CommentDrawer: React.FC<CommentDrawerProps> = ({
  isOpen,
  onClose,
  photo,
  comments,
  choosers,
  activeChooser,
  onAddComment,
  onDeleteComment,
  isSubmitting = false,
}) => {
  const [text, setText] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !photo) {
    return null;
  }

  // Filter comments for this photo
  const photoComments = comments.filter((c) => c.photoId === photo.id);

  const chooserMap = new Map(choosers.map((c) => [c.id, c]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChooser) {
      setError('Vui lòng chọn người chọn ảnh trước khi thêm ghi chú');
      return;
    }

    const trimmedText = text.trim();
    if (!trimmedText && !selectedTag) {
      setError('Vui lòng nhập nội dung ghi chú hoặc chọn thẻ yêu cầu');
      return;
    }

    try {
      setError(null);
      await onAddComment(
        photo.id,
        trimmedText || (selectedTag ? `Yêu cầu: ${selectedTag}` : ''),
        selectedTag
      );
      setText('');
      setSelectedTag(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Không thể gửi ghi chú');
      }
    }
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTag((prev) => (prev === tag ? null : tag));
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm animate-fade-in flex justify-end">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Drawer Container */}
      <div className="relative w-full sm:max-w-md bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col h-full z-10">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={photo.thumbUrl}
              alt={photo.fileName}
              className="w-12 h-12 object-cover rounded-lg border border-zinc-700/80 flex-shrink-0"
            />
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-zinc-100 truncate" title={photo.fileName}>
                {photo.fileName}
              </h3>
              <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
                <MessageSquare className="w-3.5 h-3.5 text-rose-400" />
                <span>{photoComments.length} ghi chú chỉnh sửa</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0"
            aria-label="Đóng ghi chú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {photoComments.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
              <div className="p-3 bg-zinc-800/50 rounded-2xl mb-3">
                <MessageSquare className="w-8 h-8 text-zinc-400 stroke-1" />
              </div>
              <p className="text-sm font-medium text-zinc-300">Chưa có ghi chú nào</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-[240px]">
                Chọn thẻ yêu cầu nhanh hoặc nhập ghi chú chi tiết bên dưới cho studio.
              </p>
            </div>
          ) : (
            photoComments.map((comment) => {
              const chooser = chooserMap.get(comment.chooserId);
              const chooserColor = chooser?.color || '#e11d48';
              const canDelete =
                onDeleteComment && (activeChooser?.id === comment.chooserId || !comment.chooserId);

              return (
                <div
                  key={comment.id}
                  className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 shadow-sm space-y-2 group hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: chooserColor }}
                      />
                      <span className="text-xs font-semibold text-zinc-200 truncate">
                        {chooser?.name || 'Khách'}
                      </span>
                      <span className="text-[10px] text-zinc-400 flex-shrink-0">
                        {formatTimestamp(comment.createdAt)}
                      </span>
                    </div>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDeleteComment(comment.id)}
                        className="opacity-60 hover:opacity-100 p-1 text-zinc-400 hover:text-rose-400 rounded transition-all"
                        title="Xoá ghi chú này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {comment.tag && (
                    <div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20">
                        <Tag className="w-2.5 h-2.5" />
                        {comment.tag}
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
                    {comment.text}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Input Form with 1-tap Vietnamese Retouch Presets */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/95 space-y-3">
          {/* Preset Tags */}
          <div>
            <div className="text-xs font-medium text-zinc-400 mb-2 flex items-center justify-between">
              <span>Yêu cầu nhanh:</span>
              {selectedTag && (
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-300"
                >
                  Bỏ chọn thẻ
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RETOUCH_PRESETS.map((tag) => {
                const isSelected = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-rose-500 text-white font-medium border-rose-400 shadow-md shadow-rose-950/50 scale-105'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div>
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                rows={2}
                placeholder="Nhập ghi chú chi tiết cho studio (ví dụ: bóp eo bên trái, xoá chai nước)..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 resize-none"
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="flex items-center gap-1.5 p-2.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-zinc-400 truncate">
                {activeChooser ? (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                      style={{ backgroundColor: activeChooser.color || '#e11d48' }}
                    />
                    <span className="truncate">Tư cách: {activeChooser.name}</span>
                  </span>
                ) : (
                  <span className="text-amber-400">Chưa chọn vai trò</span>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || (!text.trim() && !selectedTag)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-xs font-semibold shadow-md transition-all cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
              >
                {isSubmitting ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Thêm ghi chú</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
