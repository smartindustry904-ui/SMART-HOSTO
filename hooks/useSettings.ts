import { useState, useEffect, useCallback } from 'react';
import { EstablishmentConfig, ParametresCaisse, Role, Service, MedicalAct } from '../types';
import { db, sanitizeData } from '../src/firebase';
import { collection, onSnapshot, query, limit, getDocs, addDoc, updateDoc, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

export const PREDEFINED_MEDICAL_ACTS: Partial<MedicalAct>[] = [
  // CONSULTATIONS
  {
    id: 'ACT-CONS-GEN',
    name: 'Consultation Médecine Générale',
    price: 10000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Médecine générale',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-GEN',
    description: 'Consultation de médecine générale pour adulte ou adolescent'
  },
  {
    id: 'ACT-CONS-PED',
    name: 'Consultation Pédiatrique',
    price: 10000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Pédiatrie',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-PED',
    description: 'Consultation pédiatrique pour nourrissons et enfants'
  },
  {
    id: 'ACT-CONS-GYN',
    name: 'Consultation Gynécologique',
    price: 10000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Gynécologie',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-GYN',
    description: 'Consultation et suivi gynécologique (Médecin / Gynécologue)'
  },
  {
    id: 'ACT-CONS-OBS',
    name: 'Consultation Obstétricale',
    price: 10000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Obstétrique',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-OBS',
    description: 'Consultation spécialisée en obstétrique (Médecin / Gynécologue)'
  },
  {
    id: 'ACT-CPN-01',
    name: 'Consultation Prénatale (CPN)',
    price: 5000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'maternite',
    sousService: 'CPN',
    priorite: 'normal',
    codeInterne: 'ACT-CPN-01',
    description: 'Consultation prénatale de suivi de grossesse'
  },
  {
    id: 'ACT-CPN-POST',
    name: 'Consultation Postnatale',
    price: 5000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'maternite',
    sousService: 'Consultation Postnatale',
    priorite: 'normal',
    codeInterne: 'ACT-CPN-POST',
    description: 'Consultation de suivi après accouchement'
  },
  {
    id: 'ACT-CONS-CHIR',
    name: 'Consultation Chirurgicale',
    price: 10000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Chirurgie',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-CHIR',
    description: 'Consultation spécialisée de chirurgie'
  },
  {
    id: 'ACT-CONS-TRAUMA',
    name: 'Consultation Traumatologie',
    price: 10000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Traumatologie',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-TRAUMA',
    description: 'Consultation pour traumatismes osseux ou articulaires'
  },
  {
    id: 'ACT-CONS-INTERNE',
    name: 'Consultation Médecine Interne',
    price: 10000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Médecine interne',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-INTERNE',
    description: 'Consultation spécialisée de médecine interne'
  },
  {
    id: 'ACT-CONS-CARDIO',
    name: 'Consultation Cardiologie',
    price: 15000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Cardiologie',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-CARDIO',
    description: 'Consultation spécialisée en cardiologie'
  },
  {
    id: 'ACT-CONS-OPHTA',
    name: 'Consultation Ophtalmologie',
    price: 15000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Ophtalmologie',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-OPHTA',
    description: 'Consultation spécialisée des yeux et de la vision'
  },
  {
    id: 'ACT-CONS-DERMATO',
    name: 'Consultation Dermatologie',
    price: 15000,
    category: 'consultation',
    type: 'acte médical',
    servicePrincipal: 'consultation',
    sousService: 'Dermatologie',
    priorite: 'normal',
    codeInterne: 'ACT-CONS-DERMATO',
    description: 'Consultation spécialisée de dermatologie'
  },

  // MATERNITÉ
  {
    id: 'ACT-MAT-ACCOUCH',
    name: 'Travail / Accouchement',
    price: 25000,
    category: 'accouchement',
    type: 'acte médical',
    servicePrincipal: 'maternite',
    sousService: 'Salle de travail',
    priorite: 'urgent',
    codeInterne: 'ACT-MAT-ACCOUCH',
    description: 'Prise en charge de travail et accouchement eutocique'
  },
  {
    id: 'ACT-MAT-CESAR',
    name: 'Césarienne',
    price: 120000,
    category: 'chirurgie',
    type: 'intervention',
    servicePrincipal: 'maternite',
    sousService: 'Bloc obstétrical',
    priorite: 'urgent',
    codeInterne: 'ACT-MAT-CESAR',
    description: 'Césarienne programmée ou d\'urgence'
  },

  // URGENCES
  {
    id: 'ACT-URG-ADULTE',
    name: 'Urgence Adulte',
    price: 15000,
    category: 'urgence',
    type: 'acte médical',
    servicePrincipal: 'urgences',
    sousService: 'Urgences Vitales',
    priorite: 'urgent',
    codeInterne: 'ACT-URG-ADULTE',
    description: 'Prise en charge d\'urgence médicale adulte'
  },
  {
    id: 'ACT-URG-PED',
    name: 'Urgence Pédiatrique',
    price: 15000,
    category: 'urgence',
    type: 'acte médical',
    servicePrincipal: 'urgences',
    sousService: 'Urgence Pédiatrique',
    priorite: 'urgent',
    codeInterne: 'ACT-URG-PED',
    description: 'Prise en charge d\'urgence pédiatrique'
  },
  {
    id: 'ACT-URG-OBS',
    name: 'Urgence Obstétricale',
    price: 15000,
    category: 'urgence',
    type: 'acte médical',
    servicePrincipal: 'urgences',
    sousService: 'Urgence Obstétricale',
    priorite: 'urgent',
    codeInterne: 'ACT-URG-OBS',
    description: 'Prise en charge d\'urgence obstétricale'
  },
  {
    id: 'ACT-URG-TRAUMA',
    name: 'Traumatisme & Déchoquage',
    price: 15000,
    category: 'urgence',
    type: 'acte médical',
    servicePrincipal: 'urgences',
    sousService: 'Traumatisme',
    priorite: 'critique',
    codeInterne: 'ACT-URG-TRAUMA',
    description: 'Prise en charge de traumatismes majeurs et déchoquage'
  },

  // HOSPITALISATION
  {
    id: 'ACT-HOSP-DIR',
    name: 'Hospitalisation Directe (Entrée)',
    price: 15000,
    category: 'hospitalisation',
    type: 'prestation administrative',
    servicePrincipal: 'hospitalisation',
    sousService: 'Hospitalisation',
    priorite: 'normal',
    codeInterne: 'ACT-HOSP-DIR',
    description: 'Frais d\'entrée et admission directe en hospitalisation'
  },

  // SOINS INFIRMIERS & AUTRES SERVICES
  {
    id: 'ACT-SOIN-INF',
    name: 'Soins Infirmiers & Pansement',
    price: 2500,
    category: 'soin',
    type: 'soin infirmier',
    servicePrincipal: 'soins_infirmiers',
    sousService: 'Soins infirmiers',
    priorite: 'normal',
    codeInterne: 'ACT-SOIN-INF',
    description: 'Réfection de pansement, injections, perfusions et soins'
  },
  {
    id: 'ACT-SOIN-VACC',
    name: 'Vaccination & Immunisation',
    price: 1000,
    category: 'soin',
    type: 'soin infirmier',
    servicePrincipal: 'vaccination',
    sousService: 'Vaccination',
    priorite: 'normal',
    codeInterne: 'ACT-SOIN-VACC',
    description: 'Séance de vaccination pédiatrique ou adulte'
  },
  {
    id: 'ACT-LAB-BILAN',
    name: 'Bilan Biologique / Laboratoire',
    price: 5000,
    category: 'analyse',
    type: 'examen',
    servicePrincipal: 'laboratoire',
    sousService: 'Laboratoire',
    priorite: 'normal',
    codeInterne: 'ACT-LAB-BILAN',
    description: 'Examens et analyses biologiques'
  },
  {
    id: 'ACT-PHARM-DISP',
    name: 'Pharmacie / Délivrance Médicaments',
    price: 0,
    category: 'soin',
    type: 'prestation administrative',
    servicePrincipal: 'pharmacie',
    sousService: 'Pharmacie',
    priorite: 'normal',
    codeInterne: 'ACT-PHARM-DISP',
    description: 'Dispensation et orientation vers le dispensaire / pharmacie'
  }
];

export const getDefaultMedicalActs = (): MedicalAct[] => {
  return PREDEFINED_MEDICAL_ACTS.map(a => ({
    ...a,
    price: a.price || 0,
    name: a.name || 'Acte',
    category: a.category || 'consultation',
    status: 'active'
  })) as MedicalAct[];
};

export const useMedicalActs = () => {
  const [acts, setActs] = useState<MedicalAct[]>(() => {
    const saved = localStorage.getItem('hospital_medical_acts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return getDefaultMedicalActs();
  });

  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isSubscribed = true;

    const unsub = onSnapshot(collection(db, 'medical_acts'), async (snapshot) => {
      if (!isSubscribed) return;

      if (!snapshot.empty) {
        const list = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
          name: d.data().name || d.data().nom || 'Acte sans nom',
          price: Number(d.data().price ?? d.data().prixBase ?? 0),
          category: d.data().category || d.data().categorie || 'consultation'
        }) as MedicalAct);

        setActs(list);
        localStorage.setItem('hospital_medical_acts', JSON.stringify(list));
      } else {
        // Initialize Firestore with default medical acts if empty
        const initial = getDefaultMedicalActs();
        setActs(initial);
        localStorage.setItem('hospital_medical_acts', JSON.stringify(initial));

        try {
          const batch = writeBatch(db);
          for (const a of initial) {
            const ref = doc(db, 'medical_acts', a.id);
            batch.set(ref, sanitizeData({ ...a, status: 'active', updatedAt: new Date().toISOString() }), { merge: true });
          }
          await batch.commit();
        } catch (e) {
          console.warn("Could not seed medical_acts in Firestore:", e);
        }
      }
      setLoading(false);
    }, (err) => {
      console.warn("Firestore medical_acts listener error:", err);
      const saved = localStorage.getItem('hospital_medical_acts');
      if (saved) {
        try { setActs(JSON.parse(saved)); } catch (e) {}
      }
      setLoading(false);
    });

    const handleStorageChange = () => {
      const saved = localStorage.getItem('hospital_medical_acts');
      if (saved) {
        try { setActs(JSON.parse(saved)); } catch (e) {}
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('medical-acts-updated', handleStorageChange);

    return () => {
      isSubscribed = false;
      unsub();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('medical-acts-updated', handleStorageChange);
    };
  }, []);

  const addAct = useCallback(async (newAct: Partial<MedicalAct>) => {
    const actId = newAct.id || `ACT-${Date.now()}`;
    const fullAct: MedicalAct = {
      id: actId,
      name: newAct.name || newAct.nom || 'Nouvel Acte',
      price: Number(newAct.price ?? newAct.prixBase ?? 0),
      category: newAct.category || newAct.categorie || 'consultation',
      status: 'active',
      ...newAct,
      updatedAt: new Date().toISOString()
    } as any;

    setActs(prev => {
      const next = [fullAct, ...prev.filter(a => a.id !== actId)];
      localStorage.setItem('hospital_medical_acts', JSON.stringify(next));
      return next;
    });
    window.dispatchEvent(new CustomEvent('medical-acts-updated'));

    try {
      const ref = doc(db, 'medical_acts', actId);
      await setDoc(ref, sanitizeData(fullAct), { merge: true });
    } catch (err) {
      console.error("Failed to add medical act to Firestore:", err);
    }
  }, []);

  const updateAct = useCallback(async (updatedAct: MedicalAct) => {
    setActs(prev => {
      const next = prev.map(a => a.id === updatedAct.id ? updatedAct : a);
      localStorage.setItem('hospital_medical_acts', JSON.stringify(next));
      return next;
    });
    window.dispatchEvent(new CustomEvent('medical-acts-updated'));

    try {
      const ref = doc(db, 'medical_acts', updatedAct.id);
      await setDoc(ref, sanitizeData({
        ...updatedAct,
        updatedAt: new Date().toISOString()
      }), { merge: true });
    } catch (err) {
      console.error("Failed to update medical act in Firestore:", err);
    }
  }, []);

  const deleteAct = useCallback(async (actId: string) => {
    setActs(prev => {
      const next = prev.filter(a => a.id !== actId);
      localStorage.setItem('hospital_medical_acts', JSON.stringify(next));
      return next;
    });
    window.dispatchEvent(new CustomEvent('medical-acts-updated'));

    try {
      const ref = doc(db, 'medical_acts', actId);
      await deleteDoc(ref);
    } catch (err) {
      console.error("Failed to delete medical act from Firestore:", err);
    }
  }, []);

  return { acts, setActs, addAct, updateAct, deleteAct, loading };
};

