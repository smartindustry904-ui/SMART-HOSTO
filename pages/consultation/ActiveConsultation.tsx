
import React, { useState } from 'react';
import { Save, FileText, Send, Hospital, CreditCard, Mic, MicOff, Check, Loader2 } from 'lucide-react';
import ConsultationActive from '../tools/ConsultationActive';

interface ActiveConsultationProps {
  activePatient: any;
  user: any;
  paymentRequests: any[];
  setPaymentRequests: React.Dispatch<React.SetStateAction<any[]>>;
  onSave: (data: any) => void;
  onCloturer: (data: any) => void;
  onGenerateObservation: () => void;
  onSendPrescription: (data: any) => void;
  onSendExams: (data: any) => void;
  onHospitalize: () => void;
  onClose: () => void;
  isSaving?: boolean;
}

const ActiveConsultation: React.FC<ActiveConsultationProps> = ({ 
  activePatient, 
  user, 
  paymentRequests,
  setPaymentRequests,
  onSave, 
  onCloturer,
  onGenerateObservation, 
  onSendPrescription, 
  onSendExams, 
  onHospitalize,
  onClose,
  isSaving
}) => {
  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-6 duration-700">
      {/* Main Workspace Area */}
      <div className={`flex-1 rounded-[48px] border border-slate-200 overflow-hidden shadow-2xl shadow-slate-200/50 flex flex-col bg-white relative`}>
        
        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
          <div className="animate-in fade-in duration-500">
            <ConsultationActive 
              patient={activePatient} 
              user={user} 
              onSave={onSave}
              onCloturer={onCloturer}
              onSendPrescription={onSendPrescription}
              onSendExams={onSendExams}
              onHospitalize={onHospitalize}
              onClose={onClose}
              paymentRequests={paymentRequests}
              setPaymentRequests={setPaymentRequests}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActiveConsultation;
