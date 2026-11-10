#!/bin/bash
cat << 'INNEREOF' > patch.js
const fs = require('fs');
let content = fs.readFileSync('pages/Reception.tsx', 'utf8');

const targetStr = `      {activeTab === 'sorties' && (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
           <div className="bg-white p-8 md:p-12 rounded-[40px] md:rounded-[50px] border border-slate-200/60 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-slate-900/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
              <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-end mb-12 gap-6">
                 <div>
                    <h2 className="text-4xl font-black tracking-tight text-slate-900 flex items-center gap-4">
                      <span className="p-3 bg-slate-100 text-slate-700 rounded-2xl"><LogOut size={32} /></span>
                      Sorties Administratives
                    </h2>
                    <p className="text-slate-500 font-medium mt-3 flex items-center gap-2">
                       <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                       Validation finale avant que le patient ne quitte l'enceinte hospitalière.
                    </p>
                 </div>
                 <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl text-sm font-black shadow-lg shadow-slate-900/10 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-lg">{patientsToDischarge.length}</span>
                    PATIENTS PRÊTS
                 </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
                 {patientsToDischarge.map((patient) => {
                   const isReady = patient.medicalClearance && patient.hospitalizationClosed && patient.financialClearance;
                   const isProcessing = isProcessingDischarge === patient.id;
                   return (
                   <div key={patient.id} className={\`p-8 bg-slate-50/50 rounded-[32px] border transition-all relative overflow-hidden flex flex-col \${isReady ? 'border-emerald-200 hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-500/10' : 'border-slate-200 hover:border-slate-300'}\`}>`;

