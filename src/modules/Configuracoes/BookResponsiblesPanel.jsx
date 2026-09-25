import React, { useEffect, useMemo, useState } from 'react';
import { BookLock, Save } from 'lucide-react';
import { getAppCollection, getAppDoc, onSnapshot, setDoc, Timestamp } from '../../services/firebase';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/useToast';

const member = person => person.ativo !== false && String(person.vinculo || person.tipoPessoa || '').toLowerCase().includes('membro') && /^\d{11}$/.test(String(person.cpf || '').replace(/\D/g, ''));

export const BookResponsiblesPanel = ({ user }) => {
  const [people, setPeople] = useState([]); const [draft, setDraft] = useState({ titularPessoaId: '', substitutaPessoaId: '' }); const [saving, setSaving] = useState(false); const toast = useToast();
  useEffect(() => {
    const unsubPeople = onSnapshot(getAppCollection('pessoas'), snapshot => setPeople(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(member)));
    const unsubConfig = onSnapshot(getAppDoc('config_livro_mediunico', 'responsaveis'), snapshot => { if (snapshot.exists()) setDraft({ titularPessoaId: snapshot.data().titularPessoaId || '', substitutaPessoaId: snapshot.data().substitutaPessoaId || '' }); });
    return () => { unsubPeople(); unsubConfig(); };
  }, []);
  const options = useMemo(() => [...people].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')), [people]);
  const save = async () => {
    if (!draft.titularPessoaId || !draft.substitutaPessoaId || draft.titularPessoaId === draft.substitutaPessoaId) { toast.error('Selecione duas pessoas diferentes.'); return; }
    setSaving(true);
    try { await setDoc(getAppDoc('config_livro_mediunico', 'responsaveis'), { ...draft, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid }, { merge: true }); toast.success('Responsáveis pelo Livro Mediúnico atualizadas.'); }
    catch (error) { console.error(error); toast.error('Não foi possível salvar as responsáveis.'); }
    finally { setSaving(false); }
  };
  const select = (label, field) => <label className="block text-xs font-black uppercase text-gray-500">{label}<select value={draft[field]} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded-xl bg-gray-50 p-3 text-sm"><option value="">Selecione um Membro</option>{options.map(person => <option key={person.id} value={person.id}>{person.nome} · CPF final {String(person.cpf).slice(-2)}</option>)}</select></label>;
  return <div className="space-y-4"><div><h3 className="flex items-center gap-2 font-black uppercase text-violet-800"><BookLock size={18}/> Responsáveis pelo Livro Mediúnico</h3><p className="mt-1 text-xs text-gray-500">Somente Membros ativos com CPF podem responder pelo fechamento. O CPF completo permanece protegido.</p></div><div className="grid gap-3 sm:grid-cols-2">{select('Dirigente titular', 'titularPessoaId')}{select('Responsável substituta', 'substitutaPessoaId')}</div><Button onClick={save} disabled={saving} className="w-full"><Save size={16}/> {saving ? 'Salvando...' : 'Salvar responsáveis'}</Button></div>;
};
