import React, { useEffect, useMemo, useState } from 'react';
import { autorizarUsuario, getAppCollection, getAppDoc, onSnapshot, Timestamp, vincularUsuarioPessoa, writeBatch, doc } from '../../services/firebase';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import { getPessoaFuncoesCasa } from '../../utils/domain';
import { PessoaSearchSelector } from '../../components/pessoas/PessoaSearchSelector';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { UsuarioCard } from './UsuarioCard';
import { Search, ShieldCheck, UsersRound } from 'lucide-react';

const FILTERS = [['todos', 'Todos'], ['pendentes', 'Pendentes'], ['admin', 'Administradores'], ['gestor', 'Gestores / Dirigentes'], ['atendimento', 'Atendimento / Recepção'], ['inativos', 'Inativos'], ['sem-vinculo', 'Sem vínculo']];
const OPERATIONAL_ROLES = [ROLES.ADMIN, ROLES.GESTOR, ROLES.ATENDIMENTO];
const MEMBER_FILTER = ['membro'];
const ROLE_ORDER = { [ROLES.PENDENTE]: 0, [ROLES.ADMIN]: 1, [ROLES.GESTOR]: 2, [ROLES.ATENDIMENTO]: 3 };

export const UsuariosModule = ({ user, profile, initialFilter = 'todos' }) => {
  const [usuarios, setUsuarios] = useState([]);
  const [pessoas, setPessoas] = useState({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(initialFilter);
  const [roleTarget, setRoleTarget] = useState(null);
  const [selectedRole, setSelectedRole] = useState(ROLES.ATENDIMENTO);
  const [accessTarget, setAccessTarget] = useState(null);
  const [selectedPessoa, setSelectedPessoa] = useState(null);
  const [accessRole, setAccessRole] = useState(ROLES.ATENDIMENTO);
  const [accessStep, setAccessStep] = useState('person');
  const [confirmation, setConfirmation] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => setFilter(initialFilter), [initialFilter]);
  useEffect(() => {
    if (profile?.role !== ROLES.ADMIN) return undefined;
    const unsubUsers = onSnapshot(getAppCollection('usuarios'), snapshot => setUsuarios(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))));
    const unsubPeople = onSnapshot(getAppCollection('pessoas'), snapshot => setPessoas(Object.fromEntries(snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }]))));
    return () => { unsubUsers(); unsubPeople(); };
  }, [profile?.role]);

  const pendingCount = usuarios.filter(item => item.ativo !== false && item.role === ROLES.PENDENTE).length;
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return usuarios.filter(item => {
      const matchesSearch = !term || [item.nome, item.email, item.uid, pessoas[item.pessoaBaseId]?.nome].some(value => (value || '').toLowerCase().includes(term));
      const matchesFilter = filter === 'todos' || (filter === 'pendentes' && item.role === ROLES.PENDENTE && item.ativo !== false) || (filter === 'inativos' && item.ativo === false) || (filter === 'sem-vinculo' && item.role !== ROLES.PENDENTE && !item.pessoaBaseId) || (filter === item.role && item.ativo !== false);
      return matchesSearch && matchesFilter;
    }).sort((a, b) => {
      const groupA = a.ativo === false ? 4 : (ROLE_ORDER[a.role] ?? 4);
      const groupB = b.ativo === false ? 4 : (ROLE_ORDER[b.role] ?? 4);
      return groupA - groupB || (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    });
  }, [usuarios, pessoas, search, filter]);

  if (profile?.role !== ROLES.ADMIN) return <Card><p className="font-bold text-rose-600">Acesso restrito a administradores.</p></Card>;

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
      toast.error(error.message === 'PESSOA_JA_POSSUI_ACESSO' ? 'Este membro já possui uma conta vinculada ao sistema.' : error.message === 'PESSOA_NAO_E_MEMBRO_ATIVO' ? 'Selecione um membro ativo.' : 'Não foi possível concluir a autorização.');
    } finally { setSaving(false); }
  };
  const requestRoleChange = () => { if (roleTarget && roleTarget.uid !== user.uid && OPERATIONAL_ROLES.includes(selectedRole)) { setConfirmation({ type: 'role', usuario: roleTarget, newValue: selectedRole }); setRoleTarget(null); } };
  const requestStatusChange = usuario => { if (usuario.uid !== user.uid) setConfirmation({ type: 'status', usuario, newValue: usuario.ativo === false }); };
  const applyChange = async () => {
    if (!confirmation || confirmation.usuario.uid === user.uid) return;
    setSaving(true);
    const { type, usuario, newValue } = confirmation;
    try {
      const batch = writeBatch(getAppDoc('usuarios', usuario.uid).firestore); const now = Timestamp.now();
      batch.update(getAppDoc('usuarios', usuario.uid), { [type === 'role' ? 'role' : 'ativo']: newValue, atualizadoEm: now, atualizadoPor: user.uid });
      batch.set(doc(getAppCollection('auditoria')), { tipo: type === 'role' ? 'USUARIO_ROLE_ALTERADO' : 'USUARIO_STATUS_ALTERADO', alvoUid: usuario.uid, valorAnterior: type === 'role' ? usuario.role : usuario.ativo !== false, valorNovo: newValue, executadoPor: user.uid, criadoEm: now });
      await batch.commit(); toast.success('Usuário atualizado com sucesso.'); setConfirmation(null);
    } catch (error) { console.error(error); toast.error('Erro ao atualizar usuário.'); } finally { setSaving(false); }
  };

  return <div className="space-y-6 animate-in fade-in duration-500 pb-10">
    <header className="px-1"><h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tighter uppercase italic">Usuários</h2><p className="text-gray-500 text-sm">Perfis de acesso vinculados aos membros da Casa</p></header>
    <Card className="!bg-indigo-600 text-white !border-none flex items-center gap-4"><UsersRound size={30}/><div><p className="text-2xl font-black">{pendingCount}</p><p className="text-xs font-bold uppercase">usuários aguardando autorização</p></div></Card>
    <div className="flex items-center bg-white px-4 rounded-2xl border border-gray-100 shadow-sm"><Search size={18} className="text-indigo-400 mr-3"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar nome, e-mail, membro ou UID..." className="w-full py-3 bg-transparent outline-none text-sm font-bold"/></div>
    <div className="flex gap-2 overflow-x-auto pb-1">{FILTERS.map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap ${filter === value ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500'}`}>{label}</button>)}</div>
    <div className="grid grid-cols-1 gap-3">{filteredUsers.length ? filteredUsers.map(usuario => <UsuarioCard key={usuario.id} usuario={usuario} pessoa={pessoas[usuario.pessoaBaseId]} currentUid={user.uid} onAuthorize={openAccess} onLink={openAccess} onEditRole={item => { setRoleTarget(item); setSelectedRole(item.role); }} onToggleStatus={requestStatusChange}/>) : <Card className="text-center text-gray-400"><ShieldCheck className="mx-auto mb-2"/><p>Nenhum usuário encontrado.</p></Card>}</div>
    <Modal isOpen={!!accessTarget} onClose={() => setAccessTarget(null)} title={accessTarget?.role === ROLES.PENDENTE ? 'Autorizar acesso' : 'Vincular membro'}>
      {accessStep === 'person' && <PessoaSearchSelector value={selectedPessoa} onChange={setSelectedPessoa} allowedVinculos={MEMBER_FILTER} onContinue={() => setAccessStep(accessTarget?.role === ROLES.PENDENTE ? 'role' : 'confirm')}/>}
      {accessStep === 'role' && <div className="space-y-4"><p className="text-sm font-bold">Escolha o perfil de acesso ao sistema:</p><select value={accessRole} onChange={event => setAccessRole(event.target.value)} className="w-full bg-gray-50 px-4 py-3 rounded-xl font-bold">{OPERATIONAL_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setAccessStep('person')}>Voltar</Button><Button onClick={() => setAccessStep('confirm')}>Continuar</Button></div></div>}
      {accessStep === 'confirm' && <div className="space-y-4"><div className="bg-gray-50 p-4 rounded-xl text-sm space-y-2"><p><strong>Usuário Google:</strong><br/>{accessTarget?.email}</p><p><strong>Membro:</strong><br/>{selectedPessoa?.nome}</p><p><strong>Funções na Casa:</strong><br/>{getPessoaFuncoesCasa(selectedPessoa).join(', ') || 'Sem função cadastrada'}</p>{accessTarget?.role === ROLES.PENDENTE && <p><strong>Perfil:</strong><br/>{ROLE_LABELS[accessRole]}</p>}</div><div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setAccessStep(accessTarget?.role === ROLES.PENDENTE ? 'role' : 'person')}>Voltar</Button><Button onClick={confirmAccess} disabled={saving}>{saving ? 'Salvando...' : accessTarget?.role === ROLES.PENDENTE ? 'Autorizar acesso' : 'Vincular membro'}</Button></div></div>}
    </Modal>
    <Modal isOpen={!!roleTarget} onClose={() => setRoleTarget(null)} title="Alterar perfil"><div className="space-y-5"><p className="font-bold text-gray-700">{roleTarget?.nome || roleTarget?.email}</p><select value={selectedRole} onChange={event => setSelectedRole(event.target.value)} className="w-full bg-gray-50 px-4 py-3 rounded-xl font-bold">{OPERATIONAL_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select><Button onClick={requestRoleChange} disabled={selectedRole === roleTarget?.role} className="w-full">Continuar</Button></div></Modal>
    <ConfirmDialog isOpen={!!confirmation} onClose={() => setConfirmation(null)} onConfirm={applyChange} title={confirmation?.type === 'role' ? 'Confirmar alteração de perfil' : 'Confirmar alteração de acesso'} message={confirmation?.type === 'role' ? `Alterar ${confirmation.usuario.nome || confirmation.usuario.email} de ${ROLE_LABELS[confirmation.usuario.role]} para ${ROLE_LABELS[confirmation.newValue]}?` : `${confirmation?.newValue ? 'Ativar' : 'Desativar'} o acesso de ${confirmation?.usuario.nome || confirmation?.usuario.email}?`} confirmText={saving ? 'Salvando...' : 'Confirmar'}/>
  </div>;
};
