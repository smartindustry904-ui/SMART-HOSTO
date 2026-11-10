const fs = require('fs');
let content = fs.readFileSync('pages/tools/FacturationTool.tsx', 'utf8');

// Add states for patient search
const stateTarget = `  const [useAvoir, setUseAvoir] = useState<boolean>(parametres.applicationAutoAvoir);`;
const stateReplace = `  const [useAvoir, setUseAvoir] = useState<boolean>(parametres.applicationAutoAvoir);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [showPatientResults, setShowPatientResults] = useState(false);
`;

// Extract unique patients logic
const uniqueTarget = `  const sousTotal = lignes.reduce((sum, l) => sum + l.montantTotal, 0);`;
const uniqueReplace = `  const uniquePatients = useMemo(() => {
    const patientsMap = new Map();
    paymentRequests.forEach(pr => {
      if (pr.patientId && pr.patientName) {
        patientsMap.set(pr.patientId, { id: pr.patientId, name: pr.patientName });
      }
    });
    transactions.forEach(tx => {
      if (tx.patientId) {
        patientsMap.set(tx.patientId, { id: tx.patientId, name: tx.patientId }); // Ideally we'd have name in tx, but fallback to ID
      }
    });
    return Array.from(patientsMap.values());
  }, [paymentRequests, transactions]);

  const filteredPatients = useMemo(() => {
    if (!patientSearchQuery) return [];
    const lowerQ = patientSearchQuery.toLowerCase();
    return uniquePatients.filter(p => p.name.toLowerCase().includes(lowerQ) || p.id.toLowerCase().includes(lowerQ));
  }, [patientSearchQuery, uniquePatients]);

  const sousTotal = lignes.reduce((sum, l) => sum + l.montantTotal, 0);`;

// Replace search input UI
const searchTarget = `              <div className="w-1/3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="ID Patient (ex: P-101)" 
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  />
                </div>
              </div>`;

const searchReplace = `              <div className="w-1/2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Rechercher un patient (Nom ou ID)..." 
                    value={patientSearchQuery}
                    onChange={(e) => {
                      setPatientSearchQuery(e.target.value);
                      setShowPatientResults(true);
                      if (!e.target.value) {
                         setSelectedPatientId('');
                         setLignes([]);
                      }
                    }}
                    onFocus={() => setShowPatientResults(true)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold transition-all text-sm"
                  />
                  {selectedPatientId && !showPatientResults && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                      <CheckCircle size={12} /> {selectedPatientId}
                    </div>
                  )}
                  {showPatientResults && filteredPatients.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 max-h-60 overflow-y-auto z-50">
                      {filteredPatients.map(p => (
                        <div 
                          key={p.id}
                          className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 flex justify-between items-center"
                          onClick={() => {
                            setSelectedPatientId(p.id);
                            setPatientSearchQuery(p.name);
                            setShowPatientResults(false);
                          }}
                        >
                          <span className="font-bold text-slate-900">{p.name}</span>
                          <span className="text-xs font-mono text-slate-400">{p.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {showPatientResults && patientSearchQuery && filteredPatients.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 p-4 text-center z-50 text-sm text-slate-500">
                      Aucun patient trouvé.
                    </div>
                  )}
                </div>
              </div>`;

if (content.includes(stateTarget)) {
  content = content.replace(stateTarget, stateReplace);
  content = content.replace(uniqueTarget, uniqueReplace);
  content = content.replace(searchTarget, searchReplace);
  fs.writeFileSync('pages/tools/FacturationTool.tsx', content, 'utf8');
  console.log("Updated FacturationTool UI successfully");
} else {
  console.log("Target not found");
}