const replaceStr = `      {activeTab === 'sorties' && (
        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
           <div className="bg-slate-900 p-8 md:p-12 rounded-[40px] md:rounded-[50px] shadow-2xl relative overflow-hidden border border-slate-800">
              {/* Premium Glow Effects */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none" />
              
              <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-end mb-12 gap-6">
                 <div>
                    <h2 className="text-4xl font-black tracking-tight text-white flex items-center gap-4">
                      <span className="p-3 bg-white/10 text-emerald-400 rounded-2xl shadow-inner border border-white/5"><LogOut size={32} /></span>
                      Sorties Administratives
                    </h2>
                    <p className="text-slate-400 font-medium mt-3 flex items-center gap-2">
                       <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                       Validation finale avant que le patient ne quitte l'enceinte hospitalière.
                    </p>
                 </div>
                 <div className="bg-white/10 backdrop-blur-md text-white px-6 py-4 rounded-2xl text-sm font-black shadow-xl border border-white/10 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-lg">{patientsToDischarge.length}</span>
                    PATIENTS PRÊTS
                 </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
                 {patientsToDischarge.map((patient) => {
                   const isReady = patient.medicalClearance && patient.hospitalizationClosed && patient.financialClearance;
                   const isProcessing = isProcessingDischarge === patient.id;
                   return (
                   <div key={patient.id} className={\`p-8 rounded-[32px] border transition-all relative overflow-hidden flex flex-col \${isReady ? 'bg-white/5 border-emerald-500/30 hover:border-emerald-400/60 hover:bg-white/10' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'}\`}>`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replaceStr);
  
  // also replace inner colors inside the card
  const cardContentTarget = `                     <div className="flex justify-between items-start mb-6">
                         <span className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-black text-slate-500 font-mono tracking-widest uppercase shadow-sm">
                           {patient.id}
                         </span>
                         {isReady && (
                           <span className="bg-emerald-100 text-emerald-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1.5">
                             <CheckCircle2 size={12} /> Prêt
                           </span>
                         )}
                      </div>

                      <h3 className="text-2xl font-black mb-2 text-slate-900 tracking-tight">{patient.name}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-8 font-bold">
                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md uppercase tracking-wider">{patient.department}</span>
                        <span>•</span>
                        <span>Admis le {patient.admissionDate}</span>
                      </div>

                       {/* Critère Checklist Indicators */}
                       <div className="grid grid-cols-3 gap-3 mb-8">
                         <div className={\`flex flex-col items-center justify-center p-4 rounded-[20px] border transition-colors \${patient.medicalClearance ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-white border-slate-200 text-slate-400'}\`}>
                           <Thermometer size={20} className="mb-2" />
                           <span className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Médicale</span>
                           <span className="text-[10px] font-bold">{patient.medicalClearance ? "Validée" : "En attente"}</span>
                         </div>
                         <div className={\`flex flex-col items-center justify-center p-4 rounded-[20px] border transition-colors \${patient.hospitalizationClosed ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-white border-slate-200 text-slate-400'}\`}>
                           <Activity size={20} className="mb-2" />
                           <span className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Dossier</span>
                           <span className="text-[10px] font-bold">{patient.hospitalizationClosed ? "Clos" : "En cours"}</span>
                         </div>
                         <div className={\`flex flex-col items-center justify-center p-4 rounded-[20px] border transition-colors \${patient.financialClearance ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-600'}\`}>
                           <CreditCard size={20} className="mb-2" />
                           <span className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Caisse</span>
                           <span className="text-[10px] font-bold">{patient.financialClearance ? "Soldée" : "Impayée"}</span>
                         </div>
                       </div>

                       {dischargeError && dischargeError.patientId === patient.id && (
                         <div className="mb-6 p-5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 shadow-sm">
                           <ShieldAlert className="text-rose-600 flex-shrink-0 mt-0.5" size={20} />
                           <div>
                             <p className="text-xs font-black uppercase tracking-widest text-rose-900 mb-1">Validation Impossible</p>
                             <p className="text-xs text-rose-700 leading-relaxed">{dischargeError.message}</p>
                           </div>
                         </div>
                       )}

                       <div className="mt-auto pt-4 flex gap-4">
                        <button 
                          onClick={() => handleDischarge(patient.id)}
                          disabled={isProcessing}
                          className="flex-1 bg-slate-900 text-white py-5 rounded-[20px] font-black text-sm hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/20 disabled:opacity-70 disabled:hover:bg-slate-900 flex items-center justify-center gap-3"
                        >
                          {isProcessing ? (
                            <><Loader2 size={20} className="animate-spin" /> Traitement...</>
                          ) : (
                            <><CheckCircle size={20} /> Valider Sortie</>
                          )}
                        </button>
                        <button 
                          disabled={!isReady || isProcessing}
                          onClick={() => handleGeneratePDF('autorisation_sortie', patient)}
                          className={\`w-16 h-[60px] rounded-[20px] flex items-center justify-center transition-all \${
                            isReady && !isProcessing
                              ? "bg-white border-2 border-slate-200 text-slate-700 hover:text-blue-600 hover:border-blue-200 cursor-pointer shadow-sm"
                              : "bg-slate-100 border border-slate-200 text-slate-300 cursor-not-allowed"
                          }\`}
                          title="Imprimer l'Autorisation de Sortie"
                        >`;

  const cardContentReplace = `                     <div className="flex justify-between items-start mb-6">
                         <span className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-black text-slate-300 font-mono tracking-widest uppercase shadow-sm">
                           {patient.id}
                         </span>
                         {isReady && (
                           <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-1.5">
                             <CheckCircle2 size={12} /> Prêt
                           </span>
                         )}
                      </div>

                      <h3 className="text-2xl font-black mb-2 text-white tracking-tight">{patient.name}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mb-8 font-bold">
                        <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded-md uppercase tracking-wider">{patient.department}</span>
                        <span>•</span>
                        <span>Admis le {patient.admissionDate}</span>
                      </div>

                       {/* Critère Checklist Indicators */}
                       <div className="grid grid-cols-3 gap-3 mb-8">
                         <div className={\`flex flex-col items-center justify-center p-4 rounded-[20px] border transition-colors \${patient.medicalClearance ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800/80 border-slate-700 text-slate-500'}\`}>
                           <Thermometer size={20} className="mb-2" />
                           <span className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Médicale</span>
                           <span className="text-[10px] font-bold">{patient.medicalClearance ? "Validée" : "En attente"}</span>
                         </div>
                         <div className={\`flex flex-col items-center justify-center p-4 rounded-[20px] border transition-colors \${patient.hospitalizationClosed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800/80 border-slate-700 text-slate-500'}\`}>
                           <Activity size={20} className="mb-2" />
                           <span className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Dossier</span>
                           <span className="text-[10px] font-bold">{patient.hospitalizationClosed ? "Clos" : "En cours"}</span>
                         </div>
                         <div className={\`flex flex-col items-center justify-center p-4 rounded-[20px] border transition-colors \${patient.financialClearance ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}\`}>
                           <CreditCard size={20} className="mb-2" />
                           <span className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Caisse</span>
                           <span className="text-[10px] font-bold">{patient.financialClearance ? "Soldée" : "Impayée"}</span>
                         </div>
                       </div>

                       {dischargeError && dischargeError.patientId === patient.id && (
                         <div className="mb-6 p-5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 shadow-sm">
                           <ShieldAlert className="text-rose-400 flex-shrink-0 mt-0.5" size={20} />
                           <div>
                             <p className="text-xs font-black uppercase tracking-widest text-rose-400 mb-1">Validation Impossible</p>
                             <p className="text-xs text-rose-300/80 leading-relaxed">{dischargeError.message}</p>
                           </div>
                         </div>
                       )}

                       <div className="mt-auto pt-4 flex gap-4">
                        <button 
                          onClick={() => handleDischarge(patient.id)}
                          disabled={isProcessing}
                          className="flex-1 bg-emerald-500 text-white py-5 rounded-[20px] font-black text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                        >
                          {isProcessing ? (
                            <><Loader2 size={20} className="animate-spin" /> Traitement...</>
                          ) : (
                            <><CheckCircle size={20} /> Valider Sortie</>
                          )}
                        </button>
                        <button 
                          disabled={!isReady || isProcessing}
                          onClick={() => handleGeneratePDF('autorisation_sortie', patient)}
                          className={\`w-16 h-[60px] rounded-[20px] flex items-center justify-center transition-all \${
                            isReady && !isProcessing
                              ? "bg-slate-800 border-2 border-slate-600 text-white hover:text-emerald-400 hover:border-emerald-400 cursor-pointer shadow-sm"
                              : "bg-slate-800/50 border border-slate-700 text-slate-600 cursor-not-allowed"
                          }\`}
                          title="Imprimer l'Autorisation de Sortie"
                        >`;

  content = content.replace(cardContentTarget, cardContentReplace);
  
  fs.writeFileSync('pages/Reception.tsx', content, 'utf8');
  console.log('Successfully updated Reception.tsx Sorties Admin UI!');
} else {
  console.error('Target string not found in Reception.tsx');
}
INNEREOF
node patch.js
