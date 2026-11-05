import React, { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, CheckCircle2 } from 'lucide-react';
import { uploadProfilePhotoToStorage } from '../../src/firebase';
import { AvatarPlaceholder } from './AvatarPlaceholder';

export interface ImageUploadProps {
  currentImageUrl?: string | null;
  userId?: string;
  onImageUploaded: (url: string) => void;
  onImageRemoved?: () => void;
  label?: string;
  className?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  currentImageUrl,
  userId = 'user',
  onImageUploaded,
  onImageRemoved,
  label = 'Photo de profil',
  className = ''
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner un fichier image valide (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('L\'image dépasse la taille maximale autorisée (5 Mo).');
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadSuccess(false);

    try {
      const url = await uploadProfilePhotoToStorage(userId, file);
      onImageUploaded(url);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      console.error('Image upload failed:', err);
      setError('Échec du téléchargement de l\'image. Veuillez réessayer.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
          {label}
        </label>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Preview / Avatar Display */}
        <div className="relative group shrink-0">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-slate-200 dark:border-zinc-800 shadow-sm flex items-center justify-center bg-gray-100 dark:bg-[#111111]">
            {isUploading ? (
              <div className="w-full h-full flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
                <Loader2 className="animate-spin text-white" size={24} />
              </div>
            ) : currentImageUrl ? (
              <img
                src={currentImageUrl}
                alt="Aperçu du profil"
                className="w-full h-full object-cover"
              />
            ) : (
              <AvatarPlaceholder size={80} iconSize={36} />
            )}
          </div>

          {currentImageUrl && !isUploading && onImageRemoved && (
            <button
              type="button"
              onClick={onImageRemoved}
              className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-md transition-colors cursor-pointer"
              title="Supprimer la photo"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Upload Drop Zone & Controls */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex-1 w-full border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
              : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-slate-50/60 dark:bg-zinc-900/40'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleChange}
            disabled={isUploading}
          />

          <div className="flex flex-col items-center justify-center gap-1">
            {isUploading ? (
              <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                <Loader2 className="animate-spin" size={16} />
                <span>Téléversement vers le serveur de stockage...</span>
              </div>
            ) : uploadSuccess ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={16} />
                <span>Photo mise à jour avec succès!</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-300">
                  <Upload size={14} className="text-blue-600 dark:text-blue-400" />
                  <span>Glissez-déposez ou cliquez pour choisir</span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500">
                  PNG, JPG ou WebP (max. 5 Mo)
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-1">
          {error}
        </p>
      )}
    </div>
  );
};

export default ImageUpload;
