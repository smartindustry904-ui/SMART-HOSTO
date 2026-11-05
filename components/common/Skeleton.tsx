import React from 'react';

interface SkeletonProps {
  className?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4 w-full', count = 1 }) => {
  if (count === 1) {
    return (
      <div 
        className={`animate-pulse bg-slate-200/80 dark:bg-zinc-800/80 rounded-xl ${className}`} 
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="space-y-2 w-full">
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className={`animate-pulse bg-slate-200/80 dark:bg-zinc-800/80 rounded-xl ${className}`} 
          aria-hidden="true"
        />
      ))}
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({ rows = 5, columns = 4 }) => {
  return (
    <div className="w-full bg-white dark:bg-[#111111] rounded-3xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-none">
      <div className="p-5 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-slate-50/50 dark:bg-black/40">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-32 rounded-xl" />
      </div>
      <div className="p-6 space-y-4">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 py-2 border-b border-slate-50 dark:border-zinc-800/50 last:border-0">
            <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
            <div className="flex-1 grid grid-cols-3 sm:grid-cols-4 gap-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3 hidden sm:block" />
            </div>
            <Skeleton className="h-8 w-20 rounded-xl shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="bg-white dark:bg-[#111111] rounded-3xl border border-slate-200 dark:border-zinc-800 p-6 shadow-none space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-3 w-48" />
    </div>
  );
};

export default Skeleton;
