import React from 'react';
import { Card } from '../../components/ui/Card';
import { CalendarDays, BookOpenCheck, Users, Sparkles } from 'lucide-react';

export const HomeModule = ({ user, onSelectTab, allowedTabs }) => {
  const firstName = user?.displayName?.split(' ')[0] || 'Utilizador';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="px-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-black uppercase tracking-wider mb-2">
          <Sparkles size={14} /> Sistema Santa Fé
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-gray-900 tracking-tighter italic uppercase leading-none">
          Painel
        </h1>
        <p className="text-gray-400 font-bold uppercase tracking-widest text-[11px] mt-2">
          Olá, {firstName} • Seja bem-vindo ao sistema de gestão
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {allowedTabs.includes('agendas') && <Card
          onClick={() => onSelectTab('agendas')}
          className="!bg-gradient-to-br from-amber-500 to-amber-600 text-white !p-6 shadow-xl shadow-amber-500/20 group !border-none hover:-translate-y-1 transition-all"
        >
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6">
            <CalendarDays size={28} />
          </div>
          <p className="font-black text-2xl uppercase italic tracking-tighter leading-tight">
            Agendas
          </p>
          <p className="text-amber-100 text-[11px] font-bold uppercase tracking-widest mt-1">
            Planejamento & Calendário
          </p>
        </Card>}

        {allowedTabs.includes('fluxo') && <Card
          onClick={() => onSelectTab('fluxo')}
          className="!bg-gradient-to-br from-emerald-600 to-emerald-700 text-white !p-6 shadow-xl shadow-emerald-600/20 group !border-none hover:-translate-y-1 transition-all"
        >
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6">
            <BookOpenCheck size={28} />
          </div>
          <p className="font-black text-2xl uppercase italic tracking-tighter leading-tight">
            Fluxo do Dia
          </p>
          <p className="text-emerald-100 text-[11px] font-bold uppercase tracking-widest mt-1">
            Atendimentos & Fila em Tempo Real
          </p>
        </Card>}

        {allowedTabs.includes('pessoas') && <Card
          onClick={() => onSelectTab('pessoas')}
          className="!bg-gradient-to-br from-purple-600 to-purple-700 text-white !p-6 shadow-xl shadow-purple-600/20 group !border-none hover:-translate-y-1 transition-all sm:col-span-2 lg:col-span-1"
        >
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6">
            <Users size={28} />
          </div>
          <p className="font-black text-2xl uppercase italic tracking-tighter leading-tight">
            Pessoas
          </p>
          <p className="text-purple-100 text-[11px] font-bold uppercase tracking-widest mt-1">
            Base de Dados & Cadastros
          </p>
        </Card>}
      </div>
    </div>
  );
};
