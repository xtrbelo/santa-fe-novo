import React, { useEffect, useMemo, useState } from 'react';
import { autorizarUsuario, cancelAccessAuthorization, createAccessAuthorization, getAppCollection, onSnapshot, vincularUsuarioPessoa } from '../../services/firebase';
import { sendAccessActivationOnServer, sendPasswordResetOnServer, updateUserAccessOnServer } from '../../services/firebaseFunctions';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import { getPessoaFuncoesCasa } from '../../utils/domain';
import { getEffectiveMemberFunctions, getMemberFunctionLabels, localTextIncludes, normalizeEmail } from '../../utils/pessoaForm';
import { PessoaSearchSelector } from '../../components/pessoas/PessoaSearchSelector';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataLoadState } from '../../components/ui/DataLoadState';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { UsuarioCard } from './UsuarioCard';
import { LifecycleHistoryModal } from '../../components/audit/LifecycleHistoryModal';
import { Search, ShieldCheck, UsersRound } from 'lucide-react';
import { maskCPF } from '../../utils/formatters';
import { validateAccessAuthorization } from '../../utils/accessAuthorization';
import { getFriendlyErrorMessage } from '../../utils/firebaseErrorMessages';
import { hasPermission, PERMISSIONS } from '../../constants/permissions';

const FILTERS = [['todos', 'Todos'], ['pendentes', 'Pendentes'], ['admin', 'Administradores'], ['gestor', 'Gestores / Dirigentes'], ['atendimento', 'Atendimento / Recepção'], ['suspensos', 'Membro inativo'], ['inativos', 'Inativos'], ['sem-vinculo', 'Sem vínculo']];
const OPERATIONAL_ROLES = [ROLES.ADMIN, ROLES.GESTOR, ROLES.ATENDIMENTO];
const MEMBER_FILTER = ['membro'];
const ROLE_ORDER = { [ROLES.PENDENTE]: 0, [ROLES.ADMIN]: 1, [ROLES.GESTOR]: 2, [ROLES.ATENDIMENTO]: 3 };
const ROLE_IMPACT = {
  [ROLES.ADMIN]: 'Controle administrativo completo, inclusive Usuários e Configurações.',
  [ROLES.GESTOR]: 'Gestão de pessoas e programação, sem administrar usuários ou configurações.',
  [ROLES.ATENDIMENTO]: 'Operação de atendimentos e Fluxo do Dia, sem funções administrativas.'
};

