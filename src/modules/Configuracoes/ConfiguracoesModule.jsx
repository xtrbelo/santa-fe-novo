import React, { useEffect, useState } from 'react';
import { addDoc, getAppCollection, getAppDoc, inspectCpfIndexes, inspectMemberEmailIndexes, inspectVacancyCounters, onSnapshot, rebuildCpfIndex, rebuildPessoaSearchIndex, reconcileAgendaVacancies, Timestamp, updateDoc } from '../../services/firebase';
import { rebuildMemberEmailIndexOnServer, updateWorkTypeOnServer } from '../../services/firebaseFunctions';
import { getPublicosPermitidosTrabalho, servicoControlaVagas } from '../../utils/domain';
import { getEffectiveMemberFunctions } from '../../utils/pessoaForm';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataLoadState } from '../../components/ui/DataLoadState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Modal } from '../../components/ui/Modal';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/useToast';
import { CalendarDays, DatabaseZap, Plus, Tag, Trash2, Users } from 'lucide-react';
import { hasPermission, PERMISSIONS } from '../../constants/permissions';
import { AccessIntegrityPanel } from './AccessIntegrityPanel';
import { SystemHealthPanel } from './SystemHealthPanel';
import { WorkGroupsPanel } from './WorkGroupsPanel';
import { EventTeamPanel } from './EventTeamPanel';
import { BookResponsiblesPanel } from './BookResponsiblesPanel';
import { BookVolumesPanel } from './BookVolumesPanel';
import { SystemBackupPanel } from './SystemBackupPanel';

const publics = [{ id: 'consulente', nome: 'Consulente' }, { id: 'membro', nome: 'Membro' }];

