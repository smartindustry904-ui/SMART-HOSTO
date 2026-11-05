import React, { useState, useMemo } from 'react';
import { Search, FileText, Printer, Download, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { LabExamRequest, ResultatLaboratoire, RapportLaboratoirePDF } from '../../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSettings } from '../../hooks/useSettings';
import { LabFilterToolbar, LabFilters } from '../../components/lab/LabFilterToolbar';
import { isStatusTermine } from '../../src/utils/labStatus';

interface RapportsTabProps {
  requests: LabExamRequest[];
  resultats: ResultatLaboratoire[];
  rapports: RapportLaboratoirePDF[];
  updateRapports: (rapports: RapportLaboratoirePDF[]) => void;
  user?: any;
}

const RapportsTab: React.FC<RapportsTabProps> = ({ requests, resultats, rapports, updateRapports, user }) => {
  const { establishment } = useSettings();
  const [selectedResult, setSelectedResult] = useState<ResultatLaboratoire | null>(null);

  // Filters State - Strictly Stage 3 (TERMINE) without conflicting status dropdowns
  const [filters, setFilters] = useState<LabFilters>({
    search: '',
    status: 'TERMINE',
    dateRange: 'ALL',
    startDate: '',
    endDate: ''
  });

  const handleResetFilters = () => {
    setFilters({
      search: '',
      status: 'TERMINE',
      dateRange: 'ALL',
      startDate: '',
      endDate: ''
    });
  };

  // Strict Stage 3 status isolation: ONLY analyses where status/statut is completed/published (statut === 'TERMINE' / 'validé')
  // Strictly ordered by most recent date first (DESC)
  const sortedValidatedResults = useMemo(() => {
    return resultats
      .filter(r => isStatusTermine(r.statut, (r as any).status))
      .sort((a, b) => {
        const tA = new Date(a.dateValidation || a.dateSaisie || (a as any).createdAt || 0).getTime();
        const tB = new Date(b.dateValidation || b.dateSaisie || (b as any).createdAt || 0).getTime();
        return tB - tA;
      });
  }, [resultats]);
  
  // Search bar (Patient Name, DME ID, Prescribing Doctor, Request ID) & Date filters
  const filteredResults = useMemo(() => {
    const now = new Date();
    return sortedValidatedResults.filter(r => {
      const req = requests.find(req => req.id === r.demandeId);

      // Text search
      if (filters.search) {
        const q = filters.search.toLowerCase().trim();
        const matchesPatient = (req?.patientName || '').toLowerCase().includes(q);
        const matchesDemandeId = (r.demandeId || '').toLowerCase().includes(q);
        const matchesPatientId = (r.patientId || '').toLowerCase().includes(q);
        const matchesDoctor = (req?.prescriberName || '').toLowerCase().includes(q);
        if (!matchesPatient && !matchesDemandeId && !matchesPatientId && !matchesDoctor) {
          return false;
        }
      }

      // Date filter
      const resDate = new Date(r.dateValidation || r.dateSaisie || (r as any).createdAt || req?.date || '');
      if (!isNaN(resDate.getTime())) {
        if (filters.dateRange === 'TODAY') {
          if (resDate.toDateString() !== now.toDateString()) return false;
        } else if (filters.dateRange === 'WEEK') {
          const diffDays = Math.ceil(Math.abs(now.getTime() - resDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 7) return false;
        } else if (filters.dateRange === 'CUSTOM') {
          if (filters.startDate) {
            const start = new Date(filters.startDate);
            start.setHours(0, 0, 0, 0);
            if (resDate < start) return false;
          }
          if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            if (resDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [sortedValidatedResults, requests, filters]);

  const getRequest = (demandeId: string) => requests.find(r => r.id === demandeId);

  const handleGenerateReport = () => {
    if (!selectedResult) return;

    const req = getRequest(selectedResult.demandeId);
    if (!req) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(establishment?.name || 'SMARTHOSTO', 14, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Laboratoire d\'Analyses Médicales', 14, 26);
    
    doc.setFontSize(9);
    doc.text(establishment?.address || '123 Avenue de la Santé', 140, 20);
    doc.text(`Contact: ${establishment?.phone || '+237 600 000 000'}`, 140, 25);
    doc.text(`Email: ${establishment?.email || 'labo@smarthosto.com'}`, 140, 30);
    
    doc.line(14, 35, 196, 35);
    
    // Patient Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Patient:', 14, 45);
    doc.setFont('helvetica', 'normal');
    doc.text(`${req.patientName} (ID: ${selectedResult.patientId})`, 40, 45);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Prescripteur:', 14, 52);
    doc.setFont('helvetica', 'normal');
    doc.text(req.prescriberName, 40, 52);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Date prélèvement:', 120, 45);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(req.date).toLocaleDateString(), 155, 45);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Date validation:', 120, 52);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(selectedResult.dateValidation || '').toLocaleDateString(), 155, 52);
    
    doc.line(14, 60, 196, 60);
    
    // Results Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('RÉSULTATS D\'ANALYSES', 14, 70);
    
    let currentY = 80;
    
    selectedResult.lignes.forEach((ligne) => {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(ligne.examName, 14, currentY);
      currentY += 5;
      
      const tableData = ligne.parametres.map(p => [
        p.nom,
        `${p.valeur} ${p.isAnormal ? '*' : ''}`,
        p.unite,
        p.valeurReference
      ]);
      
      autoTable(doc, {
        startY: currentY,
        head: [['Paramètre', 'Résultat', 'Unité', 'Valeurs de référence']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          1: { fontStyle: 'bold' }
        },
        didParseCell: function(data) {
          if (data.section === 'body' && data.column.index === 1) {
            const isAnormal = ligne.parametres[data.row.index].isAnormal;
            if (isAnormal) {
              data.cell.styles.textColor = [225, 29, 72]; // rose-600
            }
          }
        }
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 10;
      
      if (ligne.conclusion) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Conclusion:', 14, currentY);
        doc.setFont('helvetica', 'italic');
        doc.text(ligne.conclusion, 40, currentY);
        currentY += 15;
      }
    });
    
    if (selectedResult.commentaireGlobal) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Commentaire Global:', 14, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(selectedResult.commentaireGlobal, 14, currentY + 7);
      currentY += 20;
    }
    
    // Signatures
    currentY = Math.max(currentY, 250);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Technicien', 40, currentY);
    doc.text('Biologiste Validateur', 140, currentY);
    
    doc.setFont('helvetica', 'normal');
    doc.text(selectedResult.saisiPar, 40, currentY + 10);
    doc.text(selectedResult.validePar || '', 140, currentY + 10);
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('* Résultat hors des valeurs de référence', 14, 280);
    doc.text('Ce rapport a été généré électroniquement et est valide sans signature manuscrite.', 14, 285);
    
    // Save PDF
    doc.save(`Rapport_Labo_${selectedResult.id}.pdf`);

    // Simulate archiving
    const newReport: RapportLaboratoirePDF = {
      id: `RPT-${Date.now().toString().slice(-6)}`,
      resultatId: selectedResult.id,
      patientId: selectedResult.patientId,
      dateGeneration: new Date().toISOString(),
      url: '#' // Placeholder for actual PDF URL
    };

    updateRapports([...rapports, newReport]);
    alert('Rapport généré, téléchargé et archivé dans le dossier patient avec succès !');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col gap-3 overflow-hidden">
      {/* Ultra-Micro Compact Filter Toolbar strictly for Stage 3 (No status dropdown) */}
      <LabFilterToolbar 
        filters={filters}
        onFiltersChange={setFilters}
        totalCount={sortedValidatedResults.length}
        filteredCount={filteredResults.length}
        onReset={handleResetFilters}
        showStatusFilter={false}
        stageBadge={{ label: "Stage 3 — Résultats Publiés (Validé / Terminé)", color: "bg-emerald-50 text-emerald-800 border border-emerald-200" }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0 h-full overflow-hidden">
        {/* Liste des résultats validés */}
        <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle size={13} className="text-emerald-600" /> Analyses Publiées ({filteredResults.length})
            </span>
            <span className="text-[9px] font-bold text-slate-400">Plus récentes en premier</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
          {filteredResults.length > 0 ? filteredResults.map((res, idx) => {
            const req = getRequest(res.demandeId);
            if (!req) return null;
            
            return (
              <div 
                key={`${res.id || 'rep'}-${idx}`} 
                onClick={() => setSelectedResult(res)}
                className={`p-4 rounded-2xl cursor-pointer transition-all border ${selectedResult?.id === res.id ? 'bg-slate-800 border-slate-700 text-white shadow-sm' : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className={`font-bold text-sm ${selectedResult?.id === res.id ? 'text-white' : 'text-slate-900'}`}>{req.patientName}</h3>
                    <p className={`text-[10px] uppercase tracking-wider ${selectedResult?.id === res.id ? 'text-slate-400' : 'text-slate-500'}`}>{req.id}</p>
                  </div>
                  <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                    <CheckCircle size={12} /> VALIDÉ
                  </span>
                </div>
                
                <div className="flex items-center gap-2 mt-3 text-xs">
                  <span className={`flex items-center gap-1 ${selectedResult?.id === res.id ? 'text-slate-400' : 'text-slate-400'}`}>
                    <Clock size={12} /> {new Date(res.dateValidation || res.dateSaisie).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          }) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <FileText size={48} className="mb-4 opacity-20" />
              <p className="font-bold">Aucun résultat validé</p>
            </div>
          )}
        </div>
      </div>

      {/* Aperçu du rapport */}
      <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
        {selectedResult ? (
          <>
            {/* Ultra-Micro Header Ribbon */}
            <div className="h-11 px-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0 rounded-t-2xl text-xs font-mono select-none overflow-x-auto whitespace-nowrap custom-scrollbar">
              <div className="flex items-center gap-2 text-slate-200 text-[11px] sm:text-xs">
                <span className="font-bold text-amber-400">[{selectedResult.patientId}]</span>
                <span className="text-slate-600">|</span>
                <span className="font-bold text-white font-sans">{getRequest(selectedResult.demandeId)?.patientName || 'Patient'}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300 font-sans">Prescripteur: <strong className="text-white font-medium">{getRequest(selectedResult.demandeId)?.prescriberName || 'Médecin'}</strong></span>
                <span className="text-slate-600">|</span>
                <span className="text-emerald-400 font-sans font-bold">Réf: {selectedResult.id}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button 
                  onClick={handlePrint}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Printer size={13} /> Imprimer
                </button>
                <button 
                  onClick={handleGenerateReport}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Download size={13} /> PDF
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-100 flex justify-center">
              {/* Report Preview Container (A4 aspect ratio approx) */}
              <div className="bg-white w-full max-w-3xl min-h-[1056px] shadow-lg p-12 print:shadow-none print:p-0">
                {/* Header */}
                <div className="border-b-2 border-slate-800 pb-6 mb-8 flex justify-between items-start">
                  <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{establishment?.name || 'SMARTHOSTO'}</h1>
                    <p className="text-slate-500 font-medium">Laboratoire d'Analyses Médicales</p>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <p>{establishment?.address || '123 Avenue de la Santé'}</p>
                    <p>Contact: {establishment?.phone || '+237 600 000 000'}</p>
                    <p>Email: {establishment?.email || 'labo@smarthosto.com'}</p>
                  </div>
                </div>

                {/* Patient Info */}
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Patient</h3>
                    <p className="text-lg font-bold text-slate-900">{getRequest(selectedResult.demandeId)?.patientName}</p>
                    <p className="text-sm text-slate-600 mt-1">ID: {selectedResult.patientId}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Prescription</h3>
                    <p className="text-sm text-slate-900"><span className="font-bold">Prescripteur:</span> {getRequest(selectedResult.demandeId)?.prescriberName}</p>
                    <p className="text-sm text-slate-900"><span className="font-bold">Date prélèvement:</span> {new Date(getRequest(selectedResult.demandeId)?.date || '').toLocaleDateString()}</p>
                    <p className="text-sm text-slate-900"><span className="font-bold">Date validation:</span> {new Date(selectedResult.dateValidation || '').toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Results */}
                <div className="mb-12">
                  <h2 className="text-xl font-black text-slate-900 mb-6 border-b border-slate-200 pb-2">RÉSULTATS D'ANALYSES</h2>
                  
                  {selectedResult.lignes.map((ligne, idx) => (
                    <div key={idx} className="mb-8">
                      <h3 className="font-bold text-lg text-slate-800 mb-4 bg-slate-100 p-2 rounded-lg">{ligne.examName}</h3>
                      <table className="w-full text-left border-collapse mb-4">
                        <thead>
                          <tr className="border-b-2 border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                            <th className="pb-2 font-bold w-1/3">Paramètre</th>
                            <th className="pb-2 font-bold w-1/4">Résultat</th>
                            <th className="pb-2 font-bold w-1/6">Unité</th>
                            <th className="pb-2 font-bold">Valeurs de référence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ligne.parametres.map((param, pIdx) => (
                            <tr key={pIdx} className="border-b border-slate-100">
                              <td className="py-2 text-sm text-slate-700">{param.nom}</td>
                              <td className="py-2">
                                <span className={`text-sm font-bold ${param.isAnormal ? 'text-rose-600' : 'text-slate-900'}`}>
                                  {param.valeur}
                                  {param.isAnormal && ' *'}
                                </span>
                              </td>
                              <td className="py-2 text-sm text-slate-500">{param.unite}</td>
                              <td className="py-2 text-xs text-slate-500">{param.valeurReference}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {ligne.conclusion && (
                        <div className="mt-2 text-sm text-slate-700 italic">
                          <span className="font-bold not-italic text-slate-900">Conclusion: </span>
                          {ligne.conclusion}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {selectedResult.commentaireGlobal && (
                  <div className="mb-12 p-4 border border-slate-200 rounded-xl">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Commentaire Global</h3>
                    <p className="text-sm text-slate-700">{selectedResult.commentaireGlobal}</p>
                  </div>
                )}

                {/* Signatures */}
                <div className="flex justify-between mt-16 pt-8 border-t border-slate-200">
                  <div className="text-center">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-8">Technicien</p>
                    <p className="font-bold text-slate-900">{selectedResult.saisiPar}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-8">Biologiste Validateur</p>
                    <p className="font-bold text-slate-900">{selectedResult.validePar}</p>
                  </div>
                </div>
                
                <div className="mt-8 text-center text-[10px] text-slate-400">
                  <p>* Résultat hors des valeurs de référence</p>
                  <p>Ce rapport a été généré électroniquement et est valide sans signature manuscrite.</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <FileText size={64} className="mb-6 opacity-20" />
            <h2 className="text-xl font-bold text-slate-600 mb-2">Sélectionnez un résultat validé</h2>
            <p className="text-sm max-w-md">Choisissez un résultat pour prévisualiser, imprimer ou archiver le rapport.</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default RapportsTab;
