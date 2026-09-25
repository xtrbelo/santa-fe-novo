import React, { useEffect, useState } from 'react';
import { BriefcaseBusiness, Plus, Trash2 } from 'lucide-react';
import { addDoc, getAppCollection, getAppDoc, onSnapshot, Timestamp, updateDoc } from '../../services/firebase';
import { Button } from '../../components/ui/Button';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/useToast';

export const EventTeamPanel = ({ user }) => {
  const [members, setMembers] = useState([]);
  const [draft, setDraft] = useState({ nome: '', funcao: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const pagination = usePagination(members);

  useEffect(() => onSnapshot(getAppCollection('config_equipe_eventos'), snapshot => {
    setMembers(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')));
  }), []);

  const save = async () => {
    const nome = draft.nome.trim(); const funcao = draft.funcao.trim();
    if (!nome || !funcao) { toast.error('Informe o nome e a função.'); return; }
    setSaving(true);
    try {
      const now = Timestamp.now();
      await addDoc(getAppCollection('config_equipe_eventos'), { nome, funcao, ativo: true, criadoEm: now, criadoPor: user.uid, atualizadoEm: now, atualizadoPor: user.uid });
      setDraft({ nome: '', funcao: '' }); toast.success('Profissional adicionado à equipe de eventos.');
    } catch (error) { console.error(error); toast.error('Não foi possível cadastrar o profissional.'); }
    finally { setSaving(false); }
  };

  const deactivate = async member => {
    try { await updateDoc(getAppDoc('config_equipe_eventos', member.id), { ativo: false, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid }); toast.success('Profissional desativado.'); }
    catch (error) { console.error(error); toast.error('Não foi possível desativar o profissional.'); }
  };

  return <div className="space-y-4">
    <div><h3 className="flex items-center gap-2 font-black uppercase text-cyan-800"><BriefcaseBusiness size={18}/> Equipe de eventos</h3><p className="mt-1 text-xs text-gray-500">Profissionais e voluntários disponíveis para os eventos com serviços.</p></div>
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input value={draft.nome} onChange={event => setDraft(current => ({ ...current, nome: event.target.value }))} placeholder="Nome do profissional" className="rounded-xl bg-gray-50 p-3"/><input value={draft.funcao} onChange={event => setDraft(current => ({ ...current, funcao: event.target.value }))} placeholder="Função: Médico, Fisioterapeuta..." className="rounded-xl bg-gray-50 p-3"/><Button onClick={save} disabled={saving}><Plus size={16}/> Adicionar</Button></div>
    <div className="space-y-2">{pagination.items.map(member => <div key={member.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3"><div><strong className="text-sm">{member.nome}</strong><p className="text-xs text-cyan-800">{member.funcao}</p></div><button type="button" onClick={() => deactivate(member)} aria-label={`Desativar ${member.nome}`}><Trash2 size={16}/></button></div>)}{!members.length && <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">Nenhum profissional cadastrado.</p>}</div>
    <Pagination pagination={pagination} label="profissional(is)" />
  </div>;
};
