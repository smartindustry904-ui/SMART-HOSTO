const fs = require('fs');
let content = fs.readFileSync('pages/Pharmacy.tsx', 'utf8');

const target = `import { Pill, Search, ShoppingCart, Clock, CheckCircle, FileText, Package, Home } from 'lucide-react';`;
const replace = `import { Pill, Search, ShoppingCart, Clock, CheckCircle, FileText, Package, Home, Loader2 } from 'lucide-react';`;

if (content.includes(target)) {
   content = content.replace(target, replace);
   fs.writeFileSync('pages/Pharmacy.tsx', content, 'utf8');
   console.log('Fixed Pharmacy.tsx');
} else {
   console.log('Target not found in Pharmacy.tsx');
}