import { hasImplementedModule } from '../src/config/modules';

export const PREDEFINED_SERVICES: Partial<Service>[] = [
  // SERVICES CLINIQUES ET MÉDICO-TECHNIQUES DOTÉS D'UN MODULE IMPLÉMENTÉ (ACTIVÉS PAR DÉFAUT)
  { id: 'SRV-ACCUEIL', name: 'Accueil / Admission', type: 'clinique', status: 'active', description: 'Gestion des admissions et orientation des patients' },
  { id: 'SRV-CONSULTATION', name: 'Consultation externe', type: 'clinique', status: 'active', description: 'Consultations médicales générales et spécialisées', specificSettings: { consultationFee: 10000 } },
  { id: 'SRV-URGENCES', name: 'Urgences', type: 'clinique', status: 'active', description: 'Prise en charge des urgences médicales et chirurgicales', specificSettings: { consultationFee: 15000 } },
  { id: 'SRV-HOSPITALISATION', name: 'Hospitalisation', type: 'clinique', status: 'active', description: 'Séjour et suivi des patients hospitalisés', specificSettings: { hospitalBeds: 12, maternityBeds: 8, admissionFee: 15000 } },
  { id: 'SRV-MATERNITE', name: 'Maternité', type: 'clinique', status: 'active', description: 'Suivi de grossesse, accouchement et post-partum', specificSettings: { consultationFee: 5000 } },
  { id: 'SRV-LABO', name: 'Laboratoire', type: 'technique', status: 'active', description: 'Analyses de biologie médicale' },
  { id: 'SRV-PHARMACIE', name: 'Pharmacie', type: 'technique', status: 'active', description: 'Gestion et dispensation des médicaments' },
  { id: 'SRV-INFIRMIER', name: 'Soins infirmiers', type: 'soutien', status: 'active', description: 'Soins infirmiers généraux et spécialisés', specificSettings: { fee: 2500 } },
  { id: 'SRV-CAISSE', name: 'Comptabilité / caisse', type: 'administratif', status: 'active', description: 'Facturation et encaissement' },

  // SERVICES SANS MODULE FONCTIONNEL AUTONOME (DÉSACTIVÉS PAR DÉFAUT)
  { id: 'SRV-PEDIATRIE', name: 'Pédiatrie', type: 'clinique', status: 'inactive', description: 'Soins pédiatriques (intégré aux consultations et urgences)', specificSettings: { consultationFee: 10000 } },
  { id: 'SRV-BLOC', name: 'Bloc opératoire', type: 'clinique', status: 'inactive', description: 'Plateau technique d\'interventions chirurgicales' },
  { id: 'SRV-REA', name: 'Réanimation / soins intensifs', type: 'clinique', status: 'inactive', description: 'Soins intensifs et surveillance continue' },
  { id: 'SRV-IMAGERIE', name: 'Imagerie médicale', type: 'technique', status: 'inactive', description: 'Radiologie, échographie, scanner, IRM (module en cours de développement)' },
  { id: 'SRV-VACCINATION', name: 'Vaccination', type: 'soutien', status: 'inactive', description: 'Programme vaccinal (dispensé en soins ambulatoires)', specificSettings: { fee: 1000 } },
  { id: 'SRV-NUTRITION', name: 'Nutrition', type: 'soutien', status: 'inactive', description: 'Conseil et suivi diététique' },
  { id: 'SRV-KINE', name: 'Kinésithérapie', type: 'soutien', status: 'inactive', description: 'Rééducation et physiothérapie' },
  { id: 'SRV-ADMIN', name: 'Administration', type: 'administratif', status: 'inactive', description: 'Direction et gestion générale' },
  { id: 'SRV-RH', name: 'Ressources humaines', type: 'administratif', status: 'inactive', description: 'Gestion du personnel' },
  { id: 'SRV-ARCHIVES', name: 'Archivage médical', type: 'administratif', status: 'inactive', description: 'Gestion des archives médicales' },
  { id: 'SRV-DIALYSE', name: 'Dialyse', type: 'specialise', status: 'inactive', description: 'Hémodialyse et soins rénaux' },
  { id: 'SRV-ONCOLOGIE', name: 'Oncologie', type: 'specialise', status: 'inactive', description: 'Traitement des cancers' },
  { id: 'SRV-CARDIOLOGIE', name: 'Cardiologie', type: 'specialise', status: 'inactive', description: 'Maladies du cœur et des vaisseaux' },
  { id: 'SRV-DERMATOLOGIE', name: 'Dermatologie', type: 'specialise', status: 'inactive', description: 'Maladies de la peau' },
  { id: 'SRV-ORL', name: 'ORL', type: 'specialise', status: 'inactive', description: 'Oto-rhino-laryngologie' },
  { id: 'SRV-OPHTALMOLOGIE', name: 'Ophtalmologie', type: 'specialise', status: 'inactive', description: 'Maladies des yeux' },
  { id: 'SRV-PSYCHIATRIE', name: 'Psychiatrie', type: 'specialise', status: 'inactive', description: 'Santé mentale' },
];

