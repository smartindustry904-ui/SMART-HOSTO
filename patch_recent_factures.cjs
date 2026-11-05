const fs = require('fs');
let content = fs.readFileSync('pages/tools/FacturationTool.tsx', 'utf8');

const targetStr = `              {lignes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <ShoppingCart size={48} className="mb-4 opacity-20" />
                  <p>Aucune ligne de facturation</p>
                </div>
              ) : (`;

const replaceStr = `              {lignes.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6">
                  <ShoppingCart size={48} className="mb-4 opacity-20" />
                  <p className="mb-6 font-bold">Aucune ligne de facturation en cours</p>
                  
                  {/* Recent Factures */}
                  <div className="w-full max-w-lg bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                       <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Factures Récentes</h4>
                       <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold">{transactions.length}</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {transactions.slice().sort((a,b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()).slice(0, 5).map(tx => (
                        <div key={tx.id} className="p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 flex justify-between items-center cursor-pointer transition-colors" onClick={() => {
                           setLastTransaction(tx);
                           setShowReceipt(true);
                        }}>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{tx.patientId || 'Client'}</p>
                            <p className="text-[10px] text-slate-500">{new Date(tx.createdAt || tx.date).toLocaleString('fr-FR')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-emerald-600">{tx.montantTotal.toLocaleString()} CFA</p>
                            <span className="text-[9px] uppercase font-bold text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">{tx.modePaiement}</span>
                          </div>
                        </div>
                      ))}
                      {transactions.length === 0 && (
                        <p className="text-xs text-center text-slate-400 py-4">Aucune facture récente</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replaceStr);
  fs.writeFileSync('pages/tools/FacturationTool.tsx', content, 'utf8');
  console.log('Recent factures added successfully');
} else {
  console.log('Target for recent factures not found');
}
