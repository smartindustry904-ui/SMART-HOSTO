const fs = require('fs');
let content = fs.readFileSync('pages/Emergency.tsx', 'utf8');

const fixFunctionEnd = (searchTarget, replaceTarget) => {
   if (content.includes(searchTarget)) {
       content = content.replace(searchTarget, replaceTarget);
   } else {
       console.log('could not find:', searchTarget.substring(0, 50));
   }
}

fixFunctionEnd(
`    console.log(\`[ER] Patient \${selectedPatient.lastName} trié en \${triageLevel}\`);
  };`, 
`    console.log(\`[ER] Patient \${selectedPatient.lastName} trié en \${triageLevel}\`);
    } finally { setIsProcessing(false); }
  };`
);

fixFunctionEnd(
`    setActiveMenu('ER_ROOM');
    setSelectedPatient(null);
  };`,
`    setActiveMenu('ER_ROOM');
    setSelectedPatient(null);
    } finally { setIsProcessing(false); }
  };`
);

fixFunctionEnd(
`      p.id === selectedPatient.id ? { ...p, monitoring: [...p.monitoring, monitoring] } : p
    ));
    setSelectedPatient(null);
  };`,
`      p.id === selectedPatient.id ? { ...p, monitoring: [...p.monitoring, monitoring] } : p
    ));
    setSelectedPatient(null);
    } finally { setIsProcessing(false); }
  };`
);

fixFunctionEnd(
`      p.id === selectedPatient.id ? { ...p, orientation } : p
    ));
    
    // Simulate removing patient from ER
    setTimeout(() => {
      setPatients(prev => prev.filter(p => p.id !== selectedPatient.id));
      setSelectedPatient(null);
      setActiveMenu('TRIAGE');
    }, 2000);
  };`,
`      p.id === selectedPatient.id ? { ...p, orientation } : p
    ));
    
    // Simulate removing patient from ER
    setTimeout(() => {
      setPatients(prev => prev.filter(p => p.id !== selectedPatient.id));
      setSelectedPatient(null);
      setActiveMenu('TRIAGE');
    }, 2000);
    } finally { setIsProcessing(false); }
  };`
);

fs.writeFileSync('pages/Emergency.tsx', content, 'utf8');
console.log('Fixed Emergency.tsx');
