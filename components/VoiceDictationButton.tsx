import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';

interface VoiceDictationButtonProps {
  onTranscript: (transcribedText: string) => void;
  currentValue?: string;
  fieldLabel?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'inline' | 'button';
  appendMode?: boolean;
}

export const VoiceDictationButton: React.FC<VoiceDictationButtonProps> = ({
  onTranscript,
  currentValue = '',
  fieldLabel = '',
  className = '',
  size = 'sm',
  variant = 'button',
  appendMode = true
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  const toggleListening = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("La reconnaissance vocale Web Speech API n'est pas prise en charge par ce navigateur. Veuillez utiliser Google Chrome ou Microsoft Edge pour la dictée vocale directe.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (err) {
          console.warn('Error stopping speech recognition:', err);
        }
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'fr-FR';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript + ' ';
          }
        }

        const cleanTranscript = transcript.trim();
        if (cleanTranscript) {
          if (appendMode) {
            const separator = currentValue && !currentValue.endsWith(' ') && !currentValue.endsWith('\n') ? ' ' : '';
            const newText = currentValue ? `${currentValue}${separator}${cleanTranscript}` : cleanTranscript;
            onTranscript(newText);
          } else {
            onTranscript(cleanTranscript);
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          alert("L'accès au microphone a été refusé. Veuillez autoriser l'accès au microphone dans les paramètres de votre navigateur pour activer la dictée.");
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  const sizeClasses = {
    sm: 'text-[11px] px-2.5 py-1 gap-1.5',
    md: 'text-xs px-3 py-1.5 gap-2',
    lg: 'text-sm px-4 py-2 gap-2.5'
  };

  const iconSizes = {
    sm: 13,
    md: 15,
    lg: 18
  };

  if (!isSupported) {
    return (
      <span 
        title="Dictée vocale non supportée sur ce navigateur"
        className={`inline-flex items-center text-slate-300 cursor-not-allowed opacity-60 ${className}`}
      >
        <MicOff size={iconSizes[size]} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      className={`inline-flex items-center rounded-xl font-black uppercase tracking-wider select-none cursor-pointer transition-all ${sizeClasses[size]} ${
        isListening
          ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-500/40 ring-2 ring-rose-400/80 border border-rose-300'
          : 'bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 shadow-xs'
      } ${className}`}
      title={isListening ? 'Dictée en cours d\'écoute... Cliquez pour arrêter' : `Activer la dictée vocale pour ${fieldLabel || 'ce champ'}`}
    >
      <span className="relative flex items-center justify-center">
        <Mic size={iconSizes[size]} className={isListening ? 'animate-bounce text-white' : ''} />
        {isListening && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white animate-ping" />
        )}
      </span>
      <span>{isListening ? 'Écoute...' : 'Dicter'}</span>
    </button>
  );
};

export default VoiceDictationButton;