export const UsuariosModule = ({ user, profile, initialFilter = 'todos' }) => {
  const [usuarios, setUsuarios] = useState([]);
  const [pessoas, setPessoas] = useState({});
  const [memberFunctions, setMemberFunctions] = useState([]);
  const [authorizations, setAuthorizations] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(initialFilter);
  const [roleTarget, setRoleTarget] = useState(null);
  const [selectedRole, setSelectedRole] = useState(ROLES.ATENDIMENTO);
  const [accessTarget, setAccessTarget] = useState(null);
  const [selectedPessoa, setSelectedPessoa] = useState(null);
  const [accessRole, setAccessRole] = useState(ROLES.ATENDIMENTO);
  const [accessStep, setAccessStep] = useState('person');
  const [confirmation, setConfirmation] = useState(null);
  const [lifecycleTarget, setLifecycleTarget] = useState(null);
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [historyUser, setHistoryUser] = useState(null);
  const [newAccessOpen, setNewAccessOpen] = useState(false);
  const [newAccessStep, setNewAccessStep] = useState('person');
  const [newAccessPessoa, setNewAccessPessoa] = useState(null);
  const [newAccessRole, setNewAccessRole] = useState(ROLES.ATENDIMENTO);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const toast = useToast();
  const canViewUsers = hasPermission(profile, PERMISSIONS.USERS_VIEW);
  const canManageUsers = hasPermission(profile, PERMISSIONS.USERS_MANAGE);

  useEffect(() => setFilter(initialFilter), [initialFilter]);
  useEffect(() => {
    if (!canViewUsers) { setLoadingData(false); return undefined; }
    setLoadingData(true); setLoadError(false);
    const pending = new Set(['users', 'people', 'functions', 'authorizations']);
    const loaded = key => { pending.delete(key); if (!pending.size) setLoadingData(false); };
    const failed = error => { console.error(error); setLoadError(true); setLoadingData(false); };
    const unsubUsers = onSnapshot(getAppCollection('usuarios'), snapshot => { setUsuarios(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); loaded('users'); }, failed);
    const unsubPeople = onSnapshot(getAppCollection('pessoas'), snapshot => { setPessoas(Object.fromEntries(snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }]))); loaded('people'); }, failed);
    const unsubFunctions = onSnapshot(getAppCollection('config_funcoes_membro'), snapshot => { setMemberFunctions(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); loaded('functions'); }, failed);
    const unsubAuthorizations = onSnapshot(getAppCollection('autorizacoes_acesso'), snapshot => { setAuthorizations(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); loaded('authorizations'); }, failed);
    return () => { unsubUsers(); unsubPeople(); unsubFunctions(); unsubAuthorizations(); };
  }, [canViewUsers, reloadVersion]);

  const pendingCount = usuarios.filter(item => item.ativo !== false && item.role === ROLES.PENDENTE).length;
  const inactiveCount = usuarios.filter(item => item.ativo === false).length;
  const activeCount = usuarios.filter(item => item.ativo !== false && OPERATIONAL_ROLES.includes(item.role) && pessoas[item.pessoaBaseId]?.ativo !== false).length;
  const pendingAuthorizations = authorizations.filter(item => item.status === 'pendente');
  const effectiveMemberFunctions = getEffectiveMemberFunctions(memberFunctions);
  const filteredUsers = useMemo(() => {
    const term = search.trim();
    return usuarios.filter(item => {
      const matchesSearch = !term || [item.nome, item.email, item.uid, pessoas[item.pessoaBaseId]?.nome].some(value => localTextIncludes(value, term));
      const matchesFilter = filter === 'todos' || (filter === 'pendentes' && item.role === ROLES.PENDENTE && item.ativo !== false) || (filter === 'suspensos' && item.ativo !== false && pessoas[item.pessoaBaseId]?.ativo === false) || (filter === 'inativos' && item.ativo === false) || (filter === 'sem-vinculo' && item.role !== ROLES.PENDENTE && !item.pessoaBaseId) || (filter === item.role && item.ativo !== false);
      return matchesSearch && matchesFilter;
    }).sort((a, b) => {
      const groupA = a.ativo === false ? 4 : (ROLE_ORDER[a.role] ?? 4);
      const groupB = b.ativo === false ? 4 : (ROLE_ORDER[b.role] ?? 4);
      return groupA - groupB || (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    });
  }, [usuarios, pessoas, search, filter]);

  if (!canManageUsers) return <Card><p className="font-bold text-rose-600">Você não possui permissão para acessar esta funcionalidade.</p></Card>;
  if (loadingData || loadError) return <DataLoadState loading={loadingData} error={loadError} subject="os usuários" onRetry={() => setReloadVersion(value => value + 1)} />;

  const openAccess = usuario => { setAccessTarget(usuario); setSelectedPessoa(null); setAccessRole(ROLES.ATENDIMENTO); setAccessStep('person'); };
  const confirmAccess = async () => {
    if (!accessTarget || !selectedPessoa) return;
    setSaving(true);
    try {
      if (accessTarget.role === ROLES.PENDENTE) await autorizarUsuario({ uid: accessTarget.uid, pessoaBaseId: selectedPessoa.id, role: accessRole, executadoPor: user.uid });
      else await vincularUsuarioPessoa({ uid: accessTarget.uid, pessoaBaseId: selectedPessoa.id, executadoPor: user.uid });
      toast.success(accessTarget.role === ROLES.PENDENTE ? 'Acesso autorizado com sucesso.' : 'Membro vinculado com sucesso.'); setAccessTarget(null);
    } catch (error) {
      console.error(error);
      const messages = {
        PESSOA_JA_POSSUI_ACESSO: 'Este membro já possui uma conta vinculada ao sistema.',
        PESSOA_NAO_E_MEMBRO_ATIVO: 'Selecione um membro ativo.',
        EMAIL_MEMBRO_DIVERGENTE: 'O e-mail desta conta não corresponde ao e-mail cadastrado para este membro.',
        MEMBRO_SEM_EMAIL_ACESSO: 'Este membro não possui e-mail cadastrado para acesso ao sistema.'
      };
      toast.error(getFriendlyErrorMessage(error, { fallback: 'Não foi possível concluir a autorização.', businessMessages: messages }));
    } finally { setSaving(false); }
  };
  const requestRoleChange = () => { if (roleTarget && roleTarget.uid !== user.uid && OPERATIONAL_ROLES.includes(selectedRole)) { setConfirmation({ type: 'role', usuario: roleTarget, newValue: selectedRole }); setRoleTarget(null); } };
  const requestStatusChange = usuario => { if (usuario.uid !== user.uid) { setLifecycleReason(''); setLifecycleTarget(usuario); } };
  const openNewAccess = () => { setNewAccessPessoa(null); setNewAccessRole(ROLES.ATENDIMENTO); setNewAccessStep('person'); setNewAccessOpen(true); };
  const continueNewAccess = () => {
    const error = validateAccessAuthorization({ pessoa: newAccessPessoa, role: newAccessRole });
    if (error === 'MEMBRO_SEM_EMAIL_ACESSO') return toast.error('Este membro não possui e-mail cadastrado para acesso ao sistema.');
    if (error) return toast.error('Selecione um membro ativo.');
    if (newAccessPessoa && authorizations.some(item => item.id === newAccessPessoa.id && item.status === 'pendente')) return toast.error('Este membro já possui uma autorização de acesso pendente.');
    setNewAccessStep('role');
  };
  const saveNewAccess = async () => {
    setSaving(true);
    try {
      const authorization = await createAccessAuthorization({ pessoaBaseId: newAccessPessoa.id, role: newAccessRole, executadoPor: user.uid });
      setNewAccessOpen(false);
      try {
        await sendAccessActivationOnServer(authorization.pessoaBaseId);
        toast.success('Autorização criada e e-mail de ativação enviado.');
      } catch (emailError) {
        console.error(emailError);
        toast.error('A autorização foi criada, mas o e-mail de ativação não foi enviado. Use a opção de reenvio.');
      }
    } catch (error) {
      console.error(error);
      const messages = { PESSOA_JA_POSSUI_ACESSO: 'Este membro já possui acesso ao sistema.', AUTORIZACAO_PENDENTE_JA_EXISTE: 'Este membro já possui uma autorização de acesso pendente.', MEMBRO_SEM_EMAIL_ACESSO: 'Este membro não possui e-mail cadastrado para acesso ao sistema.' };
      toast.error(getFriendlyErrorMessage(error, { fallback: 'Não foi possível criar a autorização de acesso.', businessMessages: messages }));
    } finally { setSaving(false); }
  };
  const resendActivation = async authorization => {
    setSaving(true);
    try {
      await sendAccessActivationOnServer(authorization.pessoaBaseId);
      toast.success('E-mail de ativação reenviado.');
    } catch (error) { console.error(error); toast.error(getFriendlyErrorMessage(error, { fallback: 'Não foi possível reenviar o e-mail de ativação.' })); }
    finally { setSaving(false); }
  };
  const resetUserPassword = async usuario => {
    setSaving(true);
    try {
      await sendPasswordResetOnServer(usuario.email);
      toast.success('E-mail de redefinição de senha enviado.');
    } catch (error) { console.error(error); toast.error(getFriendlyErrorMessage(error, { fallback: 'Não foi possível solicitar a redefinição de senha.' })); }
    finally { setSaving(false); }
  };
  const cancelAuthorization = async authorization => {
    setSaving(true);
    try { await cancelAccessAuthorization({ pessoaBaseId: authorization.id, executadoPor: user.uid }); toast.success('Autorização cancelada.'); setConfirmation(null); }
    catch (error) { console.error(error); toast.error(getFriendlyErrorMessage(error, { fallback: 'Não foi possível cancelar a autorização.' })); }
    finally { setSaving(false); }
  };
  const applyChange = async () => {
    if (!confirmation || confirmation.usuario.uid === user.uid) return;
    setSaving(true);
    const { usuario, newValue } = confirmation;
    try {
      await updateUserAccessOnServer({ targetUid: usuario.uid, action: 'role', role: newValue });
      toast.success('Usuário atualizado com sucesso.'); setConfirmation(null);
    } catch (error) {
      console.error(error);
      toast.error(getFriendlyErrorMessage(error, { fallback: 'Não foi possível atualizar o perfil.', businessMessages: {
        ULTIMO_ADMINISTRADOR: 'Não é possível remover o último Administrador ativo.',
        ADMIN_OBRIGATORIO: 'Sua conta não possui permissão administrativa ativa.',
        AUTENTICACAO_OBRIGATORIA: 'Confirme seu e-mail e entre novamente para alterar perfis.',
        MEMBRO_INATIVO: 'Não é possível alterar o perfil enquanto o membro estiver inativo.'
      } }));
    } finally { setSaving(false); }
  };

  const applyLifecycle = async () => {
    if (!lifecycleTarget || lifecycleTarget.uid === user.uid) return;
    const nextActive = lifecycleTarget.ativo === false;
    if (!nextActive && !lifecycleReason.trim()) { toast.error('Informe o motivo da revogação.'); return; }
    setSaving(true);
    try {
      await updateUserAccessOnServer({ targetUid: lifecycleTarget.uid, action: 'active', active: nextActive, reason: lifecycleReason });
      toast.success(nextActive ? 'Acesso reativado.' : 'Acesso revogado.');
      setLifecycleTarget(null); setLifecycleReason('');
    } catch (error) {
      console.error(error);
      toast.error(getFriendlyErrorMessage(error, { fallback: 'Não foi possível alterar o acesso.', businessMessages: {
        ULTIMO_ADMINISTRADOR: 'Não é possível revogar o último Administrador ativo.',
        MEMBRO_INATIVO: 'Não é possível reativar o acesso enquanto o membro estiver inativo.'
      } }));
    } finally { setSaving(false); }
  };

  return <div className="space-y-6 animate-in fade-in duration-500 pb-10">
    <header className="px-1"><h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tighter uppercase italic">Usuários</h2><p className="text-gray-500 text-sm">Perfis de acesso vinculados aos membros da Casa</p></header>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Card className="!bg-indigo-600 text-white !border-none"><p className="text-2xl font-black">{activeCount}</p><p className="text-xs font-bold uppercase">Usuários ativos</p></Card><Card><p className="text-2xl font-black text-indigo-600">{pendingAuthorizations.length}</p><p className="text-xs font-bold uppercase text-gray-500">Autorizações pendentes</p></Card><Card><p className="text-2xl font-black text-amber-600">{pendingCount}</p><p className="text-xs font-bold uppercase text-gray-500">Pendentes legados</p></Card><button type="button" onClick={() => setFilter('inativos')} className={`rounded-2xl border p-4 text-left transition ${filter === 'inativos' ? 'border-rose-500 bg-rose-50' : 'border-gray-100 bg-white'}`}><span className="block text-2xl font-black text-rose-700">{inactiveCount}</span><span className="text-xs font-bold uppercase text-gray-500">Acessos revogados</span></button></div>
    <Button onClick={openNewAccess}><UsersRound size={18}/> Autorizar novo acesso</Button>
    {pendingAuthorizations.length > 0 && <section className="space-y-3"><h3 className="font-black text-gray-900">Autorizações pendentes</h3>{pendingAuthorizations.map(item => <Card key={item.id} className="!border-indigo-100"><p className="font-black">{pessoas[item.pessoaBaseId]?.nome || 'Membro'}</p><p className="text-sm text-gray-600">{item.email}</p><p className="text-xs text-gray-500 mt-1">{ROLE_LABELS[item.role]} · autorizado em {item.criadoEm?.toDate?.().toLocaleString('pt-BR') || 'data indisponível'} · por {usuarios.find(usuario => usuario.uid === item.criadoPor)?.nome || 'Administrador'}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Button variant="secondary" disabled={saving} onClick={() => resendActivation(item)}>Reenviar e-mail de ativação</Button><Button variant="danger" disabled={saving} onClick={() => setConfirmation({ type: 'cancel-authorization', authorization: item })}>Cancelar autorização</Button></div></Card>)}</section>}
    <div className="flex items-center bg-white px-4 rounded-2xl border border-gray-100 shadow-sm"><Search size={18} className="text-indigo-400 mr-3"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar nome, e-mail, membro ou UID..." className="w-full py-3 bg-transparent outline-none text-sm font-bold"/></div>
    <div className="flex gap-2 overflow-x-auto pb-1">{FILTERS.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap ${filter === value ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500'}`}>{label}</button>)}</div>
    <div className="grid grid-cols-1 gap-3">{filteredUsers.length ? filteredUsers.map(usuario => <UsuarioCard key={usuario.id} usuario={usuario} pessoa={pessoas[usuario.pessoaBaseId]} memberFunctions={effectiveMemberFunctions} currentUid={user.uid} busy={saving} onAuthorize={openAccess} onLink={openAccess} onEditRole={item => { setRoleTarget(item); setSelectedRole(item.role); }} onToggleStatus={requestStatusChange} onResetPassword={resetUserPassword} onHistory={setHistoryUser}/>) : <Card className="text-center text-gray-400"><ShieldCheck className="mx-auto mb-2"/><p>Nenhum usuário encontrado.</p></Card>}</div>
    <Modal isOpen={!!accessTarget} onClose={() => setAccessTarget(null)} title={accessTarget?.role === ROLES.PENDENTE ? 'Autorizar acesso' : 'Vincular membro'}>
      {accessStep === 'person' && <PessoaSearchSelector value={selectedPessoa} onChange={setSelectedPessoa} allowedVinculos={MEMBER_FILTER} onContinue={() => { if (!selectedPessoa?.email) toast.error('Este membro não possui e-mail cadastrado para acesso ao sistema.'); else if (normalizeEmail(selectedPessoa.email) !== normalizeEmail(accessTarget?.email)) toast.error('O e-mail desta conta não corresponde ao e-mail cadastrado para este membro.'); else setAccessStep(accessTarget?.role === ROLES.PENDENTE ? 'role' : 'confirm'); }}/>}
      {accessStep === 'role' && <div className="space-y-4"><p className="text-sm font-bold">Escolha o perfil de acesso ao sistema:</p><select value={accessRole} onChange={event => setAccessRole(event.target.value)} className="w-full bg-gray-50 px-4 py-3 rounded-xl font-bold">{OPERATIONAL_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setAccessStep('person')}>Voltar</Button><Button onClick={() => setAccessStep('confirm')}>Continuar</Button></div></div>}
      {accessStep === 'confirm' && <div className="space-y-4"><div className="bg-gray-50 p-4 rounded-xl text-sm space-y-2"><p><strong>Conta:</strong><br/>{accessTarget?.nome || 'Sem nome'} · {accessTarget?.email}</p><p><strong>Membro:</strong><br/>{selectedPessoa?.nome} · {selectedPessoa?.email}</p><p><strong>Funções na Casa:</strong><br/>{getMemberFunctionLabels(getPessoaFuncoesCasa(selectedPessoa), effectiveMemberFunctions).join(', ') || 'Sem função cadastrada'}</p>{accessTarget?.role === ROLES.PENDENTE && <p><strong>Perfil:</strong><br/>{ROLE_LABELS[accessRole]}</p>}</div><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setAccessStep(accessTarget?.role === ROLES.PENDENTE ? 'role' : 'person')}>Voltar</Button><Button onClick={confirmAccess} disabled={saving}>{saving ? 'Salvando...' : accessTarget?.role === ROLES.PENDENTE ? 'Autorizar acesso' : 'Vincular membro'}</Button></div></div>}
    </Modal>
    <Modal isOpen={newAccessOpen} onClose={() => setNewAccessOpen(false)} title="Autorizar novo acesso">
      {newAccessStep === 'person' && <PessoaSearchSelector value={newAccessPessoa} onChange={setNewAccessPessoa} allowedVinculos={MEMBER_FILTER} onContinue={continueNewAccess}/>}
      {newAccessStep === 'role' && <div className="space-y-4"><p className="text-sm font-bold">Escolha o perfil institucional:</p><select value={newAccessRole} onChange={event => setNewAccessRole(event.target.value)} className="w-full bg-gray-50 px-4 py-3 rounded-xl font-bold">{OPERATIONAL_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setNewAccessStep('person')}>Voltar</Button><Button onClick={() => setNewAccessStep('confirm')}>Continuar</Button></div></div>}
      {newAccessStep === 'confirm' && <div className="space-y-4"><div className="bg-gray-50 p-4 rounded-xl text-sm space-y-2"><p><strong>Membro:</strong><br/>{newAccessPessoa?.nome}</p><p><strong>CPF:</strong><br/>{maskCPF(newAccessPessoa?.cpf || '') || 'Não informado'}</p><p><strong>E-mail autorizado:</strong><br/>{normalizeEmail(newAccessPessoa?.email)}</p><p><strong>Funções na Casa:</strong><br/>{getMemberFunctionLabels(getPessoaFuncoesCasa(newAccessPessoa), effectiveMemberFunctions).join(', ') || 'Sem função cadastrada'}</p><p><strong>Perfil:</strong><br/>{ROLE_LABELS[newAccessRole]}</p></div><p className="text-xs font-bold text-amber-700 bg-amber-50 p-3 rounded-xl">O sistema enviará um link para este e-mail. O membro criará a própria senha antes de acessar.</p><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setNewAccessOpen(false)}>Cancelar</Button><Button onClick={saveNewAccess} disabled={saving}>{saving ? 'Salvando...' : 'Confirmar autorização'}</Button></div></div>}
    </Modal>
    <Modal isOpen={!!roleTarget} onClose={() => setRoleTarget(null)} title="Alterar perfil"><div className="space-y-5"><div><p className="font-bold text-gray-700">{roleTarget?.nome || roleTarget?.email}</p><p className="mt-1 text-xs text-gray-500">Perfil atual: {ROLE_LABELS[roleTarget?.role]}</p></div><select value={selectedRole} onChange={event => setSelectedRole(event.target.value)} className="w-full bg-gray-50 px-4 py-3 rounded-xl font-bold">{OPERATIONAL_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select><p className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-800"><strong>Novo acesso:</strong> {ROLE_IMPACT[selectedRole]}</p><Button onClick={requestRoleChange} disabled={selectedRole === roleTarget?.role || saving} className="w-full">Continuar</Button></div></Modal>
    <Modal isOpen={!!lifecycleTarget} onClose={() => { setLifecycleTarget(null); setLifecycleReason(''); }} title={lifecycleTarget?.ativo === false ? 'Reativar acesso' : 'Revogar acesso'} maxWidth="max-w-md"><div className="space-y-4"><div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600"><p><strong>Conta:</strong> {lifecycleTarget?.nome || lifecycleTarget?.email}</p><p className="mt-1"><strong>Perfil:</strong> {ROLE_LABELS[lifecycleTarget?.role] || lifecycleTarget?.role}</p><p className="mt-1"><strong>Vínculo:</strong> {pessoas[lifecycleTarget?.pessoaBaseId]?.nome || 'Conta legada sem Membro vinculado'}</p></div><p className={`rounded-xl p-3 text-xs font-bold ${lifecycleTarget?.ativo === false ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{lifecycleTarget?.ativo === false ? `O acesso será restabelecido com o perfil ${ROLE_LABELS[lifecycleTarget?.role] || lifecycleTarget?.role}.` : 'A pessoa perderá o acesso imediatamente. O vínculo e o histórico serão preservados.'}</p>{lifecycleTarget?.ativo !== false && <label className="block text-xs font-black uppercase text-gray-500">Motivo *<textarea value={lifecycleReason} onChange={event => setLifecycleReason(event.target.value)} maxLength={500} rows={4} className="mt-2 w-full rounded-xl bg-gray-50 p-3 text-sm normal-case font-medium outline-none focus:ring-2 focus:ring-indigo-300"/></label>}<div className="grid grid-cols-2 gap-3"><Button variant="secondary" onClick={() => { setLifecycleTarget(null); setLifecycleReason(''); }} disabled={saving}>Cancelar</Button><Button variant={lifecycleTarget?.ativo === false ? 'success' : 'danger'} onClick={applyLifecycle} disabled={saving}>{saving ? 'Salvando...' : lifecycleTarget?.ativo === false ? 'Reativar acesso' : 'Revogar acesso'}</Button></div></div></Modal>
    <LifecycleHistoryModal target={historyUser} field="alvoUid" actors={Object.fromEntries(usuarios.map(item => [item.uid, item.nome || item.email]))} onClose={() => setHistoryUser(null)} />
    <ConfirmDialog isOpen={!!confirmation} onClose={() => setConfirmation(null)} onConfirm={() => confirmation?.type === 'cancel-authorization' ? cancelAuthorization(confirmation.authorization) : applyChange()} title={confirmation?.type === 'role' ? 'Confirmar alteração de perfil' : confirmation?.type === 'cancel-authorization' ? 'Cancelar autorização' : 'Confirmar alteração de acesso'} message={confirmation?.type === 'role' ? `Alterar ${confirmation.usuario.nome || confirmation.usuario.email} de ${ROLE_LABELS[confirmation.usuario.role]} para ${ROLE_LABELS[confirmation.newValue]}? Novo acesso: ${ROLE_IMPACT[confirmation.newValue]}` : confirmation?.type === 'cancel-authorization' ? 'Cancelar esta autorização pendente?' : `${confirmation?.newValue ? 'Ativar' : 'Desativar'} o acesso de ${confirmation?.usuario.nome || confirmation?.usuario.email}?`} confirmText={saving ? 'Salvando...' : 'Confirmar'}/>
  </div>;
};