export const ConfiguracoesModule = ({ user, profile, onOpenPerson }) => {
  const canManageConfig = hasPermission(profile, PERMISSIONS.CONFIG_MANAGE);
  const [funcoes, setFuncoes] = useState([]);
  const [trabalhos, setTrabalhos] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [novaFuncao, setNovaFuncao] = useState({ codigo: '', nome: '' });
  const [novoTrabalho, setNovoTrabalho] = useState({ nome: '', natureza: 'atendimento_publico', publicosPermitidos: ['consulente', 'membro'] });
  const [novoServico, setNovoServico] = useState({ nome: '', tipoTrabalhoIds: [], controlaVagas: false });
  const [editingWork, setEditingWork] = useState(null);
  const [savingWork, setSavingWork] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildReport, setRebuildReport] = useState(null);
  const [vacancyReport, setVacancyReport] = useState(null);
  const [checkingVacancies, setCheckingVacancies] = useState(false);
  const [reconcilingVacancies, setReconcilingVacancies] = useState(false);
  const [cpfReport, setCpfReport] = useState(null);
  const [checkingCpf, setCheckingCpf] = useState(false);
  const [rebuildingCpf, setRebuildingCpf] = useState(false);
  const [memberEmailReport, setMemberEmailReport] = useState(null);
  const [checkingMemberEmails, setCheckingMemberEmails] = useState(false);
  const [rebuildingMemberEmails, setRebuildingMemberEmails] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const toast = useToast();

  useEffect(() => {
    if (!user) { setLoadingData(false); return undefined; }
    setLoadingData(true); setLoadError(false);
    const pending = new Set(['functions', 'works', 'services']);
    const loaded = key => { pending.delete(key); if (!pending.size) setLoadingData(false); };
    const failed = error => { console.error(error); setLoadError(true); setLoadingData(false); };
    const unsubs = [
      onSnapshot(getAppCollection('config_funcoes_membro'), snap => { setFuncoes(snap.docs.map(d => ({ id: d.id, ...d.data() }))); loaded('functions'); }, failed),
      onSnapshot(getAppCollection('config_eventos'), snap => { setTrabalhos(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.ativo !== false)); loaded('works'); }, failed),
      onSnapshot(getAppCollection('config_servicos'), snap => { setServicos(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.ativo !== false)); loaded('services'); }, failed)
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [user, reloadVersion]);

  const metadata = () => ({ ativo: true, criadoEm: Timestamp.now(), criadoPor: user.uid, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid });
  const toggle = (list, id) => list.includes(id) ? list.filter(item => item !== id) : [...list, id];
  const addFunction = async () => {
    if (!novaFuncao.codigo.trim() || !novaFuncao.nome.trim()) return;
    await addDoc(getAppCollection('config_funcoes_membro'), { codigo: novaFuncao.codigo.trim().toLowerCase(), nome: novaFuncao.nome.trim(), ...metadata() });
    setNovaFuncao({ codigo: '', nome: '' }); toast.success('Função de membro cadastrada.');
  };
  const addWork = async () => {
    if (!novoTrabalho.nome.trim()) return;
    await addDoc(getAppCollection('config_eventos'), { nome: novoTrabalho.nome.trim(), natureza: novoTrabalho.natureza, publicosPermitidos: novoTrabalho.natureza === 'interno' ? ['membro'] : novoTrabalho.publicosPermitidos, ...metadata() });
    setNovoTrabalho({ nome: '', natureza: 'atendimento_publico', publicosPermitidos: ['consulente', 'membro'] }); toast.success('Tipo de trabalho cadastrado.');
  };
  const addService = async () => {
    if (!novoServico.nome.trim() || !novoServico.tipoTrabalhoIds.length) { toast.error('Selecione ao menos um tipo de trabalho.'); return; }
    await addDoc(getAppCollection('config_servicos'), { ...novoServico, nome: novoServico.nome.trim(), requerVagas: novoServico.controlaVagas, ...metadata() });
    setNovoServico({ nome: '', tipoTrabalhoIds: [], controlaVagas: false }); toast.success('Serviço cadastrado.');
  };
  const startWorkEdit = work => setEditingWork({ id: work.id, nome: work.nome || '', natureza: work.natureza || (work.nome?.trim().toLowerCase() === 'atendimento' ? 'atendimento_publico' : 'interno'), publicosPermitidos: work.natureza === 'interno' ? ['membro'] : getPublicosPermitidosTrabalho(work) });
  const saveWorkEdit = async () => {
    if (!editingWork?.nome.trim()) return;
    setSavingWork(true);
    try {
      await updateWorkTypeOnServer({ workTypeId: editingWork.id, nome: editingWork.nome.trim(), natureza: editingWork.natureza, publicosPermitidos: editingWork.natureza === 'interno' ? ['membro'] : editingWork.publicosPermitidos });
      toast.success('Tipo de trabalho atualizado.'); setEditingWork(null);
    } catch (error) {
      console.error(error);
      toast.error(error?.message?.includes('AGENDA_EM_ANDAMENTO') ? 'A natureza não pode ser alterada enquanto houver agenda em andamento.' : 'Não foi possível atualizar o tipo de trabalho.');
    } finally { setSavingWork(false); }
  };
  const deactivate = async () => {
    if (!itemToDelete) return;
    try {
      await updateDoc(getAppDoc(itemToDelete.collection, itemToDelete.id), { ativo: false, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid });
      toast.success('Configuração desativada.'); setItemToDelete(null);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível desativar a configuração.');
    }
  };

  const rebuildIndex = async () => {
    if (!window.confirm('Esta operação atualizará apenas o índice utilizado para pesquisa.\n\nNome, CPF, telefone e demais dados cadastrais não serão alterados.')) return;
    setRebuilding(true);
    const totals = { analyzed: 0, updated: 0, correct: 0, errors: 0 };
    try {
      let cursor = null;
      do {
        const page = await rebuildPessoaSearchIndex({ pageSize: 200, cursor });
        totals.analyzed += page.analyzed;
        totals.updated += page.updated;
        totals.correct += page.correct;
        totals.errors += page.errors;
        cursor = page.nextCursor;
        setRebuildReport({ ...totals });
      } while (cursor);
      toast.success('Índice de busca atualizado com sucesso.');
    } catch (error) {
      console.error(error);
      totals.errors += 1;
      setRebuildReport({ ...totals });
      toast.error('Não foi possível concluir a atualização do índice.');
    } finally {
      setRebuilding(false);
    }
  };

  const inspectAllVacancies = async () => {
    let cursor = null; const report = { analyzed: 0, divergences: [], skippedClosed: 0 };
    do {
      const page = await inspectVacancyCounters({ pageSize: 25, cursor });
      report.analyzed += page.analyzed; report.divergences.push(...page.divergences); report.skippedClosed += page.skippedClosed; cursor = page.nextCursor;
    } while (cursor);
    return report;
  };
  const checkVacancies = async () => {
    setCheckingVacancies(true);
    try { const report = await inspectAllVacancies(); setVacancyReport(report); toast.success(report.divergences.length ? `${report.divergences.length} agenda(s) com divergência.` : 'Contadores de vagas conferidos. Nenhuma divergência encontrada.'); }
    catch (error) { console.error(error); toast.error('Não foi possível verificar os contadores de vagas.'); }
    finally { setCheckingVacancies(false); }
  };
  const reconcileVacancies = async () => {
    if (!vacancyReport?.divergences.length || !window.confirm(`Corrigir os contadores de ${vacancyReport.divergences.length} agenda(s)?\n\nCada correção será recalculada e auditada.`)) return;
    setReconcilingVacancies(true); let corrected = 0; let errors = 0;
    for (const item of vacancyReport.divergences) {
      try { const result = await reconcileAgendaVacancies({ agendaId: item.agendaId, userId: user.uid }); if (result.updated) corrected += 1; }
      catch (error) { console.error(error); errors += 1; }
    }
    try { const refreshed = await inspectAllVacancies(); setVacancyReport({ ...refreshed, corrected, errors }); }
    catch (error) { console.error(error); setVacancyReport(current => ({ ...current, corrected, errors })); }
    toast[errors ? 'error' : 'success'](errors ? `${corrected} agenda(s) corrigida(s) e ${errors} não puderam ser atualizada(s). Verifique novamente.` : `${corrected} agenda(s) corrigida(s) com auditoria.`);
    setReconcilingVacancies(false);
  };

  const inspectAllCpfIndexes = async () => {
    let cursor = null; const report = { analyzed: 0, correct: 0, missing: [], conflicts: [], invalid: 0, withoutCpf: 0 };
    do {
      const page = await inspectCpfIndexes({ pageSize: 100, cursor });
      report.analyzed += page.analyzed; report.correct += page.correct; report.missing.push(...page.missing); report.conflicts.push(...page.conflicts); report.invalid += page.invalid; report.withoutCpf += page.withoutCpf; cursor = page.nextCursor;
    } while (cursor);
    return report;
  };
  const checkCpfIndexes = async () => {
    setCheckingCpf(true);
    try { const report = await inspectAllCpfIndexes(); setCpfReport(report); toast.success(report.missing.length ? `${report.missing.length} índice(s) de CPF pendente(s).` : 'Índices de CPF conferidos.'); }
    catch (error) { console.error(error); toast.error('Não foi possível verificar os índices de CPF.'); }
    finally { setCheckingCpf(false); }
  };
  const repairCpfIndexes = async () => {
    if (!cpfReport?.missing.length || !window.confirm(`Criar ${cpfReport.missing.length} índice(s) de CPF ausente(s)?\n\nConflitos e CPFs inválidos não serão alterados.`)) return;
    setRebuildingCpf(true); let updated = 0; let errors = 0;
    for (const item of cpfReport.missing) {
      try { const result = await rebuildCpfIndex({ pessoaId: item.pessoaId, userId: user.uid }); if (result.updated) updated += 1; }
      catch (error) { console.error(error); errors += 1; }
    }
    try { const refreshed = await inspectAllCpfIndexes(); setCpfReport({ ...refreshed, updated, errors }); }
    catch (error) { console.error(error); setCpfReport(current => ({ ...current, updated, errors })); }
    toast[errors ? 'error' : 'success'](errors ? `${updated} índice(s) criado(s) e ${errors} não puderam ser atualizados.` : `${updated} índice(s) de CPF criado(s) com auditoria.`);
    setRebuildingCpf(false);
  };

  const checkMemberEmailIndexes = async () => {
    setCheckingMemberEmails(true);
    try {
      const report = await inspectMemberEmailIndexes();
      setMemberEmailReport(report);
      const conflicts = report.conflicts.length + report.indexConflicts.length;
      toast.success(conflicts ? `${conflicts} conflito(s) de e-mail preservado(s) para análise.` : 'Índices de e-mail dos Membros conferidos.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível verificar os índices de e-mail dos Membros.');
    } finally {
      setCheckingMemberEmails(false);
    }
  };

  const repairMemberEmailIndexes = async () => {
    if (!memberEmailReport?.missing.length || !window.confirm(`Criar ${memberEmailReport.missing.length} índice(s) de e-mail ausente(s)?\n\nConflitos, e-mails inválidos e índices existentes não serão alterados.`)) return;
    setRebuildingMemberEmails(true);
    let updated = 0;
    let errors = 0;
    for (const item of memberEmailReport.missing) {
      try {
        const result = await rebuildMemberEmailIndexOnServer(item.pessoaId);
        if (result.updated) updated += 1;
      } catch (error) {
        console.error(error);
        errors += 1;
      }
    }
    try {
      const refreshed = await inspectMemberEmailIndexes();
      setMemberEmailReport({ ...refreshed, updated, errors });
    } catch (error) {
      console.error(error);
      setMemberEmailReport(current => ({ ...current, updated, errors }));
    }
    toast[errors ? 'error' : 'success'](errors ? `${updated} índice(s) criado(s) e ${errors} preservado(s) por segurança.` : `${updated} índice(s) de e-mail criado(s) com auditoria.`);
    setRebuildingMemberEmails(false);
  };

  const effectiveFunctions = getEffectiveMemberFunctions(funcoes);
  const functionsPagination = usePagination(effectiveFunctions);
  const worksPagination = usePagination(trabalhos);
  const servicesPagination = usePagination(servicos);
  if (loadingData || loadError) return <DataLoadState loading={loadingData} error={loadError} subject="as configurações" onRetry={() => setReloadVersion(value => value + 1)} />;
  return <div className="space-y-6 pb-10">
    <header><h2 className="text-3xl font-black uppercase italic">Configurações</h2><p className="text-sm text-gray-500">Modelo operacional da Casa</p></header>
    <Card className="space-y-4"><h3 className="font-black uppercase text-purple-700 flex gap-2"><Users size={18}/> 1. Vínculos e Funções da Casa</h3>
      <div className="grid sm:grid-cols-2 gap-3">{publics.map(item => <div key={item.id} className="bg-purple-50 p-4 rounded-xl"><strong>{item.nome}</strong><p className="text-xs text-gray-500 mt-1">{item.id === 'consulente' ? 'Pessoa atendida pela Casa.' : 'Integrante da Casa; pode atuar em funções e também receber atendimento.'}</p></div>)}</div>
      <div className="flex flex-col sm:flex-row gap-2"><input value={novaFuncao.codigo} onChange={e => setNovaFuncao({ ...novaFuncao, codigo: e.target.value })} placeholder="Código (ex: dirigente)" className="flex-1 bg-gray-50 p-3 rounded-xl"/><input value={novaFuncao.nome} onChange={e => setNovaFuncao({ ...novaFuncao, nome: e.target.value })} placeholder="Nome exibido" className="flex-1 bg-gray-50 p-3 rounded-xl"/><Button onClick={addFunction}><Plus size={16}/> Função</Button></div>
      <div className="flex flex-wrap gap-2">{functionsPagination.items.map(f => <span key={f.id} className="bg-gray-100 px-3 py-2 rounded-xl text-xs font-bold">{f.nome}</span>)}</div>
      <Pagination pagination={functionsPagination} label="função(ões)" />
    </Card>
    <Card className="space-y-4"><h3 className="font-black uppercase text-amber-600 flex gap-2"><CalendarDays size={18}/> 2. Tipos de Trabalho</h3>
      <input value={novoTrabalho.nome} onChange={e => setNovoTrabalho({ ...novoTrabalho, nome: e.target.value })} placeholder="Ex: Atendimento" className="w-full bg-gray-50 p-3 rounded-xl"/>
      <div className="grid gap-2 sm:grid-cols-3"><label className={`rounded-xl border p-3 text-sm font-bold ${novoTrabalho.natureza === 'atendimento_publico' ? 'border-amber-400 bg-amber-50' : 'border-gray-100'}`}><input type="radio" name="naturezaTrabalho" checked={novoTrabalho.natureza === 'atendimento_publico'} onChange={() => setNovoTrabalho({ ...novoTrabalho, natureza: 'atendimento_publico', publicosPermitidos: ['consulente', 'membro'] })}/> Atendimento da Casa<span className="mt-1 block text-xs font-normal text-gray-500">Serviços, retorno e equipe de médiuns/cambones.</span></label><label className={`rounded-xl border p-3 text-sm font-bold ${novoTrabalho.natureza === 'evento_servicos' ? 'border-amber-400 bg-amber-50' : 'border-gray-100'}`}><input type="radio" name="naturezaTrabalho" checked={novoTrabalho.natureza === 'evento_servicos'} onChange={() => setNovoTrabalho({ ...novoTrabalho, natureza: 'evento_servicos', publicosPermitidos: ['consulente', 'membro'] })}/> Evento com serviços<span className="mt-1 block text-xs font-normal text-gray-500">Vários serviços e público externo, sem turma da Casa.</span></label><label className={`rounded-xl border p-3 text-sm font-bold ${novoTrabalho.natureza === 'interno' ? 'border-amber-400 bg-amber-50' : 'border-gray-100'}`}><input type="radio" name="naturezaTrabalho" checked={novoTrabalho.natureza === 'interno'} onChange={() => setNovoTrabalho({ ...novoTrabalho, natureza: 'interno', publicosPermitidos: ['membro'] })}/> Trabalho interno<span className="mt-1 block text-xs font-normal text-gray-500">Somente presença dos membros da Casa.</span></label></div>
      {novoTrabalho.natureza !== 'interno' && <div className="flex gap-2">{publics.map(p => <label key={p.id} className="text-xs font-bold"><input type="checkbox" checked={novoTrabalho.publicosPermitidos.includes(p.id)} onChange={() => setNovoTrabalho({ ...novoTrabalho, publicosPermitidos: toggle(novoTrabalho.publicosPermitidos, p.id) })}/> {p.nome}</label>)}</div>}
      <Button onClick={addWork} variant="warning" className="w-full"><Plus size={16}/> Salvar Trabalho</Button>
      {worksPagination.items.map(t => <div key={t.id} className="flex justify-between bg-gray-50 p-3 rounded-xl"><div><strong className="text-sm">{t.nome}</strong><p className="text-[10px] font-bold text-amber-700">{(t.natureza || (t.nome?.toLowerCase() === 'atendimento' ? 'atendimento_publico' : 'interno')) === 'atendimento_publico' ? 'Atendimento ao público' : 'Trabalho interno'}</p><p className="text-[10px] text-gray-500">Público: {getPublicosPermitidosTrabalho(t).join(', ') || 'sem restrição'}</p></div><div className="flex items-center gap-3"><button className="text-xs font-bold text-amber-700" onClick={() => startWorkEdit(t)}>Editar</button><button onClick={() => setItemToDelete({ collection: 'config_eventos', id: t.id })}><Trash2 size={16}/></button></div></div>)}
      <Pagination pagination={worksPagination} label="tipo(s) de trabalho" />
    </Card>
    <Card className="space-y-4"><h3 className="font-black uppercase text-emerald-700 flex gap-2"><Tag size={18}/> 3. Catálogo de Serviços</h3>
      <input value={novoServico.nome} onChange={e => setNovoServico({ ...novoServico, nome: e.target.value })} placeholder="Nome do serviço" className="w-full bg-gray-50 p-3 rounded-xl"/>
      <div><p className="text-[10px] uppercase font-black text-gray-400 mb-2">Tipos de Trabalho *</p>{trabalhos.map(t => <label key={t.id} className="block text-xs font-bold mb-1"><input type="checkbox" checked={novoServico.tipoTrabalhoIds.includes(t.id)} onChange={() => setNovoServico({ ...novoServico, tipoTrabalhoIds: toggle(novoServico.tipoTrabalhoIds, t.id) })}/> {t.nome}</label>)}</div>
      <label className="text-xs font-bold"><input type="checkbox" checked={novoServico.controlaVagas} onChange={e => setNovoServico({ ...novoServico, controlaVagas: e.target.checked })}/> Controla quantidade de atendimentos?</label>
      <Button onClick={addService} variant="success" className="w-full"><Plus size={16}/> Adicionar Serviço</Button>
      {servicesPagination.items.map(s => <div key={s.id} className="flex justify-between bg-gray-50 p-3 rounded-xl"><div><strong className="text-sm">{s.nome}</strong><p className="text-[10px] text-gray-500">{servicoControlaVagas(s) ? 'Controla vagas' : 'Sem limite'} · {(s.tipoTrabalhoIds || []).map(id => trabalhos.find(t => t.id === id)?.nome).filter(Boolean).join(', ') || 'Legado/global'}</p></div><button onClick={() => setItemToDelete({ collection: 'config_servicos', id: s.id })}><Trash2 size={16}/></button></div>)}
      <Pagination pagination={servicesPagination} label="serviço(s)" />
    </Card>
    {canManageConfig && <Card className="space-y-4"><WorkGroupsPanel user={user} functions={effectiveFunctions}/></Card>}
    {canManageConfig && <Card className="space-y-4"><EventTeamPanel user={user}/></Card>}
    {canManageConfig && <Card className="space-y-4"><BookResponsiblesPanel user={user}/></Card>}
    {canManageConfig && <Card className="space-y-4"><BookVolumesPanel /></Card>}
    {canManageConfig && <Card className="space-y-4"><SystemBackupPanel /></Card>}
    {canManageConfig && <Card className="space-y-4">
      <h3 className="font-black uppercase text-blue-700 flex gap-2"><DatabaseZap size={18}/> Manutenção</h3>
      <SystemHealthPanel />
      <p className="text-sm text-gray-600">Reconstrói somente o índice derivado usado na busca de pessoas, em lotes seguros.</p>
      <Button onClick={rebuildIndex} disabled={rebuilding} className="w-full">{rebuilding ? 'Atualizando índice...' : 'Atualizar índice de busca de pessoas'}</Button>
      {rebuildReport && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
        <span className="bg-gray-50 p-2 rounded-lg">Analisadas<br/><strong>{rebuildReport.analyzed}</strong></span>
        <span className="bg-blue-50 p-2 rounded-lg">Atualizadas<br/><strong>{rebuildReport.updated}</strong></span>
        <span className="bg-emerald-50 p-2 rounded-lg">Já corretas<br/><strong>{rebuildReport.correct}</strong></span>
        <span className="bg-red-50 p-2 rounded-lg">Erros<br/><strong>{rebuildReport.errors}</strong></span>
      </div>}
      <div id="health-access" className="scroll-mt-6"><AccessIntegrityPanel onOpenPerson={onOpenPerson} /></div>
      <div id="health-member-email" className="scroll-mt-6 border-t border-gray-100 pt-4 space-y-3">
        <p className="text-sm text-gray-600">Confere o índice que impede e-mail duplicado entre Membros ativos. A verificação não altera cadastros.</p>
        <Button variant="secondary" onClick={checkMemberEmailIndexes} disabled={checkingMemberEmails || rebuildingMemberEmails} className="w-full">{checkingMemberEmails ? 'Verificando e-mails...' : 'Verificar índices de e-mail dos Membros'}</Button>
        {memberEmailReport && <div className="space-y-3 rounded-xl bg-gray-50 p-3 text-xs">
          <p><strong>{memberEmailReport.analyzed}</strong> Membro(s) ativo(s) · <strong>{memberEmailReport.correct}</strong> correto(s) · <strong>{memberEmailReport.missing.length}</strong> ausente(s) · <strong>{memberEmailReport.conflicts.length}</strong> e-mail(s) duplicado(s) · <strong>{memberEmailReport.indexConflicts.length}</strong> índice(s) divergente(s) · <strong>{memberEmailReport.invalid.length}</strong> inválido(s)</p>
          {memberEmailReport.orphanIndexes.length > 0 && <p><strong>{memberEmailReport.orphanIndexes.length}</strong> índice(s) órfão(s) preservado(s).</p>}
          {memberEmailReport.updated !== undefined && <p className="font-bold text-emerald-700">Última correção: {memberEmailReport.updated} criado(s) · {memberEmailReport.errors} erro(s).</p>}
          {(memberEmailReport.conflicts.length > 0 || memberEmailReport.indexConflicts.length > 0) && <p className="font-bold text-rose-700">Conflitos preservados para análise manual; nenhum e-mail ou índice existente será sobrescrito.</p>}
          {memberEmailReport.missing.length > 0 && <Button variant="warning" onClick={repairMemberEmailIndexes} disabled={rebuildingMemberEmails} className="w-full">{rebuildingMemberEmails ? 'Criando índices...' : 'Criar índices de e-mail ausentes'}</Button>}
        </div>}
      </div>
      <div className="border-t border-gray-100 pt-4 space-y-3"><p className="text-sm text-gray-600">Confere se as vagas ocupadas correspondem aos atendimentos ativos. A verificação não altera dados.</p><Button variant="secondary" onClick={checkVacancies} disabled={checkingVacancies || reconcilingVacancies} className="w-full">{checkingVacancies ? 'Verificando vagas...' : 'Verificar contadores de vagas'}</Button>{vacancyReport && <div className="space-y-3 rounded-xl bg-gray-50 p-3 text-xs"><p><strong>{vacancyReport.analyzed}</strong> agenda(s) analisada(s) · <strong>{vacancyReport.divergences.length}</strong> divergência(s){vacancyReport.skippedClosed ? ` · ${vacancyReport.skippedClosed} encerrada(s) preservada(s)` : ''}</p>{vacancyReport.corrected !== undefined && <p className="font-bold text-emerald-700">Última correção: {vacancyReport.corrected} corrigida(s) · {vacancyReport.errors} erro(s).</p>}{vacancyReport.divergences.slice(0, 10).map(item => <p key={item.agendaId} className="rounded-lg bg-white p-2"><strong>{item.tipo}</strong> · {item.data?.toDate?.().toLocaleDateString('pt-BR') || 'data indisponível'}<br/>Registrado: {Object.values(item.current).reduce((sum, value) => sum + Number(value || 0), 0)} · Encontrado: {Object.values(item.expected).reduce((sum, value) => sum + Number(value || 0), 0)}</p>)}{vacancyReport.divergences.length > 10 && <p>Mais {vacancyReport.divergences.length - 10} divergência(s) não exibida(s).</p>}{vacancyReport.divergences.length > 0 && <Button variant="warning" onClick={reconcileVacancies} disabled={reconcilingVacancies} className="w-full">{reconcilingVacancies ? 'Corrigindo vagas...' : 'Corrigir divergências'}</Button>}</div>}</div>
      <div className="border-t border-gray-100 pt-4 space-y-3"><p className="text-sm text-gray-600">Localiza Pessoas antigas com CPF válido e sem índice. A verificação não altera dados.</p><Button variant="secondary" onClick={checkCpfIndexes} disabled={checkingCpf || rebuildingCpf} className="w-full">{checkingCpf ? 'Verificando CPFs...' : 'Verificar índices de CPF'}</Button>{cpfReport && <div className="space-y-3 rounded-xl bg-gray-50 p-3 text-xs"><p><strong>{cpfReport.analyzed}</strong> pessoa(s) analisada(s) · <strong>{cpfReport.missing.length}</strong> ausente(s) · <strong>{cpfReport.conflicts.length}</strong> conflito(s) · <strong>{cpfReport.invalid}</strong> CPF(s) inválido(s) · <strong>{cpfReport.withoutCpf}</strong> sem CPF</p>{cpfReport.updated !== undefined && <p className="font-bold text-emerald-700">Última correção: {cpfReport.updated} criado(s) · {cpfReport.errors} erro(s).</p>}{cpfReport.conflicts.length > 0 && <p className="font-bold text-rose-700">Conflitos preservados para análise manual; nenhum índice existente será sobrescrito.</p>}{cpfReport.missing.length > 0 && <Button variant="warning" onClick={repairCpfIndexes} disabled={rebuildingCpf} className="w-full">{rebuildingCpf ? 'Criando índices...' : 'Criar índices ausentes'}</Button>}</div>}</div>
    </Card>}
    <ConfirmDialog isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} onConfirm={deactivate} title="Desativar configuração" message="Registros existentes serão preservados." confirmText="Desativar"/>
    <Modal isOpen={!!editingWork} onClose={() => !savingWork && setEditingWork(null)} title="Editar tipo de trabalho">{editingWork && <div className="space-y-4"><input value={editingWork.nome} onChange={event => setEditingWork({ ...editingWork, nome: event.target.value })} className="w-full rounded-xl bg-gray-50 p-3" placeholder="Nome do trabalho"/><div className="grid gap-2 sm:grid-cols-3">{[['atendimento_publico', 'Atendimento da Casa'], ['evento_servicos', 'Evento com serviços'], ['interno', 'Trabalho interno']].map(([value, label]) => <label key={value} className={`rounded-xl border p-3 text-sm font-bold ${editingWork.natureza === value ? 'border-amber-400 bg-amber-50' : 'border-gray-100'}`}><input type="radio" name="editarNaturezaTrabalho" checked={editingWork.natureza === value} onChange={() => setEditingWork({ ...editingWork, natureza: value, publicosPermitidos: value === 'interno' ? ['membro'] : ['consulente', 'membro'] })}/> {label}</label>)}</div>{editingWork.natureza !== 'interno' && <div className="flex gap-3">{publics.map(item => <label key={item.id} className="text-xs font-bold"><input type="checkbox" checked={editingWork.publicosPermitidos.includes(item.id)} onChange={() => setEditingWork({ ...editingWork, publicosPermitidos: toggle(editingWork.publicosPermitidos, item.id) })}/> {item.nome}</label>)}</div>}<div className="grid grid-cols-2 gap-3"><Button variant="secondary" disabled={savingWork} onClick={() => setEditingWork(null)}>Cancelar</Button><Button variant="warning" disabled={savingWork || !editingWork.nome.trim()} onClick={saveWorkEdit}>{savingWork ? 'Salvando...' : 'Salvar alterações'}</Button></div></div>}</Modal>
  </div>;
};
