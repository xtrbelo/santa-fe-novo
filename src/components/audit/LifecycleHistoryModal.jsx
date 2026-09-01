import React, { useEffect, useState } from 'react';
import { getAppCollection, onSnapshot, query, where } from '../../services/firebase';
import { Modal } from '../ui/Modal';

const LABELS = {
  MEMBRO_INATIVADO: 'Membro inativado',
  MEMBRO_REATIVADO: 'Membro reativado',
  USUARIO_ACESSO_REVOGADO: 'Acesso revogado',
  USUARIO_ACESSO_REATIVADO: 'Acesso reativado',
};
const TYPES = Object.keys(LABELS);
const millis = value => value?.toMillis?.() || 0;

export const LifecycleHistoryModal = ({ target, field, actors = {}, onClose }) => {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    if (!target || !field) return undefined;
    const value = field === 'alvoUid' ? target.uid : target.id;
    return onSnapshot(query(getAppCollection('auditoria'), where(field, '==', value)), snapshot => {
      setEvents(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => TYPES.includes(item.tipo)).sort((a, b) => millis(b.criadoEm) - millis(a.criadoEm)));
    });
  }, [field, target]);
  return <Modal isOpen={!!target} onClose={onClose} title="Histórico" maxWidth="max-w-lg"><div className="space-y-3">{events.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Nenhum evento de ciclo de vida registrado.</p>}{events.map(event => <div key={event.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><p className="font-black text-gray-900">{LABELS[event.tipo]}</p><p className="mt-1 text-xs text-gray-500">{event.criadoEm?.toDate?.().toLocaleString('pt-BR') || 'Data indisponível'} · {actors[event.executadoPor] || 'Administrador'}</p>{event.motivo && <p className="mt-2 text-sm text-gray-700"><strong>Motivo:</strong> {event.motivo}</p>}</div>)}</div></Modal>;
};
