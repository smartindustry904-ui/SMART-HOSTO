const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const target = `              motifId: data.motifId || '',`;
const replace = `              motifId: data.motifId || '',
              motifLabel: data.motifLabel || '',`;

if (content.includes(target)) {
   content = content.replace(target, replace);
   fs.writeFileSync('App.tsx', content, 'utf8');
   console.log('Fixed App.tsx successfully');
} else {
   console.log('Target not found in App.tsx');
}
