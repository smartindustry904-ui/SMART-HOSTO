import React, { useState } from 'react';
import { AvatarPlaceholder } from './AvatarPlaceholder';

export interface AvatarProps {
  user?: {
    profile_image_url?: string | null;
    profileImage?: string | null;
    name?: string;
    username?: string;
  } | null;
  src?: string | null;
  alt?: string;
  size?: number | string;
  className?: string;
  imageClassName?: string;
  iconSize?: number;
  roundedClassName?: string;
}

/**
 * Universal Enterprise Avatar Component.
 * - If user.profile_image_url (or src/profileImage) exists, renders uploaded thumbnail with object-cover.
 * - If null, empty, or fails to load, strictly falls back to AvatarPlaceholder.
 */
export const Avatar: React.FC<AvatarProps> = ({
  user,
  src,
  alt,
  size = 40,
  className = '',
  imageClassName = '',
  iconSize,
  roundedClassName = 'rounded-full'
}) => {
  const [loadFailed, setLoadFailed] = useState(false);

  // Read URL prioritizing profile_image_url then profileImage / explicit src
  const rawUrl = src || user?.profile_image_url || user?.profileImage;
  const hasValidImage = !loadFailed && rawUrl && rawUrl.trim().length > 0;
  const displayName = alt || user?.name || user?.username || 'Utilisateur';

  const isNumberSize = typeof size === 'number';
  const sizeStyle = isNumberSize ? { width: `${size}px`, height: `${size}px` } : undefined;
  const sizeClass = !isNumberSize ? (size || 'w-10 h-10') : '';

  if (hasValidImage) {
    return (
      <div
        style={sizeStyle}
        className={`relative shrink-0 overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-[#111111] dark:border dark:border-gray-800 ${roundedClassName} ${sizeClass} ${className}`}
      >
        <img
          src={rawUrl}
          alt={displayName}
          onError={() => setLoadFailed(true)}
          className={`w-full h-full object-cover ${roundedClassName} ${imageClassName}`}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <AvatarPlaceholder
      size={size}
      className={`${roundedClassName} ${className}`}
      iconSize={iconSize}
      alt={displayName}
    />
  );
};

export default Avatar;
