import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Square, Play, Pause, Trash2, Check, AlertCircle, Volume2 } from 'lucide-react';

interface VoiceNoteRecorderProps {
  onSaveVoiceNote: (audioUrl: string, durationSec: number, transcript: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

export const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({
  onSaveVoiceNote,
  onCancel,
  disabled = false
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Clean up timer and streams on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    setErrorMessage(null);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
    audioChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage("L'accès au microphone n'est pas pris en charge par ce navigateur.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop all audio tracks to release microphone
        stream.getTracks().forEach(track => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          setAudioUrl(base64Audio);
        };
      };

      mediaRecorder.start(250); // Slice every 250ms
      setIsRecording(true);
      setIsPaused(false);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Optional real-time speech-to-text with Web Speech API
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = 'fr-FR';
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.maxAlternatives = 1;

          recognition.onresult = (event: any) => {
            let fullText = '';
            for (let i = 0; i < event.results.length; i++) {
              fullText += event.results[i][0].transcript + ' ';
            }
            setTranscript(fullText.trim());
          };

          recognition.onerror = (event: any) => {
            console.warn('Speech recognition warning:', event.error);
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (e) {
          console.warn('Speech recognition not started:', e);
        }
      }
    } catch (err: any) {
      console.error("Microphone access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage("Permission microphone refusée par l'utilisateur ou le navigateur. Vous pouvez saisir votre note au clavier.");
      } else {
        setErrorMessage("Impossible d'accéder au microphone : " + (err.message || 'Erreur inconnue'));
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn("Error stopping media recorder:", e);
      }
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    setIsRecording(false);
    setIsPaused(false);
  };

  const discardRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    setIsRecording(false);
    setIsPaused(false);
    setAudioUrl(null);
    setTranscript('');
    setRecordingTime(0);
    audioChunksRef.current = [];
    if (onCancel) onCancel();
  };

  const handleConfirm = () => {
    if (audioUrl) {
      onSaveVoiceNote(audioUrl, recordingTime, transcript);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isRecording ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-blue-100 text-blue-600'}`}>
            <Mic size={18} />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
              🎙️ Note Vocale Médicale
            </h4>
            <p className="text-[11px] text-slate-500 font-medium">
              Enregistrement direct au dossier du passage
            </p>
          </div>
        </div>

        {isRecording && (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
            <span className="font-mono text-xs font-black text-rose-600">
              {formatTime(recordingTime)} {isPaused ? '(En pause)' : ''}
            </span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-800">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p>{errorMessage}</p>
        </div>
      )}

      {/* Control Buttons */}
      {!isRecording && !audioUrl && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
          >
            <Mic size={16} />
            Démarrer l'enregistrement
          </button>
        </div>
      )}

      {isRecording && (
        <div className="flex flex-wrap items-center gap-2">
          {isPaused ? (
            <button
              type="button"
              onClick={resumeRecording}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Play size={14} />
              Reprendre
            </button>
          ) : (
            <button
              type="button"
              onClick={pauseRecording}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Pause size={14} />
              Mettre en pause
            </button>
          )}

          <button
            type="button"
            onClick={stopRecording}
            className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Square size={14} />
            Arrêter l'enregistrement
          </button>

          <button
            type="button"
            onClick={discardRecording}
            className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Trash2 size={14} />
            Annuler
          </button>
        </div>
      )}

      {/* Audio Playback & Confirmation */}
      {audioUrl && !isRecording && (
        <div className="space-y-3 pt-2">
          <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 font-bold">
              <span className="flex items-center gap-1.5">
                <Volume2 size={14} className="text-blue-600" />
                Lecture de la note vocale ({formatTime(recordingTime)})
              </span>
            </div>
            <audio src={audioUrl} controls className="w-full h-10 rounded-xl" />
          </div>

          {transcript && (
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl">
              <p className="text-[10px] font-black uppercase text-blue-700 mb-1">Transcription automatique (optionnelle) :</p>
              <p className="text-xs text-slate-700 italic">« {transcript} »</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
            >
              <Check size={16} />
              Joindre cette note vocale
            </button>
            <button
              type="button"
              onClick={discardRecording}
              className="px-3 py-2 bg-slate-200 hover:bg-rose-100 text-slate-700 hover:text-rose-700 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
