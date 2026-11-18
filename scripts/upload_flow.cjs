const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');
const fs = require('fs');

async function run() {
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  const app = initializeApp(config);
  const db = getFirestore(app);

  const s = await getDoc(doc(db, 'whatsapp_config', 'settings'));
  const d = s.data();
  const token = d.accessToken;
  const flowId = '1071356225912631';

  const flowJson = {
    version: '6.0',
    screens: [
      {
        id: 'APPOINTMENT_FORM',
        title: 'Prise de Rendez-vous',
        terminal: true,
        success: true,
        data: {},
        layout: {
          type: 'SingleColumnLayout',
          children: [
            {
              type: 'Form',
              name: 'flow_form',
              children: [
                {
                  type: 'TextHeading',
                  text: 'Hôpital SMART-HOSTO'
                },
                {
                  type: 'TextSubheading',
                  text: 'Remplissez ce formulaire pour planifier votre consultation médicale.'
                },
                {
                  type: 'Dropdown',
                  name: 'department',
                  label: 'Service ou Spécialité',
                  required: true,
                  'data-source': [
                    { id: 'general', title: 'Médecine Générale' },
                    { id: 'pediatrie', title: 'Pédiatrie' },
                    { id: 'maternite', title: 'Gynécologie & Maternité' },
                    { id: 'cardiologie', title: 'Cardiologie' },
                    { id: 'ophtalmologie', title: 'Ophtalmologie' },
                    { id: 'dentaire', title: 'Chirurgie Dentaire' },
                    { id: 'laboratoire', title: 'Analyses de Laboratoire' }
                  ]
                },
                {
                  type: 'DatePicker',
                  name: 'appointment_date',
                  label: 'Date souhaitée',
                  required: true
                },
                {
                  type: 'Dropdown',
                  name: 'time_slot',
                  label: 'Créneau horaire',
                  required: true,
                  'data-source': [
                    { id: '08_10', title: '08h00 - 10h00 (Matin)' },
                    { id: '10_12', title: '10h00 - 12h00 (Midi)' },
                    { id: '14_16', title: '14h00 - 16h00 (Après-midi)' },
                    { id: '16_18', title: '16h00 - 18h00 (Fin d’après-midi)' }
                  ]
                },
                {
                  type: 'TextInput',
                  name: 'patient_name',
                  label: 'Nom complet du patient',
                  required: true
                },
                {
                  type: 'TextInput',
                  name: 'reason',
                  label: 'Motif ou symptômes (optionnel)',
                  required: false
                },
                {
                  type: 'Footer',
                  label: 'Valider le Rendez-vous',
                  'on-click-action': {
                    name: 'complete',
                    payload: {
                      department: '${form.department}',
                      appointment_date: '${form.appointment_date}',
                      time_slot: '${form.time_slot}',
                      patient_name: '${form.patient_name}',
                      reason: '${form.reason}'
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    ]
  };

  const jsonStr = JSON.stringify(flowJson, null, 2);
  fs.writeFileSync('temp_flow.json', jsonStr, 'utf8');

  const formData = new FormData();
  formData.append('name', 'flow.json');
  formData.append('asset_type', 'FLOW_JSON');
  formData.append('file', new Blob([jsonStr], { type: 'application/json' }), 'flow.json');

  const res = await fetch(`https://graph.facebook.com/v21.0/${flowId}/assets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  const resData = await res.json();
  console.log('Upload Asset Result:', JSON.stringify(resData, null, 2));

  // If success, publish the flow
  if (resData.success && (!resData.validation_errors || resData.validation_errors.length === 0)) {
    console.log('Publishing Flow...');
    const pubRes = await fetch(`https://graph.facebook.com/v21.0/${flowId}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const pubData = await pubRes.json();
    console.log('Publish Flow Result:', JSON.stringify(pubData, null, 2));
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
