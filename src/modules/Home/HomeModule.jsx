import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { getAppCollection, getCountFromServer, query, where } from '../../services/firebase';
import { canAccessModule, hasPermission, MODULES, PERMISSIONS } from '../../constants/permissions';
import { ROLES } from '../../constants/roles';
import { CalendarDays, BookOpenCheck, Users, Sparkles, UserRoundCog, UserRoundX, ShieldAlert } from 'lucide-react';

export const HomeModule = ({ user, profile, onSelectTab, onOpenUsers }) => {
  const firstName = user?.displayName?.split(' ')[0] || 'Utilizador';
  const [pendingCount, setPendingCount] = useState(null);
  const [revokedCount, setRevokedCount] = useState(null);
  const canViewUsers = hasPermission(profile, PERMISSIONS.USERS_VIEW);

  useEffect(() => {
    if (!canViewUsers) { setPendingCount(null); return undefined; }
    let active = true; let refreshing = false;
    const refreshPendingCount = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const users = getAppCollection('usuarios');
        const [total, inactive, revoked] = await Promise.all([
          getCountFromServer(query(users, where('role', '==', ROLES.PENDENTE))),
          getCountFromServer(query(users, where('role', '==', ROLES.PENDENTE), where('ativo', '==', false))),
          getCountFromServer(query(users, where('ativo', '==', false))),
        ]);
        if (active) { setPendingCount(Math.max(0, total.data().count - inactive.data().count)); setRevokedCount(revoked.data().count); }
      } catch (error) { console.error(error); if (active) { setPendingCount(null); setRevokedCount(null); } }
      finally { refreshing = false; }
    };
    void refreshPendingCount();
    const timer = window.setInterval(refreshPendingCount, 60000);
    window.addEventListener('focus', refreshPendingCount);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refreshPendingCount); };
  }, [canViewUsers]);

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
        {hasPermission(profile, PERMISSIONS.USERS_VIEW) && <Card onClick={() => onOpenUsers('pendentes')} className="!bg-gradient-to-br from-indigo-600 to-blue-700 text-white !p-6 shadow-xl !border-none hover:-translate-y-1 transition-all"><div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6"><UserRoundCog size={28} /></div><p className="font-black text-2xl uppercase italic">Usuários pendentes</p><p className="text-indigo-100 text-[11px] font-bold uppercase mt-1">{pendingCount === null ? 'Atualizando contagem...' : `${pendingCount} aguardando liberação`}</p></Card>}
        {hasPermission(profile, PERMISSIONS.USERS_VIEW) && <Card onClick={() => onOpenUsers('suspensos')} className="!bg-gradient-to-br from-amber-500 to-orange-600 text-white !p-6 shadow-xl !border-none hover:-translate-y-1 transition-all"><div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6"><ShieldAlert size={28} /></div><p className="font-black text-2xl uppercase italic">Acessos suspensos</p><p className="text-amber-100 text-[11px] font-bold uppercase mt-1">Abrir membros inativos vinculados</p></Card>}
        {hasPermission(profile, PERMISSIONS.USERS_VIEW) && <Card onClick={() => onOpenUsers('inativos')} className="!bg-gradient-to-br from-rose-600 to-red-700 text-white !p-6 shadow-xl !border-none hover:-translate-y-1 transition-all"><div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6"><UserRoundX size={28} /></div><p className="font-black text-2xl uppercase italic">Acessos revogados</p><p className="text-rose-100 text-[11px] font-bold uppercase mt-1">{revokedCount === null ? 'Atualizando contagem...' : `${revokedCount} contas sem acesso`}</p></Card>}
        {canAccessModule(profile, MODULES.AGENDAS) && <Card
          onClick={() => onSelectTab(MODULES.AGENDAS)}
          className="!bg-gradient-to-br from-amber-500 to-amber-600 text-white !p-6 shadow-xl shadow-amber-500/20 group !border-none hover:-translate-y-1 transition-all"
        >
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6">
            <CalendarDays size={28} />
          </div>
          <p className="font-black text-2xl uppercase italic tracking-tighter leading-tight">
            Agendamentos
          </p>
          <p className="text-amber-100 text-[11px] font-bold uppercase tracking-widest mt-1">
            Planejamento & Calendário
          </p>
        </Card>}

        {canAccessModule(profile, MODULES.ATTENDANCE) && <Card
          onClick={() => onSelectTab(MODULES.ATTENDANCE)}
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

        {canAccessModule(profile, MODULES.PEOPLE) && <Card
          onClick={() => onSelectTab(MODULES.PEOPLE)}
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
