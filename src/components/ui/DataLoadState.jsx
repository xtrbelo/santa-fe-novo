import React from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { LoaderCircle } from 'lucide-react';

export function DataLoadState({ loading, error, onRetry, subject = 'dados' }) {
  if (loading) return <div role="status" aria-live="polite"><Card className="flex flex-col items-center gap-3 py-14 text-center text-sm font-bold text-gray-500"><LoaderCircle className="animate-spin text-indigo-500" size={26}/>Carregando {subject}...</Card></div>;
  if (!error) return null;
  return <div role="alert"><Card className="space-y-3 border-rose-100 bg-rose-50 py-10 text-center"><p className="text-sm font-bold text-rose-700">Não foi possível carregar {subject}. Verifique a conexão e tente novamente.</p><Button type="button" variant="secondary" onClick={onRetry}>Tentar novamente</Button></Card></div>;
}
