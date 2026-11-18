const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');
const fs = require('fs');

async function testSendFlow() {
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  const app = initializeApp(config);
  const db = getFirestore(app);

  const s = await getDoc(doc(db, 'whatsapp_config', 'settings'));
  const d = s.data();
  const token = d.accessToken;
  const phoneNumberId = d.phoneNumberId || '1172475902608668';
  const flowId = '1071356225912631';

  // Target recipient
  const targetPhone = '237688252720';

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: targetPhone,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: {
        type: 'text',
        text: 'SMART-HOSTO - Rendez-vous'
      },
      body: {
        text: 'Bonjour ! Vous pouvez planifier votre consultation médicale instantanément en cliquant ci-dessous :'
      },
      footer: {
        text: 'Service Accueil & Admissions'
      },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: 'unused',
          flow_id: flowId,
          flow_cta: 'Prendre Rendez-vous',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'APPOINTMENT_FORM'
          },
          mode: 'draft'
        }
      }
    }
  };

  console.log(`Sending draft flow to ${targetPhone}...`);
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const resData = await res.json();
  console.log('Send Flow Result:', JSON.stringify(resData, null, 2));
  process.exit(0);
}

testSendFlow().catch(err => {
  console.error(err);
  process.exit(1);
});
