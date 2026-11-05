import React from 'react';
import { SearchX, RotateCcw } from 'lucide-react';

interface EmptyFilterStateProps {
  message?: string;
  submessage?: string;
  onReset: () => void;
  className?: string;
}

export const EmptyFilterState: React.FC<EmptyFilterStateProps> = ({
  message = "Aucun résultat trouvé pour ces critères",
  submessage = "Essayez d'ajuster vos filtres de recherche ou réinitialisez-les pour afficher toutes les données.",
  onReset,
  className = "p-8"
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-zinc-900 text-slate-400 dark:text-zinc-500 flex items-center justify-center mb-3.5 shadow-2xs border border-slate-200/60 dark:border-zinc-800">
        <SearchX size={26} className="text-slate-400 dark:text-zinc-500" />
      </div>
      <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200 tracking-tight">{message}</h4>
      <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mt-1 mb-4 leading-relaxed">{submessage}</p>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 hover:text-blue-800 dark:text-blue-400 text-xs font-bold rounded-xl border border-blue-200 dark:border-blue-800/40 transition-colors shadow-2xs cursor-pointer active:scale-95"
      >
        <RotateCcw size={14} />
        Réinitialiser les filtres
      </button>
    </div>
  );
};
