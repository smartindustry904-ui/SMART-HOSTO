const fs = require('fs');
let content = fs.readFileSync('pages/Emergency.tsx', 'utf8');

const target = `    setPatients(patients.map(p => 
      p.id === selectedPatient.id ? { ...p, orientation, status: 'ORIENTED' as const } : p
    ));
    setSelectedPatient(null);
  };`;

const replace = `    setPatients(patients.map(p => 
      p.id === selectedPatient.id ? { ...p, orientation, status: 'ORIENTED' as const } : p
    ));
    setSelectedPatient(null);
    } finally { setIsProcessing(false); }
  };`;

if (content.includes(target)) {
   content = content.replace(target, replace);
   fs.writeFileSync('pages/Emergency.tsx', content, 'utf8');
   console.log('Fixed orientation successfully');
} else {
   console.log('Target not found for orientation');
}
