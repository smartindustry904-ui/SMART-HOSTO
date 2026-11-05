const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const target = `              motif: data.motif || 'CONSULTATION',
              paymentStatus: data.paymentStatus || 'SOLDE',
              priority: data.priority || 'normal',`;

const replace = `              motif: data.motif || 'CONSULTATION',
              motifId: data.motifId || '',
              speciality: data.speciality || '',
              queueName: data.queueName || '',
              service: data.service || '',
              serviceId: data.serviceId || '',
              paymentStatus: data.paymentStatus || 'SOLDE',
              priority: data.priority || 'normal',`;

if (content.includes(target)) {
   content = content.replace(target, replace);
   fs.writeFileSync('App.tsx', content, 'utf8');
   console.log('Fixed App.tsx successfully');
} else {
   console.log('Target not found in App.tsx');
}