export const getDefaultServices = (): Service[] => {
  return PREDEFINED_SERVICES.map((s, idx) => ({
    ...s,
    order: s.order ?? (idx + 1),
    is_active: s.status === 'active' && hasImplementedModule(s.id as string),
    users: [],
    activeTools: [],
    linkedModules: [],
    specificSettings: s.specificSettings || {}
  })) as Service[];
};

export const useHospitalServices = () => {
  const [services, setServices] = useState<Service[]>(() => {
    const saved = localStorage.getItem('hospital_services');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Reconcile on initialization
          return parsed.map((s: Service) => {
            const hasModule = hasImplementedModule(s.id);
            const active = hasModule && (s.status === 'active' || (s as any).is_active === true);
            return {
              ...s,
              status: (active ? 'active' : 'inactive') as 'active' | 'inactive',
              is_active: active
            };
          });
        }
      } catch (e) {}
    }
    return getDefaultServices();
  });

  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isSubscribed = true;

    const unsub = onSnapshot(collection(db, 'hospital_services'), async (snapshot) => {
      if (!isSubscribed) return;

      if (!snapshot.empty) {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Service);
        let correctionsToPersist: Service[] = [];

        // Ensure required fields, consistent status, and deactivation of services without modules
        const formatted = list.map((s, idx) => {
          const hasModule = hasImplementedModule(s.id);
          // Fundamental rule: a service without an implemented module CANNOT be active
          const shouldBeActive = hasModule && (s.status === 'active' || (s as any).is_active === true);

          if (!hasModule && (s.status === 'active' || (s as any).is_active === true)) {
            correctionsToPersist.push({
              ...s,
              status: 'inactive',
              is_active: false
            });
          }

          return {
            ...s,
            status: (shouldBeActive ? 'active' : 'inactive') as 'active' | 'inactive',
            is_active: shouldBeActive,
            order: s.order ?? (idx + 1),
            users: s.users || [],
            activeTools: s.activeTools || [],
            linkedModules: s.linkedModules || [],
            specificSettings: s.specificSettings || {}
          };
        }).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

        setServices(formatted);
        localStorage.setItem('hospital_services', JSON.stringify(formatted));

        // Idempotently persist auto-deactivations back to Firestore
        if (correctionsToPersist.length > 0) {
          try {
            const batch = writeBatch(db);
            for (const item of correctionsToPersist) {
              const ref = doc(db, 'hospital_services', item.id);
              batch.set(ref, sanitizeData({
                status: 'inactive',
                is_active: false,
                updatedAt: new Date().toISOString()
              }), { merge: true });
            }
            batch.commit().catch(e => console.warn("Auto-reconciliation batch commit failed:", e));
          } catch (e) {
            console.warn("Could not batch update auto-deactivations:", e);
          }
        }
      } else {
        // Initialize Firestore with default services if empty
        const initial = getDefaultServices();
        setServices(initial);
        localStorage.setItem('hospital_services', JSON.stringify(initial));

        try {
          const batch = writeBatch(db);
          for (const s of initial) {
            const ref = doc(db, 'hospital_services', s.id);
            batch.set(ref, sanitizeData({ ...s, is_active: s.status === 'active' }), { merge: true });
          }
          await batch.commit();
        } catch (e) {
          console.warn("Could not seed hospital_services in Firestore:", e);
        }
      }
      setLoading(false);
    }, (err) => {
      console.warn("Firestore hospital_services listener error:", err);
      const saved = localStorage.getItem('hospital_services');
      if (saved) {
        try { setServices(JSON.parse(saved)); } catch (e) {}
      }
    });

    const handleStorageChange = () => {
      const saved = localStorage.getItem('hospital_services');
      if (saved) {
        try {
          setServices(JSON.parse(saved));
        } catch (e) {}
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('services-updated', handleStorageChange);

    return () => {
      isSubscribed = false;
      unsub();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('services-updated', handleStorageChange);
    };
  }, []);

  const updateService = useCallback(async (updatedService: Service) => {
    const previous = services;
    const hasModule = hasImplementedModule(updatedService.id);
    if (!hasModule && (updatedService.status === 'active' || updatedService.is_active === true)) {
      throw new Error(`Le service "${updatedService.name}" ne correspond à aucun module fonctionnel développé dans SmartHosto et ne peut pas être activé à l'accueil.`);
    }

    const isActive = hasModule && (updatedService.status === 'active' || updatedService.is_active === true);
    const normalized: Service = {
      ...updatedService,
      status: isActive ? 'active' : 'inactive',
      is_active: isActive,
      updatedAt: new Date().toISOString()
    };

    // Optimistic update
    setServices(prev => {
      const next = prev.map(s => s.id === normalized.id ? normalized : s);
      localStorage.setItem('hospital_services', JSON.stringify(next));
      return next;
    });
    window.dispatchEvent(new CustomEvent('services-updated'));

    try {
      const ref = doc(db, 'hospital_services', normalized.id);
      await setDoc(ref, sanitizeData({
        ...normalized,
        is_active: normalized.status === 'active',
        updatedAt: new Date().toISOString()
      }), { merge: true });
      return normalized;
    } catch (err) {
      console.error("Failed to update service in Firestore:", err);
      // Rollback on failure
      setServices(previous);
      localStorage.setItem('hospital_services', JSON.stringify(previous));
      window.dispatchEvent(new CustomEvent('services-updated'));
      throw err;
    }
  }, [services]);

  const toggleService = useCallback(async (serviceId: string) => {
    const s = services.find(item => item.id === serviceId);
    if (!s) return;
    const hasModule = hasImplementedModule(serviceId);
    if (!hasModule && s.status === 'inactive') {
      throw new Error(`Le service "${s.name}" ne correspond à aucun module fonctionnel développé dans SmartHosto et ne peut pas être activé.`);
    }

    const newStatus: 'active' | 'inactive' = s.status === 'active' ? 'inactive' : 'active';
    const updated: Service = {
      ...s,
      status: newStatus,
      is_active: newStatus === 'active',
      specificSettings: s.specificSettings || {}
    };
    return await updateService(updated);
  }, [services, updateService]);

  const addService = useCallback(async (newService: Partial<Service>) => {
    const baseId = newService.id || `SRV-${(newService.name || 'CUSTOM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}-${Date.now().toString().slice(-4)}`;
    const hasModule = hasImplementedModule(baseId);
    const isActive = hasModule && newService.status === 'active';
    const fullService: Service = {
      id: baseId,
      name: newService.name || 'Nouveau service',
      description: newService.description || '',
      type: newService.type || 'clinique',
      status: isActive ? 'active' : 'inactive',
      is_active: isActive,
      order: newService.order ?? (services.length + 1),
      users: newService.users || [],
      activeTools: newService.activeTools || [],
      linkedModules: newService.linkedModules || [],
      specificSettings: newService.specificSettings || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setServices(prev => {
      const next = [...prev.filter(s => s.id !== baseId), fullService];
      localStorage.setItem('hospital_services', JSON.stringify(next));
      return next;
    });
    window.dispatchEvent(new CustomEvent('services-updated'));

    try {
      const ref = doc(db, 'hospital_services', baseId);
      await setDoc(ref, sanitizeData(fullService), { merge: true });
      return fullService;
    } catch (err) {
      console.error("Failed to add service to Firestore:", err);
      // Rollback
      setServices(prev => {
        const next = prev.filter(s => s.id !== baseId);
        localStorage.setItem('hospital_services', JSON.stringify(next));
        return next;
      });
      window.dispatchEvent(new CustomEvent('services-updated'));
      throw err;
    }
  }, [services]);

  const deleteService = useCallback(async (serviceId: string) => {
    const previous = services;
    setServices(prev => {
      const next = prev.filter(s => s.id !== serviceId);
      localStorage.setItem('hospital_services', JSON.stringify(next));
      return next;
    });
    window.dispatchEvent(new CustomEvent('services-updated'));

    try {
      const ref = doc(db, 'hospital_services', serviceId);
      await deleteDoc(ref);
    } catch (err) {
      console.error("Failed to delete service from Firestore:", err);
      setServices(previous);
      localStorage.setItem('hospital_services', JSON.stringify(previous));
      window.dispatchEvent(new CustomEvent('services-updated'));
      throw err;
    }
  }, [services]);

  const applyProfile = useCallback(async (profile: 'BASE' | 'MATERNITY' | 'FULL') => {
    const updatedList = services.map(s => {
      let shouldBeActive = false;
      if (profile === 'BASE') {
        shouldBeActive = ['SRV-ACCUEIL', 'SRV-CONSULTATION', 'SRV-PHARMACIE', 'SRV-LABO', 'SRV-CAISSE', 'SRV-ADMIN'].includes(s.id);
      } else if (profile === 'MATERNITY') {
        shouldBeActive = ['SRV-ACCUEIL', 'SRV-CONSULTATION', 'SRV-PHARMACIE', 'SRV-LABO', 'SRV-CAISSE', 'SRV-ADMIN', 'SRV-MATERNITE', 'SRV-VACCINATION', 'SRV-PEDIATRIE'].includes(s.id);
      } else if (profile === 'FULL') {
        shouldBeActive = s.type !== 'specialise';
      }
      return { 
        ...s, 
        status: shouldBeActive ? ('active' as const) : ('inactive' as const),
        is_active: shouldBeActive 
      };
    });

    setServices(updatedList);
    localStorage.setItem('hospital_services', JSON.stringify(updatedList));
    window.dispatchEvent(new CustomEvent('services-updated'));

    try {
      const batch = writeBatch(db);
      for (const s of updatedList) {
        const ref = doc(db, 'hospital_services', s.id);
        batch.set(ref, sanitizeData({ ...s, is_active: s.status === 'active', updatedAt: new Date().toISOString() }), { merge: true });
      }
      await batch.commit();
    } catch (e) {
      console.error("Failed to batch update profiles in Firestore:", e);
    }
  }, [services]);

  return { services, setServices, updateService, toggleService, addService, deleteService, applyProfile, loading };
};

