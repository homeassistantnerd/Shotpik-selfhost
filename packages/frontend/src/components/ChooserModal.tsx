import React, { useState } from 'react';
import { Chooser } from '@shotpik/shared';
import { Plus, X, Check, Users } from 'lucide-react';

export interface ChooserModalProps {
  isOpen: boolean;
  onClose?: () => void;
  choosers: Chooser[];
  activeChooserId: string | null;
  onSelectChooser: (chooserId: string) => void;
  onCreateChooser: (name: string, color: string) => Promise<void> | void;
  isCreating?: boolean;
}

const DEFAULT_ROLES = [
  'Cô dâu',
  'Chú rể',
  'Mẹ cô dâu',
  'Mẹ chú rể',
  'Gia đình / Bạn bè',
];

const COLOR_SWATCHES = [
  '#e11d48', // rose-600
  '#2563eb', // blue-600
  '#16a34a', // green-600
  '#d97706', // amber-600
  '#9333ea', // purple-600
  '#06b6d4', // cyan-500
];

export const ChooserModal: React.FC<ChooserModalProps> = ({
  isOpen,
  onClose,
  choosers,
  activeChooserId,
  onSelectChooser,
  onCreateChooser,
  isCreating = false,
}) => {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Vui lòng nhập tên người chọn ảnh');
      return;
    }

    try {
      setError(null);
      await onCreateChooser(trimmedName, selectedColor);
      setName('');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Không thể tạo người chọn mới');
      }
    }
  };

  const handleSelectRole = (role: string) => {
    setName(role);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chooser-modal-title"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 id="chooser-modal-title" className="text-xl font-bold text-zinc-100">
                Bạn là ai?
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Chọn người đang chọn ảnh hoặc tạo hồ sơ mới
              </p>
            </div>
          </div>
          {onClose && activeChooserId && (
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Existing Choosers List */}
          {choosers.length > 0 && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-3">
                Người chọn đã tham gia ({choosers.length})
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {choosers.map((chooser) => {
                  const isActive = chooser.id === activeChooserId;
                  const chooserColor = chooser.color || '#e11d48';
                  return (
                    <button
                      key={chooser.id}
                      type="button"
                      onClick={() => onSelectChooser(chooser.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        isActive
                          ? 'bg-zinc-800/90 border-zinc-600 shadow-md ring-1 ring-zinc-500'
                          : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-800/50 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: chooserColor }}
                        />
                        <span className="font-medium text-sm text-zinc-200 truncate">
                          {chooser.name}
                        </span>
                      </div>
                      {isActive && (
                        <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <Check className="w-3.5 h-3.5" />
                          Đang chọn
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* New Chooser Form */}
          <div className="pt-2 border-t border-zinc-800/60">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-3">
              {choosers.length > 0 ? 'Hoặc thêm người mới' : 'Tạo hồ sơ người chọn'}
            </label>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Quick suggestions */}
              <div>
                <span className="text-xs text-zinc-400 mb-2 block">Gợi ý vai trò:</span>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleSelectRole(role)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        name === role
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-medium'
                          : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name Input */}
              <div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Nhập tên người chọn..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500"
                  maxLength={50}
                  disabled={isCreating}
                />
              </div>

              {/* Color Swatches */}
              <div>
                <span className="text-xs text-zinc-400 mb-2 block">Màu đại diện:</span>
                <div className="flex items-center gap-3">
                  {COLOR_SWATCHES.map((color) => {
                    const isSelected = selectedColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSelectedColor(color)}
                        className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${
                          isSelected
                            ? 'ring-2 ring-offset-2 ring-offset-zinc-900 ring-white scale-110'
                            : 'hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Chọn màu ${color}`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="p-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isCreating || !name.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:hover:bg-rose-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-rose-950/50 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>Thêm người chọn này</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
