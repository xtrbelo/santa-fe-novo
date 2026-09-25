import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, getAppCollection, getAppDoc, onSnapshot, Timestamp, updateDoc } from '../../services/firebase';
import { buildAttendanceWorkerGroups } from '../../utils/attendanceWorkers';
import { WEEKDAYS } from '../../utils/workGroups';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/useToast';
import { Plus, Users } from 'lucide-react';

const emptyDraft = { nome: '', diasSemana: [], mediunsIds: [], cambonesIds: [] };
const toggle = (items, id) => items.includes(id) ? items.filter(item => item !== id) : [...items, id];

export const WorkGroupsPanel = ({ user, functions }) => {
  const [groups, setGroups] = useState([]); const [people, setPeople] = useState([]);
  const [draft, setDraft] = useState(null); const [saving, setSaving] = useState(false); const toast = useToast();
  useEffect(() => {
    const unsubGroups = onSnapshot(getAppCollection('config_grupos_trabalho'), snapshot => setGroups(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))));
    const unsubPeople = onSnapshot(getAppCollection('pessoas'), snapshot => setPeople(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))));
    return () => { unsubGroups(); unsubPeople(); };
  }, []);
  const workers = useMemo(() => buildAttendanceWorkerGroups(people, functions), [people, functions]);
  const save = async () => {
    if (!draft.nome.trim() || !draft.diasSemana.length || (!draft.mediunsIds.length && !draft.cambonesIds.length)) { toast.error('Informe nome, dia e pelo menos um trabalhador.'); return; }
    setSaving(true);
    const payload = { nome: draft.nome.trim(), diasSemana: [...new Set(draft.diasSemana)].sort(), mediunsIds: [...new Set(draft.mediunsIds)], cambonesIds: [...new Set(draft.cambonesIds)], ativo: true, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid };
    try {
      if (draft.id) await updateDoc(getAppDoc('config_grupos_trabalho', draft.id), payload);
      else await addDoc(getAppCollection('config_grupos_trabalho'), { ...payload, criadoEm: Timestamp.now(), criadoPor: user.uid });
      toast.success(draft.id ? 'Turma atualizada.' : 'Turma criada.'); setDraft(null);
    } catch (error) { console.error(error); toast.error('Não foi possível salvar a turma.'); }
    finally { setSaving(false); }
  };
  const deactivate = async group => { try { await updateDoc(getAppDoc('config_grupos_trabalho', group.id), { ativo: false, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid }); toast.success('Turma inativada.'); } catch (error) { console.error(error); toast.error('Não foi possível inativar a turma.'); } };
  return <>
    <div className="flex items-center justify-between"><h3 className="flex gap-2 font-black uppercase text-indigo-700"><Users size={18}/> 4. Grupos de Trabalho</h3><Button onClick={() => setDraft({ ...emptyDraft })}><Plus size={16}/> Nova turma</Button></div>
    <p className="text-sm text-gray-600">Defina os Médiuns e Cambones disponíveis para os atendimentos ao público de cada dia. Trabalhos internos não utilizam estas turmas.</p>
    <div className="space-y-2">{groups.filter(group => group.ativo !== false).map(group => <div key={group.id} className="rounded-xl bg-gray-50 p-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{group.nome}</strong><p className="mt-1 text-xs text-gray-500">{WEEKDAYS.filter(day => group.diasSemana?.includes(day.id)).map(day => day.label).join(', ')} · {(group.mediunsIds || []).length} Médium(ns) · {(group.cambonesIds || []).length} Cambone(s)</p></div><div className="flex gap-2"><button className="text-xs font-bold text-indigo-700" onClick={() => setDraft({ ...group })}>Editar</button><button className="text-xs font-bold text-rose-700" onClick={() => deactivate(group)}>Inativar</button></div></div></div>)}{!groups.some(group => group.ativo !== false) && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Nenhuma turma cadastrada.</p>}</div>
    <Modal isOpen={!!draft} onClose={() => !saving && setDraft(null)} title={draft?.id ? 'Editar turma' : 'Nova turma'}>{draft && <div className="space-y-4"><input value={draft.nome} onChange={event => setDraft({ ...draft, nome: event.target.value })} placeholder="Ex.: Turma de Segunda" className="w-full rounded-xl bg-gray-50 p-3"/><div><p className="mb-2 text-xs font-black uppercase text-gray-500">Dias da semana</p><div className="flex flex-wrap gap-2">{WEEKDAYS.map(day => <label key={day.id} className={`rounded-xl border p-2 text-xs font-bold ${draft.diasSemana.includes(day.id) ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100'}`}><input type="checkbox" checked={draft.diasSemana.includes(day.id)} onChange={() => setDraft({ ...draft, diasSemana: toggle(draft.diasSemana, day.id) })}/> {day.label}</label>)}</div></div>{[['mediunsIds', 'Médiuns', workers.mediuns], ['cambonesIds', 'Cambones', workers.cambones]].map(([field, label, list]) => <section key={field}><p className="mb-2 text-xs font-black uppercase text-gray-500">{label}</p><div className="max-h-44 space-y-2 overflow-y-auto">{list.map(person => <label key={person.id} className="flex items-center gap-2 rounded-xl bg-gray-50 p-2 text-sm font-bold"><input type="checkbox" checked={draft[field].includes(person.id)} onChange={() => setDraft({ ...draft, [field]: toggle(draft[field], person.id) })}/>{person.nome}</label>)}</div></section>)}<div className="grid grid-cols-2 gap-3"><Button variant="secondary" disabled={saving} onClick={() => setDraft(null)}>Cancelar</Button><Button disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar turma'}</Button></div></div>}</Modal>
  </>;
};
