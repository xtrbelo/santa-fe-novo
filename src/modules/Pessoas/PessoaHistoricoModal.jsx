import React, { useEffect, useState } from 'react';
import { getAppCollection, getAppDoc, getDoc, onSnapshot, query, where } from '../../services/firebase';
import { getStatusColor } from '../../utils/formatters';
import { Modal } from '../../components/ui/Modal';
import { CalendarClock } from 'lucide-react';
import { hasPermission, PERMISSIONS } from '../../constants/permissions';

const toMillis = value => value?.toMillis?.() || value?.toDate?.().getTime?.() || 0;
const formatTime = value => value?.toDate?.().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || null;

export const PessoaHistoricoModal = ({ pessoa, profile, onClose }) => {
  const [items, setItems] = useState([]);
  const [lifecycleEvents, setLifecycleEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const canViewAudit = hasPermission(profile, PERMISSIONS.AUDIT_VIEW);

  useEffect(() => {
    if (!pessoa) return undefined;
    setLoading(true);
    return onSnapshot(query(getAppCollection('consulentes'), where('pessoaBaseId', '==', pessoa.id)), async snapshot => {
      const enriched = await Promise.all(snapshot.docs.map(async item => {
        const appointment = { id: item.id, ...item.data() };
        if (!appointment.agendaId) return appointment;
        const relatedAgendaIds = [...new Set([
          appointment.agendaId,
          appointment.origemRealocacao?.agendaId,
          appointment.reagendadoParaAgendaId,
          ...Object.values(appointment.servicosRealocados || {}).map(value => value.destinoAgendaId)
        ].filter(Boolean))];
        const relatedSnapshots = await Promise.all(relatedAgendaIds.map(id => getDoc(getAppDoc('agendas', id))));
        const relatedAgendas = Object.fromEntries(relatedAgendaIds.map((id, index) => [id, relatedSnapshots[index].exists() ? relatedSnapshots[index].data() : null]));
        return { ...appointment, agenda: relatedAgendas[appointment.agendaId], relatedAgendas };
      }));
      setItems(enriched.sort((a, b) => toMillis(b.agenda?.data) - toMillis(a.agenda?.data)));
      setLoading(false);
    }, () => setLoading(false));
  }, [pessoa]);

  useEffect(() => {
    if (!pessoa || !canViewAudit) { setLifecycleEvents([]); return undefined; }
    return onSnapshot(query(getAppCollection('auditoria'), where('pessoaBaseId', '==', pessoa.id)), async snapshot => {
      const relevant = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => ['MEMBRO_INATIVADO', 'MEMBRO_REATIVADO'].includes(item.tipo));
      const actors = await Promise.all(relevant.map(item => getDoc(getAppDoc('usuarios', item.executadoPor))));
      setLifecycleEvents(relevant.map((item, index) => ({ ...item, responsavel: actors[index].data()?.nome || actors[index].data()?.email || 'Administrador' })).sort((a, b) => toMillis(b.criadoEm) - toMillis(a.criadoEm)));
    });
  }, [pessoa, canViewAudit]);

  return <Modal isOpen={!!pessoa} onClose={onClose} title={`Histórico de ${pessoa?.nome || ''}`}>
    <div className="space-y-3 max-h-[65vh] overflow-y-auto">
      {lifecycleEvents.length > 0 && <section className="space-y-2"><h4 className="text-xs font-black uppercase text-purple-700">Ciclo de vida</h4>{lifecycleEvents.map(event => <div key={event.id} className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4"><p className="font-black text-sm text-gray-900">{event.tipo === 'MEMBRO_INATIVADO' ? 'Membro inativado' : 'Membro reativado'}</p><p className="mt-1 text-xs text-gray-500">{event.criadoEm?.toDate?.().toLocaleString('pt-BR') || 'Data indisponível'} · {event.responsavel}</p>{event.motivo && <p className="mt-2 text-sm text-gray-700"><strong>Motivo:</strong> {event.motivo}</p>}</div>)}</section>}
      {loading && <p className="text-center text-sm text-gray-400 py-8">Carregando histórico...</p>}
      {!loading && items.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Nenhum atendimento registrado.</p>}
      {items.map(item => <div key={item.id} className="border border-gray-100 rounded-2xl p-4 bg-gray-50/60">
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            <p className="font-black text-gray-900 text-sm flex items-center gap-2"><CalendarClock size={15} /> {item.agenda?.data?.toDate?.().toLocaleDateString('pt-BR') || 'Data indisponível'}</p>
            <p className="text-xs text-gray-500 mt-1">{item.agenda?.tipo || 'Agenda indisponível'}</p>
          </div>
          <span className={`h-fit text-[9px] font-black px-2.5 py-1 rounded-full uppercase ${getStatusColor(item.status)}`}>{item.status}</span>
        </div>
        <div className="text-[11px] font-bold text-purple-700 mt-3 space-y-1">{(item.servicosIds || []).length ? item.servicosIds.map((id, index) => { const moved = item.servicosRealocados?.[id]; const target = moved && item.relatedAgendas?.[moved.destinoAgendaId]; return <p key={id}>{item.servicosNomes?.[index] || id}{moved ? ` · Realocado para ${target?.data?.toDate?.().toLocaleDateString('pt-BR') || 'outra agenda'}` : ''}</p>; }) : <p>Serviço não informado</p>}{item.origemRealocacao && <p className="text-indigo-600">Origem: agenda de {item.relatedAgendas?.[item.origemRealocacao.agendaId]?.data?.toDate?.().toLocaleDateString('pt-BR') || 'data indisponível'}</p>}{item.status === 'Reagendado' && <p className="text-indigo-700">Reagendado para {item.relatedAgendas?.[item.reagendadoParaAgendaId]?.data?.toDate?.().toLocaleDateString('pt-BR') || 'outra data'}</p>}</div>
        {(item.horaChegada || item.horaSaida) && <p className="text-[10px] text-gray-500 mt-2">
          {item.horaChegada && `Chegada: ${formatTime(item.horaChegada)}`}
          {item.horaChegada && item.horaSaida && ' • '}
          {item.horaSaida && `Saída: ${formatTime(item.horaSaida)}`}
        </p>}
      </div>)}
    </div>
  </Modal>;
};
