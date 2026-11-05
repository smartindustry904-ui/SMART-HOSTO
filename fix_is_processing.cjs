const fs = require('fs');
let content = fs.readFileSync('pages/Emergency.tsx', 'utf8');

const target = `  const [orientationForm, setOrientationForm] = useState({`;

const replace = `  const [isProcessing, setIsProcessing] = useState(false);
  const [orientationForm, setOrientationForm] = useState({`;

if (content.includes(target)) {
   content = content.replace(target, replace);
   fs.writeFileSync('pages/Emergency.tsx', content, 'utf8');
   console.log('Fixed isProcessing successfully');
} else {
   console.log('Target not found for isProcessing');
}
