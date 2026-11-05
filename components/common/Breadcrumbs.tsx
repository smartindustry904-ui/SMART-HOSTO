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
      className={`flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-zinc-400 overflow-x-auto py-1 px-1 custom-scrollbar ${className}`}
    >
      {onHomeClick && (
        <button
          onClick={onHomeClick}
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-blue-500 dark:text-zinc-500 dark:hover:text-blue-400 transition-colors p-1 rounded-lg hover:bg-slate-100/80 dark:hover:bg-zinc-800 cursor-pointer"
          title="Accueil Dashboard"
        >
          <Home size={14} />
          <span className="sr-only">Accueil</span>
        </button>
      )}

      {items.map((item, index) => {
        const isLast = index === items.length - 1 || item.active;
        return (
          <React.Fragment key={index}>
            {(index > 0 || onHomeClick) && (
              <ChevronRight size={13} className="text-slate-300 dark:text-zinc-700 shrink-0" />
            )}
            {item.onClick && !isLast ? (
              <button
                onClick={item.onClick}
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors px-2 py-0.5 rounded-lg hover:bg-slate-100/80 dark:hover:bg-zinc-800 cursor-pointer whitespace-nowrap text-slate-600 dark:text-zinc-300 font-medium"
              >
                {item.label}
              </button>
            ) : (
              <span className={`px-2 py-0.5 rounded-lg whitespace-nowrap ${
                isLast 
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-black border border-blue-100/80 dark:border-blue-800/60' 
                  : 'text-slate-500 dark:text-zinc-400 font-medium'
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
