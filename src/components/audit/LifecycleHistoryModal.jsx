import React, { useEffect, useState } from 'react';
import { getAppCollection, getDocs, limit, orderBy, query, startAfter, where } from '../../services/firebase';
import { Modal } from '../ui/Modal';
import { ROLE_LABELS } from '../../constants/roles';
import { getFriendlyErrorMessage } from '../../utils/firebaseErrorMessages';

const LABELS = {
  MEMBRO_INATIVADO: 'Membro inativado',
  MEMBRO_REATIVADO: 'Membro reativado',
  USUARIO_ACESSO_REVOGADO: 'Acesso revogado',
  USUARIO_ACESSO_REATIVADO: 'Acesso reativado',
  USUARIO_ROLE_ALTERADO: 'Perfil alterado',
};
const TYPES = Object.keys(LABELS);
const FILTERS = [
  ['all', 'Todos'],
  ['role', 'Perfis'],
  ['access', 'Acessos'],
  ['member', 'Membros'],
];
const millis = value => value?.toMillis?.() || 0;
const PAGE_SIZE = 20;
const matchesFilter = (event, filter) => filter === 'all'
  || (filter === 'role' && event.tipo === 'USUARIO_ROLE_ALTERADO')
  || (filter === 'access' && event.tipo.startsWith('USUARIO_ACESSO_'))
  || (filter === 'member' && event.tipo.startsWith('MEMBRO_'));

export const LifecycleHistoryModal = ({ target, field, actors = {}, onClose }) => {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    if (!target || !field) return undefined;
    let active = true;
    setLoading(true);
    setLoadError(false);
    setFilter('all');
    setEvents([]);
    setCursor(null);
    const value = field === 'alvoUid' ? target.uid : target.id;
    getDocs(query(getAppCollection('auditoria'), where(field, '==', value), orderBy('criadoEm', 'desc'), limit(PAGE_SIZE)))
      .then(snapshot => {
        if (!active) return;
        setEvents(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => TYPES.includes(item.tipo)));
        setCursor(snapshot.docs.at(-1) || null);
        setHasMore(snapshot.size === PAGE_SIZE);
        setLoading(false);
      })
      .catch(error => { if (active) { console.error(error); setLoadError(getFriendlyErrorMessage(error, { fallback: 'Não foi possível carregar o histórico.' })); setLoading(false); } });
    return () => { active = false; };
  }, [field, reloadVersion, target]);
  const loadMore = async () => {
    if (!target || !field || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const value = field === 'alvoUid' ? target.uid : target.id;
      const snapshot = await getDocs(query(getAppCollection('auditoria'), where(field, '==', value), orderBy('criadoEm', 'desc'), startAfter(cursor), limit(PAGE_SIZE)));
      const nextEvents = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => TYPES.includes(item.tipo));
      setEvents(current => [...current, ...nextEvents].sort((a, b) => millis(b.criadoEm) - millis(a.criadoEm)));
      setCursor(snapshot.docs.at(-1) || null);
      setHasMore(snapshot.size === PAGE_SIZE);
    } catch (error) { console.error(error); setLoadError(getFriendlyErrorMessage(error, { fallback: 'Não foi possível carregar os eventos anteriores.' })); }
    finally { setLoadingMore(false); }
  };
  const filteredEvents = events.filter(event => matchesFilter(event, filter));
  return <Modal isOpen={!!target} onClose={onClose} title="Histórico" maxWidth="max-w-lg"><div className="space-y-3">
    <div className="flex gap-2 overflow-x-auto pb-1">{FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-black whitespace-nowrap ${filter === value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{label}</button>)}</div>
    {loading && <p role="status" className="py-8 text-center text-sm font-bold text-gray-500">Carregando histórico...</p>}
    {!loading && loadError && <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-center"><p className="text-sm font-bold text-rose-700">{loadError}</p><button type="button" onClick={() => setReloadVersion(value => value + 1)} className="mt-3 rounded-xl bg-rose-100 px-4 py-2 text-xs font-black text-rose-700">Tentar novamente</button></div>}
    {!loading && !loadError && filteredEvents.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Nenhum evento encontrado neste filtro.</p>}
    {!loading && !loadError && filteredEvents.map(event => <div key={event.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><p className="font-black text-gray-900">{LABELS[event.tipo]}</p><p className="mt-1 text-xs text-gray-500">{event.criadoEm?.toDate?.().toLocaleString('pt-BR') || 'Data indisponível'} · Responsável: {actors[event.executadoPor] || 'Administrador não identificado'}</p>{event.tipo === 'USUARIO_ROLE_ALTERADO' && <p className="mt-2 text-sm text-gray-700"><strong>{ROLE_LABELS[event.valorAnterior] || event.valorAnterior || 'Não informado'}</strong> → <strong>{ROLE_LABELS[event.valorNovo] || event.valorNovo || 'Não informado'}</strong></p>}{event.motivo && <p className="mt-2 text-sm text-gray-700"><strong>Motivo:</strong> {event.motivo}</p>}</div>)}
    {!loading && !loadError && hasMore && <button type="button" onClick={loadMore} disabled={loadingMore} className="w-full rounded-xl bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-700 disabled:opacity-50">{loadingMore ? 'Carregando...' : 'Carregar eventos anteriores'}</button>}
  </div></Modal>;
};
