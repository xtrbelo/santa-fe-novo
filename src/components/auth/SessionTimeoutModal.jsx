import React from 'react';
import { Clock3 } from 'lucide-react';
import { Button } from '../ui/Button';

const formatRemainingTime = remainingMs => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

export function SessionTimeoutModal({ isOpen, remainingMs, onContinue }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-gray-900/60 p-0 backdrop-blur-sm sm:p-4" role="presentation">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8" role="dialog" aria-modal="true" aria-labelledby="session-timeout-title">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600"><Clock3 size={30} /></div>
        <h2 id="session-timeout-title" className="text-xl font-black tracking-tight text-gray-900">Sua sessão está prestes a expirar</h2>
        <p className="mt-3 leading-relaxed text-gray-600">Por segurança, sua sessão será encerrada após 30 minutos sem atividade.</p>
        <p className="my-6 rounded-2xl bg-gray-50 p-4 text-center text-sm font-semibold text-gray-500">Tempo restante <span className="ml-2 font-mono text-2xl font-black text-amber-600">{formatRemainingTime(remainingMs)}</span></p>
        <Button onClick={onContinue} className="w-full" variant="warning">Continuar conectado</Button>
      </div>
    </div>
  );
}
