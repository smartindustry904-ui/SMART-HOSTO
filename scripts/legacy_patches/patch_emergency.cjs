const fs = require('fs');
let content = fs.readFileSync('pages/Emergency.tsx', 'utf8');

const stateTarget = `  const [activeMenu, setActiveMenu] = useState<EmergencySubMenu>('TRIAGE');`;
const stateReplace = `  const [activeMenu, setActiveMenu] = useState<EmergencySubMenu>('TRIAGE');
  const [isProcessing, setIsProcessing] = useState(false);
`;

const replaceFunction = (funcName) => {
  const funcTarget = `  const ${funcName} = () => {
    // In a real app, this would save to a database`;
  const funcReplace = `  const ${funcName} = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    // Simulation of network request
    await new Promise(resolve => setTimeout(resolve, 800));
    window.dispatchEvent(new CustomEvent('app-notification', { detail: 'Action complétée avec succès.' }));
    // In a real app, this would save to a database`;
    
  if (content.includes(funcTarget)) {
    content = content.replace(funcTarget, funcReplace);
    // Replace the end of the function to reset processing state
    const endTargetRegex = new RegExp(`(    setActiveMenu\\(.*\\);\n  };)`, "g");
    // Wait, replacing by regex could be tricky if it matches multiple. Let's do a simpler replace.
  }
}

// Since doing regex replacement on functions might be error prone, I'll do standard replaces.
let patched = false;

const triageTgt = `  const handleTriageSubmit = () => {`;
const triageRep = `  const handleTriageSubmit = async () => {
    if(isProcessing) return; setIsProcessing(true);
    try { await new Promise(r => setTimeout(r, 600));`;
const triageEndTgt = `    setActiveMenu('MANAGEMENT');
  };`;
const triageEndRep = `    setActiveMenu('MANAGEMENT');
    window.dispatchEvent(new CustomEvent('app-notification', { detail: 'Triage enregistré.' }));
    } finally { setIsProcessing(false); }
  };`;

if(content.includes(triageTgt)) {
   content = content.replace(triageTgt, triageRep);
   content = content.replace(triageEndTgt, triageEndRep);
   patched = true;
}

const mgmtTgt = `  const handleManagementSubmit = () => {`;
const mgmtRep = `  const handleManagementSubmit = async () => {
    if(isProcessing) return; setIsProcessing(true);
    try { await new Promise(r => setTimeout(r, 600));`;
const mgmtEndTgt = `    setActiveMenu('MONITORING');
  };`;
const mgmtEndRep = `    setActiveMenu('MONITORING');
    window.dispatchEvent(new CustomEvent('app-notification', { detail: 'Prise en charge enregistrée.' }));
    } finally { setIsProcessing(false); }
  };`;

if(content.includes(mgmtTgt)) {
   content = content.replace(mgmtTgt, mgmtRep);
   content = content.replace(mgmtEndTgt, mgmtEndRep);
}

const monTgt = `  const handleMonitoringSubmit = () => {`;
const monRep = `  const handleMonitoringSubmit = async () => {
    if(isProcessing) return; setIsProcessing(true);
    try { await new Promise(r => setTimeout(r, 600));`;
const monEndTgt = `    setActiveMenu('DISCHARGE');
  };`;
const monEndRep = `    setActiveMenu('DISCHARGE');
    window.dispatchEvent(new CustomEvent('app-notification', { detail: 'Surveillance enregistrée.' }));
    } finally { setIsProcessing(false); }
  };`;

if(content.includes(monTgt)) {
   content = content.replace(monTgt, monRep);
   content = content.replace(monEndTgt, monEndRep);
}

const orientTgt = `  const handleOrientationSubmit = () => {`;
const orientRep = `  const handleOrientationSubmit = async () => {
    if(isProcessing) return; setIsProcessing(true);
    try { await new Promise(r => setTimeout(r, 600));`;
const orientEndTgt = `    onBackToDashboard();
  };`;
const orientEndRep = `    onBackToDashboard();
    window.dispatchEvent(new CustomEvent('app-notification', { detail: 'Orientation complétée.' }));
    } finally { setIsProcessing(false); }
  };`;

if(content.includes(orientTgt)) {
   content = content.replace(orientTgt, orientRep);
   content = content.replace(orientEndTgt, orientEndRep);
}

// Add state
if (content.includes(stateTarget) && !content.includes("isProcessing")) {
  content = content.replace(stateTarget, stateReplace);
}

// Add disabled to submit buttons
content = content.replace(/className="flex items-center gap-2 bg-rose-600 text-white px-6 py-3 rounded-xl hover:bg-rose-500 transition-colors font-bold shadow-sm"/g, 'disabled={isProcessing} className="flex items-center gap-2 bg-rose-600 text-white px-6 py-3 rounded-xl hover:bg-rose-500 transition-colors font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"');

if (patched) {
  fs.writeFileSync('pages/Emergency.tsx', content, 'utf8');
  console.log('Emergency.tsx patched');
}
