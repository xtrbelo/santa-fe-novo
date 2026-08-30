import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Plus, RefreshCw, ShieldX } from 'lucide-react';
import { ConvidarMembroModal } from '../../components/pessoas/ConvidarMembroModal';
import { GerenciarConviteModal } from '../../components/pessoas/GerenciarConviteModal';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useToast } from '../../components/ui/useToast';
import { getAppCollection, onSnapshot } from '../../services/firebase';
import { maskCPF } from '../../utils/formatters';
import { getMemberInviteEffectiveStatus } from '../../utils/memberInvite';
import { formatDateBr } from '../../utils/pessoaDetails';

const timestampText = value => value?.toDate ? `${formatDateBr(value.toDate().toISOString().slice(0, 10))} ${value.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Não informado';
const statusLabels = { ativo: 'Ativo', expirado: 'Expirado', revogado: 'Revogado' };

export function ConvitesModule({ user, profile }) {
  const [invites, setInvites] = useState([]);
  const [filter, setFilter] = useState('ativo');
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [userNames, setUserNames] = useState({});
  const toast = useToast();
  useEffect(() => onSnapshot(getAppCollection('convites_membro'), snapshot => setInvites(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0)))), []);
  useEffect(() => {
    const ownName = String(profile?.nome || '').trim();
    if (profile?.role !== 'admin') { setUserNames(ownName ? { [user.uid]: ownName } : {}); return undefined; }
    return onSnapshot(getAppCollection('usuarios'), snapshot => setUserNames(Object.fromEntries(snapshot.docs.map(item => [item.id, String(item.data().nome || '').trim()]).filter(([, nome]) => nome))));
  }, [profile?.nome, profile?.role, user.uid]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const filtered = useMemo(() => invites.filter(invite => filter === 'todos' || getMemberInviteEffectiveStatus(invite, now) === filter), [filter, invites, now]);
  return <div className="space-y-6 pb-10">
    <header className="flex items-end justify-between gap-4"><div><h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 sm:text-3xl">Convites de Membros</h2><p className="mt-1 text-sm font-medium text-gray-500">Convites individuais para futuro autocadastro</p></div><Button variant="purple" onClick={() => setIsNewOpen(true)}><Plus size={18} /> Novo convite</Button></header>
    <div className="flex flex-wrap gap-2">{[['ativo', 'Ativos'], ['expirado', 'Expirados'], ['revogado', 'Revogados'], ['todos', 'Todos']].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-4 py-2 text-xs font-black uppercase ${filter === value ? 'bg-purple-600 text-white' : 'bg-white text-gray-500'}`}>{label}</button>)}</div>
    <div className="grid gap-3">{filtered.length === 0 ? <Card className="py-12 text-center text-sm font-bold text-gray-400">Nenhum convite neste filtro.</Card> : filtered.map(invite => { const status = getMemberInviteEffectiveStatus(invite, now); const creatorName = userNames[invite.criadoPor]; const revokerName = userNames[invite.revogadoPor]; return <Card key={invite.id} className="space-y-4 !border-none shadow-md"><div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-purple-600"><Mail size={22} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-gray-900">{invite.nome}</h3><span className="rounded-full bg-purple-50 px-2 py-0.5 text-[9px] font-black uppercase text-purple-700">{statusLabels[status]}</span></div><p className="mt-1 text-xs font-bold text-gray-500">CPF: {maskCPF(invite.cpf)}{invite.email ? ` · ${invite.email}` : ''}</p><p className="mt-1 text-xs text-gray-400">Criado em: {timestampText(invite.criadoEm)} · Validade: {timestampText(invite.expiraEm)}</p>{creatorName && <p className="mt-1 text-xs text-gray-400">Criado por: {creatorName}</p>}{invite.revogadoEm && <p className="mt-1 text-xs text-rose-500">Revogado em: {timestampText(invite.revogadoEm)}</p>}{revokerName && <p className="mt-1 text-xs text-rose-500">Revogado por: {revokerName}</p>}</div></div><div className="flex gap-2 border-t border-gray-50 pt-3" onClick={event => event.stopPropagation()}>{invite.status === 'ativo' && <Button variant="danger" onClick={() => setSelectedInvite(invite)} className="flex-1"><ShieldX size={15} /> Revogar</Button>}<Button variant="secondary" onClick={() => setSelectedInvite(invite)} className="flex-1 text-purple-700"><RefreshCw size={15} /> Reenviar convite</Button></div></Card>; })}</div>
    <ConvidarMembroModal isOpen={isNewOpen} userId={user.uid} onClose={() => setIsNewOpen(false)} toast={toast} />
    <GerenciarConviteModal invite={selectedInvite} userId={user.uid} userNames={userNames} onClose={() => setSelectedInvite(null)} toast={toast} />
  </div>;
}
