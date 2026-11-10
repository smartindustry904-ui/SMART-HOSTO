const fs = require('fs');
let content = fs.readFileSync('pages/tools/IntelligentConsultation.tsx', 'utf8');
content = content.replace(
  `if (['medecine_generale', 'medecine_interne'].includes(mId)) return null;`,
  `if (['medecine_generale', 'medecine_interne'].includes(mId)) return 'medecine_generale';`
);
fs.writeFileSync('pages/tools/IntelligentConsultation.tsx', content, 'utf8');
