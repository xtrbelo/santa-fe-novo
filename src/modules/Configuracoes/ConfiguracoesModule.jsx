import React, { useEffect, useState } from 'react';
import { addDoc, getAppCollection, getAppDoc, onSnapshot, rebuildPessoaSearchIndex, Timestamp, updateDoc } from '../../services/firebase';
import { getPublicosPermitidosTrabalho, servicoControlaVagas } from '../../utils/domain';
import { getEffectiveMemberFunctions } from '../../utils/pessoaForm';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { CalendarDays, DatabaseZap, Plus, Tag, Trash2, Users } from 'lucide-react';

const publics = [{ id: 'consulente', nome: 'Consulente' }, { id: 'membro', nome: 'Membro' }];

export const ConfiguracoesModule = ({ user, profile }) => {
  const [funcoes, setFuncoes] = useState([]);
  const [trabalhos, setTrabalhos] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [novaFuncao, setNovaFuncao] = useState({ codigo: '', nome: '' });
  const [novoTrabalho, setNovoTrabalho] = useState({ nome: '', publicosPermitidos: ['consulente', 'membro'] });
  const [novoServico, setNovoServico] = useState({ nome: '', tipoTrabalhoIds: [], controlaVagas: false });
  const [itemToDelete, setItemToDelete] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildReport, setRebuildReport] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (!user) return undefined;
    const unsubs = [
      onSnapshot(getAppCollection('config_funcoes_membro'), snap => setFuncoes(snap.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(getAppCollection('config_eventos'), snap => setTrabalhos(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.ativo !== false))),
      onSnapshot(getAppCollection('config_servicos'), snap => setServicos(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.ativo !== false)))
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [user]);

  const metadata = () => ({ ativo: true, criadoEm: Timestamp.now(), criadoPor: user.uid, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid });
  const toggle = (list, id) => list.includes(id) ? list.filter(item => item !== id) : [...list, id];
  const addFunction = async () => {
    if (!novaFuncao.codigo.trim() || !novaFuncao.nome.trim()) return;
    await addDoc(getAppCollection('config_funcoes_membro'), { codigo: novaFuncao.codigo.trim().toLowerCase(), nome: novaFuncao.nome.trim(), ...metadata() });
    setNovaFuncao({ codigo: '', nome: '' }); toast.success('Função de membro cadastrada.');
  };
  const addWork = async () => {
    if (!novoTrabalho.nome.trim()) return;
    await addDoc(getAppCollection('config_eventos'), { nome: novoTrabalho.nome.trim(), publicosPermitidos: novoTrabalho.publicosPermitidos, ...metadata() });
    setNovoTrabalho({ nome: '', publicosPermitidos: ['consulente', 'membro'] }); toast.success('Tipo de trabalho cadastrado.');
  };
  const addService = async () => {
    if (!novoServico.nome.trim() || !novoServico.tipoTrabalhoIds.length) { toast.error('Selecione ao menos um tipo de trabalho.'); return; }
    await addDoc(getAppCollection('config_servicos'), { ...novoServico, nome: novoServico.nome.trim(), requerVagas: novoServico.controlaVagas, ...metadata() });
    setNovoServico({ nome: '', tipoTrabalhoIds: [], controlaVagas: false }); toast.success('Serviço cadastrado.');
  };
  const deactivate = async () => {
    if (!itemToDelete) return;
    await updateDoc(getAppDoc(itemToDelete.collection, itemToDelete.id), { ativo: false, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid });
    toast.success('Configuração desativada.'); setItemToDelete(null);
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

  const effectiveFunctions = getEffectiveMemberFunctions(funcoes);
  return <div className="space-y-6 pb-10">
    <header><h2 className="text-3xl font-black uppercase italic">Configurações</h2><p className="text-sm text-gray-500">Modelo operacional da Casa</p></header>
    <Card className="space-y-4"><h3 className="font-black uppercase text-purple-700 flex gap-2"><Users size={18}/> 1. Vínculos e Funções da Casa</h3>
      <div className="grid sm:grid-cols-2 gap-3">{publics.map(item => <div key={item.id} className="bg-purple-50 p-4 rounded-xl"><strong>{item.nome}</strong><p className="text-xs text-gray-500 mt-1">{item.id === 'consulente' ? 'Pessoa atendida pela Casa.' : 'Integrante da Casa; pode atuar em funções e também receber atendimento.'}</p></div>)}</div>
      <div className="flex flex-col sm:flex-row gap-2"><input value={novaFuncao.codigo} onChange={e => setNovaFuncao({ ...novaFuncao, codigo: e.target.value })} placeholder="Código (ex: dirigente)" className="flex-1 bg-gray-50 p-3 rounded-xl"/><input value={novaFuncao.nome} onChange={e => setNovaFuncao({ ...novaFuncao, nome: e.target.value })} placeholder="Nome exibido" className="flex-1 bg-gray-50 p-3 rounded-xl"/><Button onClick={addFunction}><Plus size={16}/> Função</Button></div>
      <div className="flex flex-wrap gap-2">{effectiveFunctions.map(f => <span key={f.id} className="bg-gray-100 px-3 py-2 rounded-xl text-xs font-bold">{f.nome}</span>)}</div>
    </Card>
    <Card className="space-y-4"><h3 className="font-black uppercase text-amber-600 flex gap-2"><CalendarDays size={18}/> 2. Tipos de Trabalho</h3>
      <input value={novoTrabalho.nome} onChange={e => setNovoTrabalho({ ...novoTrabalho, nome: e.target.value })} placeholder="Ex: Atendimento" className="w-full bg-gray-50 p-3 rounded-xl"/>
      <div className="flex gap-2">{publics.map(p => <label key={p.id} className="text-xs font-bold"><input type="checkbox" checked={novoTrabalho.publicosPermitidos.includes(p.id)} onChange={() => setNovoTrabalho({ ...novoTrabalho, publicosPermitidos: toggle(novoTrabalho.publicosPermitidos, p.id) })}/> {p.nome}</label>)}</div>
      <Button onClick={addWork} variant="warning" className="w-full"><Plus size={16}/> Salvar Trabalho</Button>
      {trabalhos.map(t => <div key={t.id} className="flex justify-between bg-gray-50 p-3 rounded-xl"><div><strong className="text-sm">{t.nome}</strong><p className="text-[10px] text-gray-500">Público: {getPublicosPermitidosTrabalho(t).join(', ') || 'sem restrição'}</p></div><button onClick={() => setItemToDelete({ collection: 'config_eventos', id: t.id })}><Trash2 size={16}/></button></div>)}
    </Card>
    <Card className="space-y-4"><h3 className="font-black uppercase text-emerald-700 flex gap-2"><Tag size={18}/> 3. Catálogo de Serviços</h3>
      <input value={novoServico.nome} onChange={e => setNovoServico({ ...novoServico, nome: e.target.value })} placeholder="Nome do serviço" className="w-full bg-gray-50 p-3 rounded-xl"/>
      <div><p className="text-[10px] uppercase font-black text-gray-400 mb-2">Tipos de Trabalho *</p>{trabalhos.map(t => <label key={t.id} className="block text-xs font-bold mb-1"><input type="checkbox" checked={novoServico.tipoTrabalhoIds.includes(t.id)} onChange={() => setNovoServico({ ...novoServico, tipoTrabalhoIds: toggle(novoServico.tipoTrabalhoIds, t.id) })}/> {t.nome}</label>)}</div>
      <label className="text-xs font-bold"><input type="checkbox" checked={novoServico.controlaVagas} onChange={e => setNovoServico({ ...novoServico, controlaVagas: e.target.checked })}/> Controla quantidade de atendimentos?</label>
      <Button onClick={addService} variant="success" className="w-full"><Plus size={16}/> Adicionar Serviço</Button>
      {servicos.map(s => <div key={s.id} className="flex justify-between bg-gray-50 p-3 rounded-xl"><div><strong className="text-sm">{s.nome}</strong><p className="text-[10px] text-gray-500">{servicoControlaVagas(s) ? 'Controla vagas' : 'Sem limite'} · {(s.tipoTrabalhoIds || []).map(id => trabalhos.find(t => t.id === id)?.nome).filter(Boolean).join(', ') || 'Legado/global'}</p></div><button onClick={() => setItemToDelete({ collection: 'config_servicos', id: s.id })}><Trash2 size={16}/></button></div>)}
    </Card>
    {profile?.role === 'admin' && <Card className="space-y-4">
      <h3 className="font-black uppercase text-blue-700 flex gap-2"><DatabaseZap size={18}/> Manutenção</h3>
      <p className="text-sm text-gray-600">Reconstrói somente o índice derivado usado na busca de pessoas, em lotes seguros.</p>
      <Button onClick={rebuildIndex} disabled={rebuilding} className="w-full">{rebuilding ? 'Atualizando índice...' : 'Atualizar índice de busca de pessoas'}</Button>
      {rebuildReport && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
        <span className="bg-gray-50 p-2 rounded-lg">Analisadas<br/><strong>{rebuildReport.analyzed}</strong></span>
        <span className="bg-blue-50 p-2 rounded-lg">Atualizadas<br/><strong>{rebuildReport.updated}</strong></span>
        <span className="bg-emerald-50 p-2 rounded-lg">Já corretas<br/><strong>{rebuildReport.correct}</strong></span>
        <span className="bg-red-50 p-2 rounded-lg">Erros<br/><strong>{rebuildReport.errors}</strong></span>
      </div>}
    </Card>}
    <ConfirmDialog isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} onConfirm={deactivate} title="Desativar configuração" message="Registros existentes serão preservados." confirmText="Desativar"/>
  </div>;
};
