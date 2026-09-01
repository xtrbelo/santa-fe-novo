import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, getAppCollection, onSnapshot, Timestamp } from '../../services/firebase';
import { getPublicosPermitidosTrabalho, servicoControlaVagas, servicoPertenceAoTrabalho } from '../../utils/domain';
import { AgendaAdminCard } from './AgendaAdminCard';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/useToast';
import { CalendarDays, Filter, Plus } from 'lucide-react';
import { hasPermission, PERMISSIONS } from '../../constants/permissions';

const emptyDraft = { tipoTrabalhoId: '', data: '', horario: '12:00', servicosIds: [], publicosPermitidos: [], vagasTotais: {} };
const publicOptions = [{ id: 'consulente', nome: 'Consulentes' }, { id: 'membro', nome: 'Membros' }];

export const AgendasModule = ({ user, profile }) => {
  const [agendas, setAgendas] = useState([]);
  const [trabalhos, setTrabalhos] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(emptyDraft);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [mostrarPassado, setMostrarPassado] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!user) return undefined;
    const unsubs = [
      onSnapshot(getAppCollection('agendas'), s => setAgendas(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(getAppCollection('config_eventos'), s => setTrabalhos(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.ativo !== false))),
      onSnapshot(getAppCollection('config_servicos'), s => setServicos(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.ativo !== false)))
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [user]);

  const selectedWork = trabalhos.find(item => item.id === draft.tipoTrabalhoId);
  const availableServices = useMemo(() => servicos.filter(item => servicoPertenceAoTrabalho(item, draft.tipoTrabalhoId)), [servicos, draft.tipoTrabalhoId]);
  const selectedServices = availableServices.filter(item => draft.servicosIds.includes(item.id));
  const filtered = agendas.filter(agenda => {
    if (!mostrarPassado) { const today = new Date(); today.setHours(0, 0, 0, 0); if (agenda.data?.toDate() < today) return false; }
    return !filtroTipo || (agenda.tipoTrabalhoId || agenda.tipo) === filtroTipo || agenda.tipo === filtroTipo;
  }).sort((a, b) => (a.data?.toMillis() || 0) - (b.data?.toMillis() || 0));

  const openCreate = () => { setDraft({ ...emptyDraft, tipoTrabalhoId: trabalhos[0]?.id || '' }); setStep(1); setModal(true); };
  const chooseWork = id => {
    const work = trabalhos.find(item => item.id === id);
    setDraft({ ...draft, tipoTrabalhoId: id, servicosIds: [], vagasTotais: {}, publicosPermitidos: getPublicosPermitidosTrabalho(work) });
  };
  const toggleService = service => setDraft(current => ({ ...current, servicosIds: current.servicosIds.includes(service.id) ? current.servicosIds.filter(id => id !== service.id) : [...current.servicosIds, service.id] }));
  const togglePublic = id => setDraft(current => ({ ...current, publicosPermitidos: current.publicosPermitidos.includes(id) ? current.publicosPermitidos.filter(item => item !== id) : [...current.publicosPermitidos, id] }));
  const create = async () => {
    if (!selectedWork || !draft.data || !draft.horario || !draft.servicosIds.length) { toast.error('Revise os campos obrigatórios.'); return; }
    setSaving(true);
    try {
      const now = Timestamp.now();
      const names = Object.fromEntries(selectedServices.map(item => [item.id, item.nome]));
      const statuses = Object.fromEntries(selectedServices.map(item => [item.id, 'Ativo']));
      const totals = Object.fromEntries(selectedServices.filter(servicoControlaVagas).map(item => [item.id, Number(draft.vagasTotais[item.id] || 0)]));
      await addDoc(getAppCollection('agendas'), {
        tipoTrabalhoId: selectedWork.id, tipoTrabalhoNome: selectedWork.nome, tipo: selectedWork.nome,
        data: Timestamp.fromDate(new Date(`${draft.data}T${draft.horario}:00`)), horario: draft.horario,
        publicosPermitidos: draft.publicosPermitidos, servicosIds: draft.servicosIds,
        servicosNomes: names, servicosStatus: statuses, vagasTotais: totals,
        vagasOcupadas: Object.fromEntries(Object.keys(totals).map(id => [id, 0])),
        status: 'Agendada', ativo: true, criadoEm: now, criadoPor: user.uid, atualizadoEm: now, atualizadoPor: user.uid
      });
      toast.success('Agenda criada com sucesso.'); setModal(false);
    } catch (error) { console.error(error); toast.error('Não foi possível criar a agenda.'); }
    finally { setSaving(false); }
  };

  return <div className="space-y-6 pb-10">
    <header className="flex justify-between items-end"><div><h2 className="text-3xl font-black uppercase italic">Agendas</h2><p className="text-sm text-gray-500">Execução dos tipos de trabalho da Casa</p></div>{hasPermission(profile, PERMISSIONS.AGENDA_MANAGE) && <Button variant="warning" onClick={openCreate} className="rounded-full w-12 h-12 p-0"><Plus/></Button>}</header>
    <div className="space-y-3"><div className="flex items-center bg-white p-3 rounded-2xl"><Filter size={18} className="text-amber-500 mr-2"/><select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="w-full bg-transparent"><option value="">Todos os trabalhos</option>{trabalhos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></div><label className="text-xs font-bold"><input type="checkbox" checked={mostrarPassado} onChange={e => setMostrarPassado(e.target.checked)}/> Mostrar histórico passado</label></div>
    <div className="space-y-4">{filtered.length ? filtered.map(a => <AgendaAdminCard key={a.id} agenda={a} agendas={agendas} user={user} profile={profile} servicosCatalogo={servicos} trabalhos={trabalhos}/>) : <div className="text-center py-16 bg-white rounded-3xl"><CalendarDays className="mx-auto text-gray-300"/><p className="text-xs text-gray-400 mt-3">Nenhuma agenda encontrada</p></div>}</div>
    <Modal isOpen={modal} onClose={() => setModal(false)} title={`Nova Agenda · Etapa ${step}/5`}>
      <div className="space-y-5">
        {step === 1 && <div><label className="text-xs font-black uppercase">Tipo de Trabalho</label><select value={draft.tipoTrabalhoId} onChange={e => chooseWork(e.target.value)} className="w-full bg-gray-50 p-3 rounded-xl mt-2"><option value="">Selecione</option>{trabalhos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></div>}
        {step === 2 && <div className="grid grid-cols-2 gap-3"><input type="date" value={draft.data} onChange={e => setDraft({ ...draft, data: e.target.value })} className="bg-gray-50 p-3 rounded-xl"/><input type="time" value={draft.horario} onChange={e => setDraft({ ...draft, horario: e.target.value })} className="bg-gray-50 p-3 rounded-xl"/></div>}
        {step === 3 && <div className="space-y-2">{availableServices.map(s => <div key={s.id} className="bg-gray-50 p-3 rounded-xl"><label className="font-bold text-sm"><input type="checkbox" checked={draft.servicosIds.includes(s.id)} onChange={() => toggleService(s)}/> {s.nome}</label>{draft.servicosIds.includes(s.id) && servicoControlaVagas(s) && <input type="number" min="0" value={draft.vagasTotais[s.id] || ''} onChange={e => setDraft({ ...draft, vagasTotais: { ...draft.vagasTotais, [s.id]: Number(e.target.value) } })} placeholder="Quantidade de atendimentos" className="w-full bg-white p-2 rounded-lg mt-2"/>}</div>)}</div>}
        {step === 4 && <div className="space-y-2"><p className="text-xs text-gray-500">Público padrão do trabalho; ajuste para esta data.</p>{publicOptions.map(p => <label key={p.id} className="block font-bold"><input type="checkbox" checked={draft.publicosPermitidos.includes(p.id)} onChange={() => togglePublic(p.id)}/> {p.nome}</label>)}</div>}
        {step === 5 && <div className="bg-gray-50 p-4 rounded-xl text-sm space-y-2"><p><strong>Trabalho:</strong> {selectedWork?.nome}</p><p><strong>Data:</strong> {draft.data} às {draft.horario}</p><p><strong>Público:</strong> {draft.publicosPermitidos.join(', ') || 'sem restrição'}</p><p><strong>Serviços:</strong> {selectedServices.map(s => `${s.nome}${servicoControlaVagas(s) ? ` (${draft.vagasTotais[s.id] || 0} vagas)` : ''}`).join(', ')}</p></div>}
        <div className="flex gap-2"><Button variant="secondary" onClick={() => step === 1 ? setModal(false) : setStep(step - 1)} className="flex-1">Voltar</Button>{step < 5 ? <Button variant="warning" onClick={() => { if (step === 1 && selectedWork && !draft.publicosPermitidos.length) setDraft({ ...draft, publicosPermitidos: getPublicosPermitidosTrabalho(selectedWork) }); setStep(step + 1); }} className="flex-1">Continuar</Button> : <Button variant="warning" onClick={create} disabled={saving} className="flex-1">{saving ? 'Criando...' : 'Criar Agenda'}</Button>}</div>
      </div>
    </Modal>
  </div>;
};
