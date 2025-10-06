import React, { useState } from 'react';
import { Post, Comment, User } from '../types';

interface ReportModalProps {
  content: Post | Comment | User;
  contentType: 'post' | 'comment' | 'user';
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

const REASONS = ["Spam", "Hate Speech", "Harassment", "Nudity or Sexual Content", "False Information", "Violence"];

const ReportModal: React.FC<ReportModalProps> = ({ content, contentType, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');

  const handleSubmit = () => {
    const finalReason = reason === 'Other' ? otherReason : reason;
    if (finalReason.trim()) {
      onSubmit(finalReason.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-lg shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-white mb-2">Report {contentType}</h2>
        <p className="text-slate-400 mb-6">Why are you reporting this? Your report is anonymous.</p>
        <div className="space-y-2">
          {REASONS.map(r => (
            <button key={r} onClick={() => setReason(r)} className={`w-full text-left p-3 rounded-lg ${reason === r ? 'bg-rose-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>
              {r}
            </button>
          ))}
           <button onClick={() => setReason('Other')} className={`w-full text-left p-3 rounded-lg ${reason === 'Other' ? 'bg-rose-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>
              Other
            </button>
        </div>
        {reason === 'Other' && (
           <textarea
            value={otherReason}
            onChange={(e) => setOtherReason(e.target.value)}
            placeholder="Please provide more details..."
            rows={3}
            className="w-full bg-slate-700 border-slate-600 rounded-lg p-2 mt-4 text-white"
          />
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-600 text-white font-semibold">Cancel</button>
          <button onClick={handleSubmit} disabled={!reason || (reason === 'Other' && !otherReason.trim())} className="px-4 py-2 rounded-lg bg-rose-600 text-white font-bold disabled:bg-slate-500">Submit Report</button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
