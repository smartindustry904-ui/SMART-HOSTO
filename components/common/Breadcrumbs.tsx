import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onHomeClick?: () => void;
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, onHomeClick, className = '' }) => {
  return (
    <nav 
      aria-label="Fil d'Ariane" 
      className={`flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-zinc-300 overflow-x-auto py-0.5 px-0.5 custom-scrollbar ${className}`}
    >
      {onHomeClick && (
        <button
          onClick={onHomeClick}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
          title="Accueil Dashboard"
        >
          <Home size={13} />
          <span className="sr-only">Accueil</span>
        </button>
      )}

      {items.map((item, index) => {
        const isLast = index === items.length - 1 || item.active;
        return (
          <React.Fragment key={index}>
            {(index > 0 || onHomeClick) && (
              <ChevronRight size={13} className="text-slate-400 dark:text-zinc-600 shrink-0" />
            )}
            {item.onClick && !isLast ? (
              <button
                onClick={item.onClick}
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors px-2 py-0.5 rounded-lg hover:bg-slate-100/90 dark:hover:bg-white/5 cursor-pointer whitespace-nowrap text-slate-600 dark:text-zinc-300 font-bold text-xs"
              >
                {item.label}
              </button>
            ) : (
              <span className={`px-2 py-0.5 rounded-lg whitespace-nowrap text-xs ${
                isLast 
                  ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-extrabold border border-blue-200/80 dark:border-blue-400/30 shadow-2xs dark:shadow-[0_0_12px_rgba(59,130,246,0.2)]' 
                  : 'text-slate-600 dark:text-zinc-300 font-bold'
              }`}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default Breadcrumbs;
