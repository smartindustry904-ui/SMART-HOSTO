import React from 'react';
import { User } from 'lucide-react';

export interface AvatarPlaceholderProps {
  size?: number | string;
  className?: string;
  iconSize?: number;
  alt?: string;
}

/**
 * Universal "no-face" SVG avatar placeholder component.
 * Enterprise-grade, sleek neutral circle:
 * - Light mode: bg-gray-100 text-gray-400
 * - Dark mode: dark:bg-[#111111] dark:text-gray-600 dark:border dark:border-gray-800
 */
export const AvatarPlaceholder: React.FC<AvatarPlaceholderProps> = ({
  size = 40,
  className = '',
  iconSize,
  alt = 'Utilisateur'
}) => {
  const isNumberSize = typeof size === 'number';
  const computedIconSize = iconSize || (isNumberSize ? Math.max(12, Math.round(size * 0.52)) : 18);
  const sizeStyle = isNumberSize ? { width: `${size}px`, height: `${size}px` } : undefined;
  const sizeClass = !isNumberSize ? (size || 'w-10 h-10') : '';

  return (
    <div
      role="img"
      aria-label={alt}
      style={sizeStyle}
      className={`rounded-full flex items-center justify-center shrink-0 select-none bg-gray-100 text-gray-400 dark:bg-[#111111] dark:text-gray-600 dark:border dark:border-gray-800 transition-colors overflow-hidden ${sizeClass} ${className}`}
    >
      <User size={computedIconSize} strokeWidth={1.8} className="shrink-0" />
    </div>
  );
};

export default AvatarPlaceholder;
