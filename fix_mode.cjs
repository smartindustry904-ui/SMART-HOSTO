const fs = require('fs');
let content = fs.readFileSync('pages/tools/IntelligentConsultation.tsx', 'utf8');
content = content.replace(
  `    if (mot.includes('générale') || mot.includes('interne') || spec.includes('générale') || spec.includes('interne') || qName.includes('générale') || qName.includes('interne') || mot.includes('generale') || spec.includes('generale') || qName.includes('generale')) return null;`,
  `    if (mot.includes('générale') || mot.includes('interne') || spec.includes('générale') || spec.includes('interne') || qName.includes('générale') || qName.includes('interne') || mot.includes('generale') || spec.includes('generale') || qName.includes('generale')) return 'medecine_generale';`
);
fs.writeFileSync('pages/tools/IntelligentConsultation.tsx', content, 'utf8');
