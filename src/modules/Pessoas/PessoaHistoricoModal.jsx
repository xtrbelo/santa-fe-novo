import React, { useEffect, useMemo, useState } from 'react';
import { getAppCollection, getAppDoc, getDoc, getDocs, onSnapshot, query, where } from '../../services/firebase';
import { getStatusColor } from '../../utils/formatters';
import { describePersonAudit, PERSON_HISTORY_FILTERS } from '../../utils/personHistory';
import { Modal } from '../../components/ui/Modal';
import { CalendarClock, History, Mail, RotateCcw, ShieldCheck } from 'lucide-react';
import { hasPermission, PERMISSIONS } from '../../constants/permissions';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/useToast';
import { resendEmailCommunicationOnServer } from '../../services/firebaseFunctions';

const toMillis = value => value?.toMillis?.() || value?.toDate?.().getTime?.() || 0;
const formatDate = value => value?.toDate?.().toLocaleString('pt-BR') || 'Data indisponível';
const formatTime = value => value?.toDate?.().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || null;

export const PessoaHistoricoModal = ({ pessoa, profile, onClose }) => {
  const [appointments, setAppointments] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [communications, setCommunications] = useState([]);
  const [filter, setFilter] = useState('todos');
  const [resending, setResending] = useState(null);
  const [loading, setLoading] = useState(false);
  const canViewAudit = hasPermission(profile, PERMISSIONS.AUDIT_VIEW);
  const toast = useToast();

  useEffect(() => {
    if (!pessoa) return undefined;
    setLoading(true);
    return onSnapshot(query(getAppCollection('consulentes'), where('pessoaBaseId', '==', pessoa.id)), async snapshot => {
      const enriched = await Promise.all(snapshot.docs.map(async item => {
        const appointment = { id: item.id, ...item.data() };
        if (!appointment.agendaId) return appointment;
        const ids = [...new Set([appointment.agendaId, appointment.origemRealocacao?.agendaId, appointment.reagendadoParaAgendaId, ...Object.values(appointment.servicosRealocados || {}).map(value => value.destinoAgendaId)].filter(Boolean))];
        const agendaSnapshots = await Promise.all(ids.map(id => getDoc(getAppDoc('agendas', id))));
        const relatedAgendas = Object.fromEntries(ids.map((id, index) => [id, agendaSnapshots[index].exists() ? agendaSnapshots[index].data() : null]));
        return { ...appointment, agenda: relatedAgendas[appointment.agendaId], relatedAgendas };
      }));
      setAppointments(enriched); setLoading(false);
    }, () => setLoading(false));
  }, [pessoa]);

  useEffect(() => {
    if (!pessoa || !canViewAudit) { setAuditEvents([]); return undefined; }
    let cancelled = false;
    const unsubs = [];
    const snapshots = new Map();
    const refresh = async () => {
      const merged = [...new Map([...snapshots.values()].flat().map(item => [item.id, item])).values()];
      const actorIds = [...new Set(merged.map(item => item.executadoPor).filter(Boolean))];
      const actors = await Promise.all(actorIds.map(id => getDoc(getAppDoc('usuarios', id))));
      const names = Object.fromEntries(actorIds.map((id, index) => [id, actors[index].data()?.nome || actors[index].data()?.email || 'Responsável não identificado']));
      if (!cancelled) setAuditEvents(merged.map(item => ({ ...item, responsavel: names[item.executadoPor] || 'Sistema' })));
    };
    const start = async () => {
      const users = await getDocs(query(getAppCollection('usuarios'), where('pessoaBaseId', '==', pessoa.id)));
      const queries = [query(getAppCollection('auditoria'), where('pessoaBaseId', '==', pessoa.id)), ...users.docs.map(user => query(getAppCollection('auditoria'), where('alvoUid', '==', user.id)))];
      queries.forEach((auditQuery, index) => unsubs.push(onSnapshot(auditQuery, snapshot => { snapshots.set(index, snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); refresh(); })));
    };
    start().catch(error => { console.error(error); toast.error('Não foi possível carregar todo o histórico administrativo.'); });
    return () => { cancelled = true; unsubs.forEach(unsub => unsub()); };
  }, [pessoa, canViewAudit, toast]);

  useEffect(() => {
    if (!pessoa || !canViewAudit) { setCommunications([]); return undefined; }
    return onSnapshot(query(getAppCollection('comunicacoes_email'), where('pessoaBaseId', '==', pessoa.id)), snapshot => setCommunications(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))));
  }, [pessoa, canViewAudit]);

  const timeline = useMemo(() => {
    if (!pessoa) return [];
    const base = [
      ...(pessoa.criadoEm ? [{ id: 'person-created', category: 'cadastro', title: 'Cadastro registrado', timestamp: pessoa.criadoEm, responsavel: pessoa.criadoPor || 'Sistema' }] : []),
      ...auditEvents.map(event => ({ ...event, ...describePersonAudit(event), timestamp: event.criadoEm })),
      ...communications.map(item => ({ ...item, id: `mail-${item.id}`, category: 'comunicacao', title: ({ cadastro_aprovado: 'Cadastro aprovado', ativacao_acesso: 'Ativação de acesso', validacao_email: 'Validação de e-mail', recuperacao_senha: 'Recuperação de senha' })[item.tipo] || 'Comunicação por e-mail', timestamp: item.criadoEm })),
      ...appointments.map(item => ({ ...item, id: `appointment-${item.id}`, category: 'atendimento', title: item.agenda?.tipo || 'Atendimento', timestamp: item.agenda?.data })),
    ];
    return base.filter(item => filter === 'todos' || item.category === filter).sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
  }, [pessoa, auditEvents, communications, appointments, filter]);

  const resend = async item => {
    const id = item.id.replace('mail-', ''); setResending(id);
    try { await resendEmailCommunicationOnServer(id); toast.success('E-mail reenviado.'); }
    catch (error) { console.error(error); toast.error('Não foi possível reenviar este e-mail.'); }
    finally { setResending(null); }
  };

  return <Modal isOpen={!!pessoa} onClose={onClose} title={`Histórico de ${pessoa?.nome || ''}`}>
    <div className="space-y-4 max-h-[70vh] overflow-y-auto">
      <div className="flex gap-2 overflow-x-auto pb-1">{PERSON_HISTORY_FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black ${filter === value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{label}</button>)}</div>
      {!canViewAudit && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Seu perfil permite consultar atendimentos, mas não eventos administrativos.</p>}
      {loading && <p className="py-8 text-center text-sm text-gray-400">Carregando histórico...</p>}
      {!loading && timeline.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Nenhum evento encontrado neste filtro.</p>}
      <div className="space-y-3">{timeline.map(item => <article key={`${item.category}-${item.id}`} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-2 text-sm font-black text-gray-900">{item.category === 'comunicacao' ? <Mail size={15}/> : item.category === 'atendimento' ? <CalendarClock size={15}/> : item.category === 'acesso' ? <ShieldCheck size={15}/> : <History size={15}/>} {item.title}</p><p className="mt-1 text-xs text-gray-500">{formatDate(item.timestamp)}{item.responsavel ? ` · ${item.responsavel}` : ''}</p></div>{item.category === 'atendimento' && <span className={`h-fit rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${getStatusColor(item.status)}`}>{item.status}</span>}{item.category === 'comunicacao' && <span className={`h-fit rounded-full px-2 py-1 text-[9px] font-black uppercase ${item.status === 'enviado' ? 'bg-emerald-100 text-emerald-800' : item.status === 'erro' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{item.status}</span>}</div>
        {item.details && <p className="mt-2 text-sm text-gray-700">{item.details}</p>}{item.motivo && <p className="mt-2 text-sm text-gray-700"><strong>Motivo:</strong> {item.motivo}</p>}
        {item.category === 'comunicacao' && <p className="mt-2 break-all text-xs text-gray-500">{item.destinatario}</p>}{item.category === 'comunicacao' && item.status === 'erro' && <Button variant="secondary" disabled={resending === item.id.replace('mail-', '')} onClick={() => resend(item)} className="mt-3"><RotateCcw size={15}/>{resending === item.id.replace('mail-', '') ? 'Reenviando...' : 'Reenviar'}</Button>}
        {item.category === 'atendimento' && <div className="mt-3 space-y-1 text-[11px] font-bold text-purple-700">{(item.servicosNomes || []).map((name, index) => <p key={`${name}-${index}`}>{name}</p>)}{(item.horaChegada || item.horaSaida) && <p className="text-gray-500">{item.horaChegada && `Chegada: ${formatTime(item.horaChegada)}`}{item.horaChegada && item.horaSaida && ' • '}{item.horaSaida && `Saída: ${formatTime(item.horaSaida)}`}</p>}</div>}
      </article>)}</div>
    </div>
  </Modal>;
};
