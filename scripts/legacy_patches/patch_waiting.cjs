const fs = require('fs');
let content = fs.readFileSync('pages/consultation/WaitingRoom.tsx', 'utf8');

content = content.replace(/\{p\.motif\}/g, '{p.motifLabel || p.motif}');

fs.writeFileSync('pages/consultation/WaitingRoom.tsx', content, 'utf8');
console.log('Fixed WaitingRoom.tsx successfully');
