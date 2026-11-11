import React from 'react';
import { 
  CreditCard, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Calendar, 
  Users, 
  CheckCircle2, 
  Clock, 
  Mail, 
  Phone, 
  ExternalLink, 
  Check, 
  Sparkles,
  Building2,
  RefreshCw
} from 'lucide-react';
import { useHospitalLicense } from '../../hooks/useHospitalLicense';
import { User, EstablishmentConfig } from '../../types';

interface LicenseSettingsProps {
  user: User | null;
  establishment: EstablishmentConfig;
  usersCount: number;
}

export const LicenseSettings: React.FC<LicenseSettingsProps> = ({ user, establishment, usersCount }) => {
  const license = useHospitalLicense(user, establishment);

  const formattedStart = license.licenseStart 
    ? new Date(license.licenseStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Non renseignée';

  const formattedEnd = license.licenseEnd 
    ? new Date(license.licenseEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Non renseignée';

  const quotaPercent = Math.min(Math.round((usersCount / Math.max(license.maxUsers, 1)) * 100), 100);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className={`rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl ${
        license.isExpired 
          ? 'bg-gradient-to-br from-rose-950 via-slate-900 to-rose-900 border border-rose-500/40' 
          : license.isNearingExpiration
            ? 'bg-gradient-to-br from-amber-950 via-slate-900 to-amber-900 border border-amber-500/40'
            : 'bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 border border-blue-500/30'
      }`}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm ${
                license.isExpired 
                  ? 'bg-rose-500 text-white animate-pulse' 
                  : license.isNearingExpiration
                    ? 'bg-amber-400 text-amber-950'
                    : 'bg-emerald-500 text-white'
              }`}>
                {license.isExpired ? (
                  <><ShieldAlert size={14} /> Licence Expirée</>
                ) : license.isNearingExpiration ? (
                  <><AlertTriangle size={14} /> Renouvellement Imminent</>
                ) : (
                  <><ShieldCheck size={14} /> Licence Conforme & Active</>
                )}
              </span>
              <span className="text-xs text-white/60 font-semibold">• Multi-tenant SaaS</span>
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
              <CreditCard size={28} className="text-blue-400" />
              Formule {license.planName}
            </h2>
            <p className="text-sm text-slate-300 max-w-xl font-medium leading-relaxed">
              Abonnement souscrit pour <strong>{license.clinicName}</strong>. 
              {license.isExpired 
                ? ' Votre abonnement est arrivé à son terme. Veuillez contacter l\'équipe commerciale pour prolonger vos services sans perte de données.'
                : license.isNearingExpiration
                  ? ` Votre période de validité se termine dans ${license.daysRemaining} jour(s). Nous vous invitons à planifier le renouvellement.`
                  : ' Votre établissement bénéficie de l\'ensemble des modules cliniques, financiers et d\'assistance IA débloqués.'}
            </p>
          </div>

          {/* Quick Counter Box */}
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center shrink-0 min-w-[180px] text-center shadow-inner">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">Temps Restant</span>
            <div className={`text-3xl sm:text-4xl font-black mt-1 ${
              license.isExpired ? 'text-rose-400' : license.isCriticalExpiration ? 'text-rose-300 animate-pulse' : license.isNearingExpiration ? 'text-amber-300' : 'text-emerald-400'
            }`}>
              {license.isExpired ? '0' : license.daysRemaining}
            </div>
            <span className="text-xs font-bold text-slate-300">
              {license.isExpired ? 'Jour (Expiré)' : license.daysRemaining > 1 ? 'Jours de validité' : 'Jour restant'}
            </span>
          </div>
        </div>
      </div>

      {/* 4 Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Subscription Plan */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 hover:border-blue-300 transition-all shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Plan Tarifaire</span>
            <Sparkles size={18} className="text-blue-500" />
          </div>
          <div className="text-xl font-black text-slate-900">{license.planName}</div>
          <p className="text-xs font-bold text-slate-500 mt-1">
            {license.monthlyPriceFCFA.toLocaleString('fr-FR')} FCFA / mois
          </p>
        </div>

        {/* Card 2: Expiration Date */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 hover:border-blue-300 transition-all shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Date d'Échéance</span>
            <Calendar size={18} className="text-indigo-500" />
          </div>
          <div className="text-base font-black text-slate-900 truncate">{formattedEnd}</div>
          <p className="text-xs font-bold text-slate-500 mt-1">
            Début : {formattedStart}
          </p>
        </div>

        {/* Card 3: Users Quota */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 hover:border-blue-300 transition-all shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Quota Utilisateurs</span>
            <Users size={18} className="text-teal-500" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {usersCount} <span className="text-sm text-slate-400 font-bold">/ {license.maxUsers} max</span>
          </div>
          {/* Progress Mini Bar */}
          <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2.5 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                quotaPercent >= 100 ? 'bg-rose-500' : quotaPercent >= 80 ? 'bg-amber-500' : 'bg-teal-500'
              }`}
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
        </div>

        {/* Card 4: Support & Security */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 hover:border-blue-300 transition-all shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Support Dédié</span>
            <ShieldCheck size={18} className="text-emerald-500" />
          </div>
          <div className="text-sm font-black text-slate-900">24h/24 & 7j/7</div>
          <p className="text-xs font-bold text-slate-500 mt-1 truncate">
            {license.contactPhone}
          </p>
        </div>
      </div>

      {/* Included Features and Modules Grid */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-sm">
        <h3 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2">
          <CheckCircle2 size={20} className="text-emerald-600" />
          Modules et Habilitations Inclus dans la Formule {license.planName}
        </h3>
        <p className="text-xs text-slate-500 font-medium mb-6">
          Tous les services ci-dessous sont pleinement opérationnels et garantis par votre licence active :
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {license.features.map((feature, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Check size={14} className="stroke-[3]" />
              </div>
              <span className="text-xs font-bold text-slate-800">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Renewal and Commercial Contact Box */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-xl">
          <h4 className="text-base font-black text-blue-950 flex items-center gap-2">
            <RefreshCw size={18} className="text-blue-600" />
            Besoin d'étendre vos quotas ou de renouveler votre abonnement ?
          </h4>
          <p className="text-xs text-blue-900/80 font-medium leading-relaxed">
            Pour augmenter le nombre d'utilisateurs autorisés, basculer vers un plan supérieur ou reconduire votre licence avant son échéance, nos conseillers sont à votre entière disposition.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <a
            href={`mailto:${license.contactEmail}?subject=Renouvellement%20Licence%20SmartHosto%20-%20${encodeURIComponent(license.clinicName)}`}
            className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Mail size={16} />
            Demander un devis
          </a>
          <a
            href={`tel:${license.contactPhone.replace(/\s+/g, '')}`}
            className="px-4 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
          >
            <Phone size={16} />
            Appeler le support
          </a>
        </div>
      </div>
    </div>
  );
};
