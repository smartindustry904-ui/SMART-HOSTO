import React, { useState, useEffect } from 'react';
import { 
  Palette, 
  Sun, 
  Moon, 
  Check, 
  Sparkles, 
  Save, 
  RefreshCw, 
  Sliders, 
  Eye, 
  Building2, 
  HeartPulse, 
  ShieldCheck, 
  Stethoscope, 
  CreditCard, 
  Activity,
  Layers,
  CheckCircle2
} from 'lucide-react';
import { EstablishmentConfig } from '../../types';
import { THEME_LIST, THEMES, ThemeColor, applyTheme, generateThemeShades } from '../../constants/themes';
import { db, sanitizeData } from '../../src/firebase';
import { collection, query, limit, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';

interface AppearanceSettingsProps {
  establishment: EstablishmentConfig;
  setEstablishment: React.Dispatch<React.SetStateAction<EstablishmentConfig>>;
  currentThemeMode?: 'light' | 'dark';
  toggleThemeMode?: () => void;
  showMessage: (type: 'success' | 'error', text: string) => void;
}

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  establishment,
  setEstablishment,
  currentThemeMode = 'light',
  toggleThemeMode,
  showMessage
}) => {
  // Theme Color Key ('blue', 'teal', 'emerald', ..., or 'custom')
  const [selectedTheme, setSelectedTheme] = useState<string>(establishment.theme || 'blue');
  
  // Custom Color Hex Picker
  const [customHex, setCustomHex] = useState<string>(
    establishment.customThemeColor || '#0ea5e9'
  );

  // Light / Dark Mode State
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    return document.documentElement.classList.contains('dark') ? 'dark' : (currentThemeMode || 'light');
  });

  // Display Density
  const [density, setDensity] = useState<'comfortable' | 'standard' | 'compact'>(
    establishment.displayDensity || 'standard'
  );

  // Generated Shades for custom preview
  const customShades = React.useMemo(() => {
    try {
      return generateThemeShades(customHex);
    } catch {
      return generateThemeShades('#0ea5e9');
    }
  }, [customHex]);

  const [isSaving, setIsSaving] = useState(false);

  // Apply Theme in Real-Time as user previews
  const handleSelectTheme = (themeId: string) => {
    setSelectedTheme(themeId);
    if (themeId === 'custom') {
      applyTheme('custom', customHex);
    } else {
      applyTheme(themeId);
    }
    setEstablishment(prev => ({
      ...prev,
      theme: themeId,
      customThemeColor: themeId === 'custom' ? customHex : prev.customThemeColor
    }));
  };

  const handleCustomHexChange = (newHex: string) => {
    setCustomHex(newHex);
    if (selectedTheme === 'custom') {
      applyTheme('custom', newHex);
      setEstablishment(prev => ({
        ...prev,
        theme: 'custom',
        customThemeColor: newHex
      }));
    }
  };

  const handleModeChange = (mode: 'light' | 'dark') => {
    setThemeMode(mode);
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('smarthosto_theme', mode);
    if (toggleThemeMode && currentThemeMode !== mode) {
      toggleThemeMode();
    }
  };

  const handleSaveAppearance = async () => {
    setIsSaving(true);
    try {
      const updatedConfig: EstablishmentConfig = {
        ...establishment,
        theme: selectedTheme,
        customThemeColor: selectedTheme === 'custom' ? customHex : establishment.customThemeColor,
        themeMode: themeMode,
        displayDensity: density
      };

      setEstablishment(updatedConfig);
      localStorage.setItem('hospital_config', JSON.stringify(updatedConfig));
      localStorage.setItem('smarthosto_theme', themeMode);
      localStorage.setItem('smarthosto_theme_color', selectedTheme);
      if (selectedTheme === 'custom') {
        localStorage.setItem('smarthosto_custom_theme_hex', customHex);
      }

      // Re-apply to ensure root CSS variables are set
      applyTheme(selectedTheme, selectedTheme === 'custom' ? customHex : undefined);

      // Persist in Firestore
      const q = query(collection(db, 'hospital_config'), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        await addDoc(collection(db, 'hospital_config'), sanitizeData(updatedConfig));
      } else {
        await updateDoc(doc(db, 'hospital_config', snap.docs[0].id), sanitizeData(updatedConfig));
      }

      window.dispatchEvent(new CustomEvent('settings-updated'));
      showMessage('success', 'Thème et personnalisation visuelle enregistrés avec succès !');
    } catch (error) {
      console.error('Error saving theme settings:', error);
      showMessage('error', 'Erreur lors de l\'enregistrement du thème.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Title & Introduction Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 text-white p-8 rounded-3xl shadow-xl relative overflow-hidden border border-white/10">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-blue-200 border border-white/10">
              <Sparkles size={14} className="text-blue-400" />
              <span>Personnalisation Visuelle & Ergonomie</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
              Thèmes & Couleurs de l'Hôpital
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Personnalisez la charte graphique de SmartHosto selon l'identité officielle de votre établissement. Choisissez parmi nos palettes médicales calibrées ou définissez votre propre couleur institutionnelle.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleSaveAppearance}
              disabled={isSaving}
              className="px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Save size={18} />
              <span>{isSaving ? 'Enregistrement...' : 'Enregistrer le thème'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: MODE D'ÉCLAIRAGE (DARK / LIGHT)                              */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Sun size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                1. Mode d'éclairage
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Basculez entre le mode clair standard et le mode sombre clinique pour le confort des yeux lors des gardes de nuit.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Light Mode Option */}
          <button
            type="button"
            onClick={() => handleModeChange('light')}
            className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer relative flex flex-col justify-between group ${
              themeMode === 'light'
                ? 'border-blue-600 bg-blue-50/40 shadow-sm'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
                  <Sun size={20} />
                </div>
                <div>
                  <p className="font-black text-sm text-slate-900">Mode Clair Médical</p>
                  <p className="text-xs text-slate-500">Haute lisibilité diurne et contraste net</p>
                </div>
              </div>
              {themeMode === 'light' && (
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">
                  ✓
                </span>
              )}
            </div>

            {/* Simulated mini card */}
            <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-300"></div>
                <div className="h-2 w-16 bg-slate-300 rounded"></div>
              </div>
              <div className="h-4 w-12 bg-blue-600 rounded text-[9px] text-white font-bold flex items-center justify-center">
                Actif
              </div>
            </div>
          </button>

          {/* Dark Mode Option */}
          <button
            type="button"
            onClick={() => handleModeChange('dark')}
            className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer relative flex flex-col justify-between group ${
              themeMode === 'dark'
                ? 'border-blue-600 bg-blue-50/40 shadow-sm'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                  <Moon size={20} />
                </div>
                <div>
                  <p className="font-black text-sm text-slate-900">Mode Sombre Clinique</p>
                  <p className="text-xs text-slate-500">Anti-éblouissement pour les salles de garde</p>
                </div>
              </div>
              {themeMode === 'dark' && (
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">
                  ✓
                </span>
              )}
            </div>

            {/* Simulated mini dark card */}
            <div className="bg-[#0f172a] p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-700"></div>
                <div className="h-2 w-16 bg-slate-700 rounded"></div>
              </div>
              <div className="h-4 w-12 bg-blue-600 rounded text-[9px] text-white font-bold flex items-center justify-center">
                Garde
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: PALETTES DE COULEUR D'ACCENTUATION MÉDICALE                     */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Palette size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                2. Palette thématique hospitalière
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Sélectionnez une harmonie de couleur clinique. La teinte est immédiatement propagée sur les boutons, badges, jauges et menus.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {THEME_LIST.map((th) => {
            const isSelected = selectedTheme === th.id;
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => handleSelectTheme(th.id)}
                className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer relative flex flex-col justify-between group ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-xl shadow-xs flex items-center justify-center text-white font-black text-xs shrink-0"
                        style={{ backgroundColor: th.accent }}
                      >
                        {isSelected ? '✓' : ''}
                      </div>
                      <div>
                        <p className="font-extrabold text-sm text-slate-900">{th.name}</p>
                        <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 mt-0.5">
                          {th.badge}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed mb-4">
                    {th.subtitle}
                  </p>
                </div>

                {/* 5-shade preview bar */}
                <div className="grid grid-cols-5 h-3 rounded-lg overflow-hidden border border-slate-200/80 shadow-2xs">
                  <div style={{ backgroundColor: th[100] }} title="Nuance 100"></div>
                  <div style={{ backgroundColor: th[300] }} title="Nuance 300"></div>
                  <div style={{ backgroundColor: th[500] }} title="Nuance 500"></div>
                  <div style={{ backgroundColor: th[700] }} title="Nuance 700"></div>
                  <div style={{ backgroundColor: th[900] }} title="Nuance 900"></div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: COULEUR SUR-MESURE / BRAND COLOR                               */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Sliders size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                3. Couleur sur-mesure de votre clinique
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Définissez le code couleur exact de votre logo ou charte graphique. Notre moteur calcule automatiquement l'éventail complet des 11 nuances Tailwind.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleSelectTheme('custom')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              selectedTheme === 'custom'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {selectedTheme === 'custom' && <Check size={14} />}
            <span>{selectedTheme === 'custom' ? 'Actif' : 'Activer le mode sur-mesure'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Color Picker Control */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">
              Sélecteur de teinte Hex
            </label>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={customHex}
                onChange={(e) => handleCustomHexChange(e.target.value)}
                className="w-14 h-14 rounded-2xl border-2 border-slate-300 p-1 cursor-pointer bg-white shrink-0 shadow-xs"
              />
              <div className="space-y-1 flex-1">
                <input
                  type="text"
                  value={customHex}
                  onChange={(e) => handleCustomHexChange(e.target.value)}
                  placeholder="#0EA5E9"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-sm text-slate-900 bg-white uppercase"
                  maxLength={7}
                />
                <p className="text-[10px] text-slate-400">Code hexadécimal officiel</p>
              </div>
            </div>
          </div>

          {/* Generated Shades Palette Preview */}
          <div className="md:col-span-2 p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Éventail des 11 nuances générées (50 à 950)
              </span>
              <span className="text-xs font-mono font-bold text-slate-700">{customHex}</span>
            </div>

            <div className="grid grid-cols-11 gap-1 h-12 rounded-xl overflow-hidden border border-slate-300 shadow-2xs">
              {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => (
                <div
                  key={s}
                  className="h-full flex items-end justify-center pb-1 text-[8px] font-bold select-none transition-transform hover:scale-110"
                  style={{
                    backgroundColor: customShades[s],
                    color: s < 500 ? '#1e293b' : '#ffffff'
                  }}
                  title={`Nuance ${s}: ${customShades[s]}`}
                >
                  {s}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 font-medium italic">
              Ces nuances sont automatiquement assignées aux variables CSS de Tailwind (--theme-50 à --theme-950).
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: BAC À SABLE / PRÉVISUALISATION EN DIRECT                       */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Eye size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                4. Aperçu en temps réel des composants SIH
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Vérifiez le rendu en direct de vos choix de thème sur différents composants médicaux clés.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-500">
            Thème actif : <strong className="text-slate-900 capitalize">{selectedTheme === 'custom' ? `Sur-Mesure (${customHex})` : selectedTheme}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Buttons & Actions */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Boutons & Actions</p>
            <div className="space-y-2">
              <button
                type="button"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
              >
                <HeartPulse size={16} />
                <span>Bouton Principal SIH</span>
              </button>
              <button
                type="button"
                className="w-full py-2.5 bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
              >
                <span>Bouton Secondaire</span>
              </button>
            </div>
          </div>

          {/* Card 2: Badges & Clinical Status */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Statuts & Badges</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-extrabold flex items-center gap-1.5 border border-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                <span>En Consultation</span>
              </span>
              <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-bold shadow-xs">
                Certifié Conforme
              </span>
              <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-black border border-blue-200">
                Prioritaire
              </span>
            </div>
          </div>

          {/* Card 3: Simulated Patient File Card */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carte Patient / Dossier</p>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                    JD
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Dr. Jean Dupont</p>
                    <p className="text-[10px] text-blue-600 font-bold">Médecine Générale</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-400">DME-2026-042</span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex justify-between text-[10px]">
                <span className="text-slate-500">Statut :</span>
                <span className="text-blue-700 font-extrabold">Session Ouverte</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: DENSITÉ D'AFFICHAGE                                           */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
              <Layers size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                5. Densité d'affichage de l'interface
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Ajustez l'espacement des lignes et tableaux pour s'adapter à la taille de vos écrans de consultation.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: 'comfortable', label: 'Confortable', desc: 'Espacements généreux pour tablettes et grands moniteurs' },
            { id: 'standard', label: 'Standard (Recommandé)', desc: 'Ergonomie équilibrée optimale pour postes médicaux' },
            { id: 'compact', label: 'Compacte', desc: 'Haute densité d\'informations pour urgences et caisse' },
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDensity(d.id as any)}
              className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                density === d.id
                  ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div>
                <p className="font-bold text-sm text-slate-900 mb-1">{d.label}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{d.desc}</p>
              </div>
              {density === d.id && (
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold self-end mt-3">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Save Bar */}
      <div className="flex justify-end pt-2 pb-6">
        <button
          type="button"
          onClick={handleSaveAppearance}
          disabled={isSaving}
          className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-xl shadow-blue-600/30 flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
        >
          <Save size={18} />
          <span>{isSaving ? 'Enregistrement...' : 'Enregistrer la personnalisation du thème'}</span>
        </button>
      </div>
    </div>
  );
};
