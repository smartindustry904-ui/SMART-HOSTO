import React from 'react';

export type StatusType = 
  | 'critical' | 'unpaid' | 'error' | 'rejected' | 'danger'
  | 'urgent' | 'pending' | 'warning' | 'low_stock' | 'partial'
  | 'normal' | 'paid' | 'success' | 'delivered' | 'valid' | 'in_stock'
  | 'info' | 'primary' | 'in_progress' | 'scheduled' | 'neutral';

interface MedicalStatusBadgeProps {
  status: StatusType | string;
  label?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  className?: string;
}

export const MedicalStatusBadge: React.FC<MedicalStatusBadgeProps> = ({
  status,
  label,
  icon,
  size = 'md',
  dot = true,
  className = ''
}) => {
  const norm = (status || '').toLowerCase().trim();

  let colorClasses = 'bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800';
  let dotColor = 'bg-slate-400 dark:bg-zinc-500';
  let displayLabel = label || status;

  // Red Category: Critical, Error, Unpaid, Non-payé, Danger, Rupture
  if (
    norm.includes('critique') || 
    norm.includes('critical') || 
    norm.includes('non_paye') || 
    norm.includes('unpaid') || 
    norm.includes('error') || 
    norm.includes('danger') || 
    norm.includes('refuse') || 
    norm.includes('rupture') ||
    norm === 'out_of_stock'
  ) {
    colorClasses = 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200/80 dark:border-rose-900/50';
    dotColor = 'bg-rose-500';
  }
  // Orange/Amber/Yellow Category: Urgent, Warning, Pending, En attente, Low Stock, Partiel
  else if (
    norm.includes('urgent') || 
    norm.includes('warning') || 
    norm.includes('pending') || 
    norm.includes('attente') || 
    norm.includes('low_stock') || 
    norm.includes('partiel') ||
    norm.includes('reappro') ||
    norm === 'partial'
  ) {
    colorClasses = 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border-amber-200/80 dark:border-amber-900/50';
    dotColor = 'bg-amber-500';
  }
  // Green Category: Normal, Paid, Payé, Solde, Validé, Succès, Livré, In Stock
  else if (
    norm.includes('solde') || 
    norm.includes('paye') || 
    norm.includes('paid') || 
    norm.includes('normal') || 
    norm.includes('valide') || 
    norm.includes('success') || 
    norm.includes('livre') || 
    norm.includes('delivered') ||
    norm.includes('disponible') ||
    norm === 'in_stock'
  ) {
    colorClasses = 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-900/50';
    dotColor = 'bg-emerald-500';
  }
  // Blue Category: Primary, Info, En cours, Consultation, Planifié
  else if (
    norm.includes('info') || 
    norm.includes('primary') || 
    norm.includes('en_cours') || 
    norm.includes('consultation') || 
    norm.includes('planifie') || 
    norm.includes('processing')
  ) {
    colorClasses = 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200/80 dark:border-blue-900/50';
    dotColor = 'bg-blue-500';
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3.5 py-1.5 text-sm'
  }[size];

  return (
    <span 
      className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider rounded-full border whitespace-nowrap transition-colors ${sizeClasses} ${colorClasses} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0 animate-pulse`} />}
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{displayLabel}</span>
    </span>
  );
};

export default MedicalStatusBadge;
