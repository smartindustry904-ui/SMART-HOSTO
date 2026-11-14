import React from 'react';
import { CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { PaymentBadgeCode, ResolvedPaymentBadge } from '../utils/visitCycle';

interface PaymentStatusBadgeProps {
  status: ResolvedPaymentBadge | PaymentBadgeCode;
  size?: 'xs' | 'sm';
  className?: string;
}

const STYLE_MAP: Record<PaymentBadgeCode, { bg: string; label: string; Icon: any }> = {
  PAID: {
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: 'PAYÉ',
    Icon: CheckCircle2,
  },
  EXONERE: {
    bg: 'bg-blue-50 text-blue-700 border-blue-200',
    label: 'EXONÉRÉ / SUIVI',
    Icon: Sparkles,
  },
  PENDING: {
    bg: 'bg-rose-50 text-rose-700 border-rose-200',
    label: 'EN ATTENTE CAISSE',
    Icon: Clock,
  },
};

export const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({
  status,
  size = 'xs',
  className = '',
}) => {
  const rawCode = typeof status === 'string' ? status : status.code;
  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-1 text-[10px] gap-1.5'
      : 'px-2 py-0.5 text-[9px] gap-1';

  // Strict mutually exclusive financial badge rendering
  if (rawCode === 'EXONERE') {
    const cfg = STYLE_MAP.EXONERE;
    const Icon = cfg.Icon;
    return (
      <span
        className={`inline-flex items-center font-black uppercase tracking-wider rounded-lg border whitespace-nowrap ${cfg.bg} ${sizeClasses} ${className}`}
        title={`Statut financier : ${cfg.label}`}
      >
        <Icon size={size === 'sm' ? 12 : 10} />
        {cfg.label}
      </span>
    );
  } else if (rawCode === 'PAID') {
    const cfg = STYLE_MAP.PAID;
    const Icon = cfg.Icon;
    return (
      <span
        className={`inline-flex items-center font-black uppercase tracking-wider rounded-lg border whitespace-nowrap ${cfg.bg} ${sizeClasses} ${className}`}
        title={`Statut financier : ${cfg.label}`}
      >
        <Icon size={size === 'sm' ? 12 : 10} />
        {cfg.label}
      </span>
    );
  } else {
    const cfg = STYLE_MAP.PENDING;
    const Icon = cfg.Icon;
    return (
      <span
        className={`inline-flex items-center font-black uppercase tracking-wider rounded-lg border whitespace-nowrap ${cfg.bg} ${sizeClasses} ${className}`}
        title={`Statut financier : ${cfg.label}`}
      >
        <Icon size={size === 'sm' ? 12 : 10} />
        {cfg.label}
      </span>
    );
  }
};
