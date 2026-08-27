import React, { useEffect, useState } from 'react';
import { getAppCollection, getAppDoc, getDoc, onSnapshot, query, where } from '../../services/firebase';
import { getStatusColor } from '../../utils/formatters';
import { Modal } from '../../components/ui/Modal';
import { CalendarClock } from 'lucide-react';

const toMillis = value => value?.toMillis?.() || value?.toDate?.().getTime?.() || 0;
const formatTime = value => value?.toDate?.().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || null;

export const PessoaHistoricoModal = ({ pessoa, onClose }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pessoa) return undefined;
    setLoading(true);
    return onSnapshot(query(getAppCollection('consulentes'), where('pessoaBaseId', '==', pessoa.id)), async snapshot => {
      const enriched = await Promise.all(snapshot.docs.map(async item => {
        const appointment = { id: item.id, ...item.data() };
        if (!appointment.agendaId) return appointment;
        const agendaSnapshot = await getDoc(getAppDoc('agendas', appointment.agendaId));
        return { ...appointment, agenda: agendaSnapshot.exists() ? agendaSnapshot.data() : null };
      }));
      setItems(enriched.sort((a, b) => toMillis(b.agenda?.data) - toMillis(a.agenda?.data)));
      setLoading(false);
    }, () => setLoading(false));
  }, [pessoa]);

  return <Modal isOpen={!!pessoa} onClose={onClose} title={`Histórico de ${pessoa?.nome || ''}`}>
    <div className="space-y-3 max-h-[65vh] overflow-y-auto">
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
        <p className="text-[11px] font-bold text-purple-700 mt-3">{item.servicosNomes?.join(' • ') || 'Serviço não informado'}</p>
        {(item.horaChegada || item.horaSaida) && <p className="text-[10px] text-gray-500 mt-2">
          {item.horaChegada && `Chegada: ${formatTime(item.horaChegada)}`}
          {item.horaChegada && item.horaSaida && ' • '}
          {item.horaSaida && `Saída: ${formatTime(item.horaSaida)}`}
        </p>}
      </div>)}
    </div>
  </Modal>;
};
