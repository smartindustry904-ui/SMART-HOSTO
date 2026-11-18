const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');
const fs = require('fs');

async function testInteractive() {
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  const app = initializeApp(config);
  const db = getFirestore(app);

  const s = await getDoc(doc(db, 'whatsapp_config', 'settings'));
  const d = s.data();
  const token = d.accessToken;
  const phoneNumberId = d.phoneNumberId || '1172475902608668';

  const targetPhone = '237688252720';

  console.log('Sending Interactive Speciality List to', targetPhone);

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: targetPhone,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: '1/3 • Spécialité Médicale'
      },
      body: {
        text: 'Bienvenue sur la prise de rendez-vous SMART-HOSTO !\nVeuillez sélectionner le service médical souhaité pour votre consultation :'
      },
      footer: {
        text: 'Accueil SMART-HOSTO'
      },
      action: {
        button: 'Choisir le service',
        sections: [
          {
            title: 'Services Médicaux',
            rows: [
              { id: 'dept_general', title: 'Médecine Générale', description: 'Consultations courantes, bilans' },
              { id: 'dept_pediatrie', title: 'Pédiatrie', description: 'Nourrissons, enfants et ados' },
              { id: 'dept_maternite', title: 'Gynéco & Maternité', description: 'Suivi grossesse, santé femmes' },
              { id: 'dept_cardiologie', title: 'Cardiologie', description: 'Cœur, hypertension, ECG' },
              { id: 'dept_ophtalmo', title: 'Ophtalmologie', description: 'Vision, soins des yeux' },
              { id: 'dept_dentaire', title: 'Chirurgie Dentaire', description: 'Soins dentaires, caries' },
              { id: 'dept_laboratoire', title: 'Analyses Médicales', description: 'Prises de sang, bilans bio' }
            ]
          }
        ]
      }
    }
  };

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const resData = await res.json();
  console.log('Result:', JSON.stringify(resData, null, 2));
  process.exit(0);
}

testInteractive().catch(err => {
  console.error(err);
  process.exit(1);
});
