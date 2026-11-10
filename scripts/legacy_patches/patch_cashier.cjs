const fs = require('fs');
let content = fs.readFileSync('pages/Cashier.tsx', 'utf8');

const modalTarget = `      {showPaymentModal && selectedRequest && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200/50">`;

const modalReplace = `      {showPaymentModal && selectedRequest && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-200/50 my-auto">`;

if (content.includes(modalTarget)) {
  content = content.replace(modalTarget, modalReplace);
  fs.writeFileSync('pages/Cashier.tsx', content, 'utf8');
  console.log("Cashier.tsx updated");
} else {
  console.log("Could not find modal in Cashier.tsx");
}
