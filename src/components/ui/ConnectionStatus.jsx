import React, { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useToast } from './useToast';

export function ConnectionStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const wasOffline = useRef(!navigator.onLine);
  const toast = useToast();

  useEffect(() => {
    const handleOffline = () => {
      wasOffline.current = true;
      setOnline(false);
    };
    const handleOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        wasOffline.current = false;
        toast.success('Conexão restabelecida. O sistema voltou a sincronizar.', 6000);
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [toast]);

  if (online) return null;
  return <div role="alert" className="fixed inset-x-3 bottom-20 z-[190] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-amber-300 bg-amber-100 p-4 text-sm font-bold text-amber-950 shadow-xl lg:bottom-5"><WifiOff className="shrink-0" size={22}/><p>Sem conexão com a internet. Evite repetir operações; o sistema tentará sincronizar quando a conexão voltar.</p></div>;
}
