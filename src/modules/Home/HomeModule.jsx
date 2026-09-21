import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { getAppCollection, getCountFromServer, onSnapshot, query, where } from '../../services/firebase';
import { canAccessModule, hasPermission, MODULES, PERMISSIONS } from '../../constants/permissions';
import { ROLES } from '../../constants/roles';
import { buildOperationalAlerts, isRegistrationOverdue } from '../../utils/operationalAlerts';
import { CalendarDays, BookOpenCheck, ClipboardCheck, Users, Sparkles, UserRoundCog, UserRoundX, ShieldAlert, BellRing, ChevronRight } from 'lucide-react';

export const HomeModule = ({ user, profile, onSelectTab, onOpenUsers, onOpenPendingRegistrations, onOpenCommunications }) => {
  const firstName = user?.displayName?.split(' ')[0] || 'Utilizador';
  const [pendingCount, setPendingCount] = useState(null);
  const [revokedCount, setRevokedCount] = useState(null);
  const [registrationCounts, setRegistrationCounts] = useState({ membro: 0, consulente: 0 });
  const [overdueRegistrations, setOverdueRegistrations] = useState(0);
  const [communicationFailures, setCommunicationFailures] = useState(0);
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

  useEffect(() => {
    if (!hasPermission(profile, PERMISSIONS.MEMBER_REGISTRATIONS_REVIEW)) return undefined;
    let inviteRequests = []; let linkRequests = [];
    const sync = () => {
      setRegistrationCounts({ membro: inviteRequests.length + linkRequests.filter(item => item.tipoCadastro !== 'consulente').length, consulente: linkRequests.filter(item => item.tipoCadastro === 'consulente').length });
      setOverdueRegistrations([...inviteRequests, ...linkRequests].filter(item => isRegistrationOverdue(item)).length);
    };
    const pending = where('statusCadastro', '==', 'aguardando_validacao');
    const unsubInvites = onSnapshot(query(getAppCollection('autocadastros_membro'), pending), snapshot => { inviteRequests = snapshot.docs.map(item => item.data()); sync(); });
    const unsubLinks = onSnapshot(query(getAppCollection('solicitacoes_cadastro'), pending), snapshot => { linkRequests = snapshot.docs.map(item => item.data()); sync(); });
    const unsubCommunications = onSnapshot(query(getAppCollection('comunicacoes_email'), where('status', '==', 'erro')), snapshot => setCommunicationFailures(snapshot.size));
    return () => { unsubInvites(); unsubLinks(); unsubCommunications(); };
  }, [profile]);

  const operationalAlerts = buildOperationalAlerts({ overdueRegistrations, communicationFailures, pendingUsers: pendingCount || 0 });
  const openAlert = action => action === 'communications' ? onOpenCommunications() : action === 'registrations' ? onOpenPendingRegistrations() : onOpenUsers('pendentes');

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

      {(hasPermission(profile, PERMISSIONS.MEMBER_REGISTRATIONS_REVIEW) || canViewUsers) && <section className="space-y-3" aria-labelledby="operational-alerts-title"><div className="flex items-center gap-2"><BellRing size={19} className="text-indigo-600"/><h2 id="operational-alerts-title" className="text-sm font-black uppercase tracking-wide text-gray-800">Alertas operacionais</h2></div>{operationalAlerts.length === 0 ? <Card className="!p-4 text-sm font-bold text-emerald-700">Nenhuma pendência prioritária no momento.</Card> : <div className="grid gap-3">{operationalAlerts.map(alert => <button key={alert.id} type="button" onClick={() => openAlert(alert.action)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${alert.tone === 'rose' ? 'border-rose-200 bg-rose-50 text-rose-900' : alert.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-indigo-200 bg-indigo-50 text-indigo-900'}`}><span className="min-w-0 flex-1"><span className="block text-sm font-black">{alert.title}</span><span className="mt-0.5 block text-xs font-medium opacity-80">{alert.description}</span></span><ChevronRight size={19}/></button>)}</div>}</section>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {hasPermission(profile, PERMISSIONS.MEMBER_REGISTRATIONS_REVIEW) && <Card onClick={onOpenPendingRegistrations} className="!bg-gradient-to-br from-cyan-600 to-teal-700 text-white !p-6 shadow-xl !border-none hover:-translate-y-1 transition-all"><div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6"><ClipboardCheck size={28} /></div><p className="font-black text-2xl uppercase italic">Solicitações pendentes</p><p className="mt-1 text-[11px] font-bold uppercase text-cyan-100">{registrationCounts.membro + registrationCounts.consulente} no total · {registrationCounts.membro} Membros · {registrationCounts.consulente} Consulentes</p></Card>}
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
            Pessoas e Cadastros
          </p>
          <p className="text-purple-100 text-[11px] font-bold uppercase tracking-widest mt-1">
            Base de Dados & Cadastros
          </p>
        </Card>}
      </div>
    </div>
  );
};