export const useSettings = () => {
  const [establishment, setEstablishment] = useState<EstablishmentConfig>(() => {
    const saved = localStorage.getItem('hospital_config');
    const defaults: EstablishmentConfig = {
      name: 'SmartHosto SIH',
      address: 'Avenue de l\'Indépendance, Yaoundé, Cameroun',
      phone: '+237 222 33 44 55',
      language: 'FR',
      currency: 'XAF',
      theme: 'blue',
      email: 'contact@smarthosto.com',
      city: 'Yaoundé',
      country: 'Cameroun',
      slogan: 'Votre santé, notre priorité absolue',
      logo: 'SH',
      taxId: 'NIF: M0123456789J / RCCM: RC/YAO/2024/B/123',
      website: 'www.smarthosto.com',
      bankInfo: 'RIB: 10001 00001 12345678901 23 - Afriland First Bank',
      invoiceFooter: 'Merci de votre confiance. En cas de réclamation, veuillez contacter le service facturation.',
      requireBiologistValidation: true,
      require_biologist_validation: true
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { 
          ...defaults, 
          ...parsed,
          requireBiologistValidation: parsed.requireBiologistValidation ?? parsed.require_biologist_validation ?? true,
          require_biologist_validation: parsed.require_biologist_validation ?? parsed.requireBiologistValidation ?? true
        };
      } catch (e) {
        return defaults;
      }
    }
    return defaults;
  });

  const [cashierSettings, setCashierSettings] = useState<ParametresCaisse>(() => {
    const saved = localStorage.getItem('hospital_cashier_config');
    const defaults: ParametresCaisse = {
      detteAutorisee: true,
      seuilDetteMax: 50000,
      paiementPartielAutorise: true,
      avoirPatientAutorise: true,
      applicationAutoAvoir: true,
      modesPaiement: {
        especes: true,
        mobileMoney: true,
        carte: true,
        virement: false,
        autre: false
      },
      impression: {
        nomStructure: 'SmartHosto',
        logo: '',
        adresse: 'Yaoundé, Cameroun',
        telephone: '+237 222 33 44 55',
        slogan: 'Votre santé, notre priorité',
        piedDePage: 'Merci de votre confiance.'
      },
      permissions: {
        autoriserDette: [Role.ADMIN],
        annulerTransaction: [Role.ADMIN],
        rembourserAvoir: [Role.ADMIN, Role.CASHIER],
        modifierFacture: [Role.ADMIN]
      },
      technique: {
        caissesActives: ['Caisse 1', 'Caisse 2'],
        formatRecu: 'REC-YYYYMMDD-XXXX',
        formatTransaction: 'TX-YYYYMMDD-XXXX'
      }
    };
    if (saved) {
      try {
        return { ...defaults, ...JSON.parse(saved) };
      } catch (e) {
        return defaults;
      }
    }
    return defaults;
  });

  const updateEstablishment = useCallback(async (updates: Partial<EstablishmentConfig>) => {
    setEstablishment(prev => {
      const updated: EstablishmentConfig = { 
        ...prev, 
        ...updates,
        requireBiologistValidation: updates.requireBiologistValidation ?? updates.require_biologist_validation ?? prev.requireBiologistValidation ?? true,
        require_biologist_validation: updates.require_biologist_validation ?? updates.requireBiologistValidation ?? prev.require_biologist_validation ?? true
      };
      localStorage.setItem('hospital_config', JSON.stringify(updated));
      return updated;
    });

    window.dispatchEvent(new CustomEvent('settings-updated'));

    try {
      const q = query(collection(db, 'hospital_config'), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        await addDoc(collection(db, 'hospital_config'), sanitizeData({ ...establishment, ...updates }));
      } else {
        await updateDoc(doc(db, 'hospital_config', snap.docs[0].id), sanitizeData({
          ...updates,
          updatedAt: new Date().toISOString()
        }));
      }
    } catch (e) {
      console.warn("Error updating establishment config to Firestore:", e);
    }
  }, [establishment]);

  useEffect(() => {
    // Firestore listener for hospital_config
    const unsubConfig = onSnapshot(collection(db, 'hospital_config'), (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data() as EstablishmentConfig;
        setEstablishment(prev => {
          const merged: EstablishmentConfig = {
            ...prev,
            ...data,
            requireBiologistValidation: data.requireBiologistValidation ?? data.require_biologist_validation ?? prev.requireBiologistValidation ?? true,
            require_biologist_validation: data.require_biologist_validation ?? data.requireBiologistValidation ?? prev.require_biologist_validation ?? true
          };
          localStorage.setItem('hospital_config', JSON.stringify(merged));
          return merged;
        });
      }
    }, (err) => {
      console.warn("Firestore hospital_config read error:", err);
    });

    // Firestore listener for parametres_caisse
    const unsubCashier = onSnapshot(collection(db, 'parametres_caisse'), (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data() as ParametresCaisse;
        setCashierSettings(prev => {
          const merged = { ...prev, ...data };
          localStorage.setItem('hospital_cashier_config', JSON.stringify(merged));
          return merged;
        });
      }
    }, (err) => {
      console.warn("Firestore parametres_caisse read error:", err);
    });

    const handleStorageChange = () => {
      const savedConfig = localStorage.getItem('hospital_config');
      if (savedConfig) {
        try {
          const parsed = JSON.parse(savedConfig);
          setEstablishment(prev => ({
            ...prev,
            ...parsed,
            requireBiologistValidation: parsed.requireBiologistValidation ?? parsed.require_biologist_validation ?? prev.requireBiologistValidation ?? true,
            require_biologist_validation: parsed.require_biologist_validation ?? parsed.requireBiologistValidation ?? prev.require_biologist_validation ?? true
          }));
        } catch (e) {}
      }
      
      const savedCashier = localStorage.getItem('hospital_cashier_config');
      if (savedCashier) {
        try {
          setCashierSettings(JSON.parse(savedCashier));
        } catch (e) {}
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('settings-updated', handleStorageChange);

    return () => {
      unsubConfig();
      unsubCashier();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('settings-updated', handleStorageChange);
    };
  }, []);

  return { establishment, cashierSettings, updateEstablishment };
};
