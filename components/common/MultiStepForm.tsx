import React from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, Save, X, AlertCircle } from 'lucide-react';

export interface WizardStep {
  id: string;
  label: string;
  shortLabel?: string;
  isValid: boolean;
  validationHint?: string;
}

interface MultiStepFormProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  steps: WizardStep[];
  currentStep: number;
  maxUnlockedStep: number;
  onStepChange: (stepIndex: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export const MultiStepForm: React.FC<MultiStepFormProps> = ({
  title,
  subtitle,
  icon,
  steps,
  currentStep,
  maxUnlockedStep,
  onStepChange,
  onNext,
  onPrev,
  onClose,
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Enregistrer',
  maxWidthClass = 'max-w-5xl',
  children,
}) => {
  const activeStepObj = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const canProceed = Boolean(activeStepObj?.isValid);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-5">
      <div
        className={`bg-[#070B14] text-slate-100 rounded-3xl border border-slate-800/90 ring-1 ring-white/10 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.9)] w-full ${maxWidthClass} max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200`}
      >
        {/* Top Header */}
        <div className="px-6 py-5 border-b border-slate-800/80 bg-[#0B1120] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            {icon && (
              <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shadow-inner shadow-blue-500/10 shrink-0">
                {icon}
              </div>
            )}
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer"
            title="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Horizontal Stepper Progress Indicator */}
        <div className="px-6 py-4 bg-[#090E1A] border-b border-slate-800/80 shrink-0">
          <div className="flex items-center justify-between w-full">
            {steps.map((step, idx) => {
              const isActive = idx === currentStep;
              const isCompleted = idx < currentStep;
              const isUnlocked = idx <= maxUnlockedStep;

              return (
                <React.Fragment key={step.id}>
                  <button
                    type="button"
                    disabled={!isUnlocked}
                    onClick={() => {
                      if (isUnlocked) onStepChange(idx);
                    }}
                    className={`flex items-center gap-2.5 group text-left transition-all ${
                      isUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs font-black transition-all shrink-0 border ${
                        isActive
                          ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_20px_rgba(37,99,235,0.5)] ring-4 ring-blue-500/20'
                          : isCompleted
                          ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
                          : 'bg-slate-900 border-slate-700 text-slate-500'
                      }`}
                    >
                      {isCompleted ? <Check size={15} strokeWidth={3} /> : idx + 1}
                    </div>
                    <div className="hidden sm:block">
                      <span
                        className={`block text-[10px] font-black uppercase tracking-wider ${
                          isActive
                            ? 'text-blue-400'
                            : isCompleted
                            ? 'text-emerald-400'
                            : 'text-slate-500'
                        }`}
                      >
                        Étape {idx + 1}
                      </span>
                      <span
                        className={`block text-xs font-bold whitespace-nowrap ${
                          isActive
                            ? 'text-white'
                            : isCompleted
                            ? 'text-slate-200'
                            : 'text-slate-500'
                        }`}
                      >
                        {step.shortLabel || step.label}
                      </span>
                    </div>
                  </button>

                  {idx < steps.length - 1 && (
                    <div className="flex-1 mx-2 sm:mx-4 h-[2px] rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          idx < currentStep ? 'w-full bg-emerald-500/70' : 'w-0 bg-blue-500'
                        }`}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div className="sm:hidden mt-2.5 text-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-blue-400">
              Étape {currentStep + 1} / {steps.length} — {activeStepObj?.label}
            </span>
          </div>
        </div>

        {/* Step Content Area */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-7 bg-[#070B14] custom-scrollbar">
          {children}
        </div>

        {/* Bottom Navigation Bar */}
        <div className="px-6 py-4 border-t border-slate-800/80 bg-[#0B1120] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            {!canProceed && activeStepObj?.validationHint ? (
              <span className="inline-flex items-center gap-1.5 text-amber-400 font-semibold">
                <AlertCircle size={14} className="shrink-0" />
                {activeStepObj.validationHint}
              </span>
            ) : (
              <span className="text-slate-500 font-medium">
                Étape {currentStep + 1} sur {steps.length} • {activeStepObj?.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
            >
              Annuler
            </button>

            {!isFirstStep && (
              <button
                type="button"
                onClick={onPrev}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ChevronLeft size={16} />
                Précédent
              </button>
            )}

            {!isLastStep ? (
              <button
                type="button"
                onClick={onNext}
                disabled={!canProceed}
                className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  canProceed
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] border border-blue-400/50 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                }`}
              >
                Suivant
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting}
                className="px-7 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.4)] border border-emerald-400/50 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isSubmitting ? 'Enregistrement...' : submitLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
