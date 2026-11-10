const fs = require('fs');
let content = fs.readFileSync('pages/tools/FacturationTool.tsx', 'utf8');

// add firebase import
if (!content.includes("import { db } from '../../src/firebase';")) {
  content = content.replace("import { PaymentRequest", "import { db } from '../../src/firebase';\nimport { doc, updateDoc, collection, setDoc } from 'firebase/firestore';\nimport { PaymentRequest");
}

// modify handleValidate to be async and update Firebase
const validateTarget = `  const handleValidate = () => {
    if (!canValidate || !selectedPatientId) return;`;

const validateReplace = `  const [isProcessing, setIsProcessing] = useState(false);
  const handleValidate = async () => {
    if (!canValidate || !selectedPatientId || isProcessing) return;
    setIsProcessing(true);
    try {`;

const validateEndTarget = `    // Reset
    setLignes([]);
    setMontantRemis('');
    setLastTransaction(nouvelleTransaction);
    setShowReceipt(true);
  };`;

const validateEndReplace = `    // Mettre à jour Firebase
    for (const pr of prIds) {
      const prData = paymentRequests.find(p => p.id === pr);
      if (prData) {
        await updateDoc(doc(db, 'payment_requests', pr), {
          status: 'PAID',
          amountPaid: prData.totalAmount
        });
      }
    }
    await setDoc(doc(db, 'cashier_transactions', transactionId), {
       ...nouvelleTransaction
    });

    // Reset
    setLignes([]);
    setMontantRemis('');
    setLastTransaction(nouvelleTransaction);
    setShowReceipt(true);
    window.dispatchEvent(new CustomEvent('app-notification', { detail: 'Facturation validée avec succès !' }));
    } catch (e) {
       console.error("Facturation error", e);
       alert("Erreur de sauvegarde de la transaction.");
    } finally {
       setIsProcessing(false);
    }
  };`;

if (content.includes(validateTarget) && content.includes(validateEndTarget)) {
  content = content.replace(validateTarget, validateReplace);
  content = content.replace(validateEndTarget, validateEndReplace);
  
  // Update button disabled state
  content = content.replace(
    `disabled={!canValidate}`, 
    `disabled={!canValidate || isProcessing}`
  );
  content = content.replace(
    `<CheckCircle size={20} />\n              Valider & Imprimer`, 
    `{isProcessing ? "Traitement..." : <><CheckCircle size={20} /> Valider & Imprimer</>}`
  );
  
  fs.writeFileSync('pages/tools/FacturationTool.tsx', content, 'utf8');
  console.log("Updated FacturationTool successfully");
} else {
  console.log("Could not find targets in FacturationTool");
}
