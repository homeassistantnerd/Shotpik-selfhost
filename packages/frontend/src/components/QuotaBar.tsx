import React from 'react';
import { Chooser } from '@shotpik/shared';
import { Lock, CheckCircle2, Filter, Heart, MessageSquare, Layers, User } from 'lucide-react';

export type FilterTab = 'all' | 'selected' | 'notes';

export interface QuotaBarProps {
  selectedCount: number;
  maxSelections: number;
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  activeChooserFilter: string | null;
  onChooserFilterChange: (chooserId: string | null) => void;
  choosers: Chooser[];
  subGalleries?: string[];
  activeSubGallery?: string | null;
  onSubGalleryChange?: (subGallery: string | null) => void;
  isLocked: boolean;
  onFinishAlbum: () => void;
  isFinishing?: boolean;
  activeChooser?: Chooser | null;
  onOpenChooserModal?: () => void;
}

export const QuotaBar: React.FC<QuotaBarProps> = ({
  selectedCount,
  maxSelections,
  activeTab,
  onTabChange,
  activeChooserFilter,
  onChooserFilterChange,
  choosers,
  subGalleries = [],
  activeSubGallery = null,
  onSubGalleryChange,
  isLocked,
  onFinishAlbum,
  isFinishing = false,
  activeChooser,
  onOpenChooserModal,
}) => {
  const percentage = Math.min(
    100,
    maxSelections > 0 ? Math.round((selectedCount / maxSelections) * 100) : 0
  );

  // Dynamic color threshold: emerald -> amber -> rose
  let progressColor = 'bg-emerald-500';
  let badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

  if (selectedCount >= maxSelections) {
    progressColor = 'bg-rose-500';
    badgeColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  } else if (percentage >= 70) {
    progressColor = 'bg-amber-500';
    badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  }

  return (
    <div className="sticky top-0 z-40 w-full bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6">
        {/* Top row: Quota & Finish action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/60">
          {/* Quota status */}
          <div className="flex-1 w-full sm:w-auto">
            <div className="flex items-center justify-between sm:justify-start gap-3 mb-1.5">
              <span className="text-xs sm:text-sm font-semibold text-zinc-200">
                Đã chọn{' '}
                <span className={`font-bold px-2 py-0.5 rounded-full border text-xs sm:text-sm ${badgeColor}`}>
                  {selectedCount} / {maxSelections}
                </span>{' '}
                ảnh
              </span>
              <span className="text-xs text-zinc-400">{percentage}% hạn mức</span>
            </div>

            {/* Dynamic Progress Bar */}
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ease-out rounded-full ${progressColor}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* User selector & Finish button */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {onOpenChooserModal && (
              <button
                type="button"
                onClick={onOpenChooserModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 hover:bg-zinc-800 text-xs text-zinc-200 transition-colors"
                title="Đổi người chọn ảnh"
              >
                {activeChooser ? (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: activeChooser.color || '#e11d48' }}
                    />
                    <span className="font-medium max-w-[100px] truncate">{activeChooser.name}</span>
                  </>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Chọn vai trò</span>
                  </>
                )}
              </button>
            )}

            {isLocked ? (
              <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-zinc-300 text-xs font-semibold">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Đã khoá album</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onFinishAlbum}
                disabled={isFinishing || selectedCount === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
              >
                {isFinishing ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Hoàn tất chọn ảnh</span>
              </button>
            )}
          </div>
        </div>

        {/* Bottom row: Filter Tabs & Sub-gallery Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5">
          {/* Main Filter Tabs */}
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => onTabChange('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => onTabChange('selected')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'selected'
                  ? 'bg-rose-500/20 text-rose-300 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Heart className="w-3 h-3 fill-current" />
              <span>Đã chọn ({selectedCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('notes')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'notes'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Có ghi chú</span>
            </button>
          </div>

          {/* Right controls: Chooser filter dropdown & subgalleries */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Chooser Filter */}
            {choosers.length > 0 && (
              <div className="flex items-center gap-1 bg-zinc-900 px-2 py-1 rounded-xl border border-zinc-800 text-xs">
                <Filter className="w-3 h-3 text-zinc-400" />
                <select
                  value={activeChooserFilter || ''}
                  onChange={(e) => onChooserFilterChange(e.target.value ? e.target.value : null)}
                  className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer pr-1"
                >
                  <option value="" className="bg-zinc-900 text-zinc-200">
                    Tất cả người chọn
                  </option>
                  {choosers.map((c) => (
                    <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-200">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Optional Sub-gallery tabs row */}
        {subGalleries.length > 0 && onSubGalleryChange && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-1 scrollbar-none border-t border-zinc-800/40 mt-2">
            <span className="text-zinc-500 text-xs flex items-center gap-1 mr-1 flex-shrink-0">
              <Layers className="w-3 h-3" />
              Phần:
            </span>
            <button
              type="button"
              onClick={() => onSubGalleryChange(null)}
              className={`text-xs px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors ${
                activeSubGallery === null
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-100 font-medium'
                  : 'bg-zinc-900/50 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Toàn bộ album
            </button>
            {subGalleries.map((gallery) => (
              <button
                key={gallery}
                type="button"
                onClick={() => onSubGalleryChange(gallery)}
                className={`text-xs px-2.5 py-1 rounded-lg border whitespace-nowrap transition-colors ${
                  activeSubGallery === gallery
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-100 font-medium'
                    : 'bg-zinc-900/50 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {gallery}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
