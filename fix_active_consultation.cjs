const fs = require('fs');
let content = fs.readFileSync('pages/consultation/ActiveConsultation.tsx', 'utf8');

const target = `  onHospitalize,
  onClose
}) => {`;

const replace = `  onHospitalize,
  onClose,
  isSaving
}) => {`;

if (content.includes(target)) {
   content = content.replace(target, replace);
   fs.writeFileSync('pages/consultation/ActiveConsultation.tsx', content, 'utf8');
   console.log('Fixed ActiveConsultation.tsx');
} else {
   console.log('Target not found in ActiveConsultation.tsx');
}
