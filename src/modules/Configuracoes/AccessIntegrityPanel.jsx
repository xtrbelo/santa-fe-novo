import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { inspectAccessIntegrity } from '../../services/firebase';
import { updateUserAccessOnServer } from '../../services/firebaseFunctions';
import { ACCESS_INTEGRITY_LABELS } from '../../utils/accessIntegrity';
import { maskCPF, maskPhone } from '../../utils/formatters';
import { getFriendlyErrorMessage } from '../../utils/firebaseErrorMessages';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/useToast';

export const AccessIntegrityPanel = ({ onOpenPerson }) => {
  const [report, setReport] = useState(null);
  const [checking, setChecking] = useState(false);
  const [repairingUid, setRepairingUid] = useState(null);
  const toast = useToast();

  const loadReport = async ({ notify = true } = {}) => {
    const next = await inspectAccessIntegrity();
    setReport(next);
    if (notify) toast.success(next.issues.length || next.orphanIndexes.length || next.emailConflicts.length ? `${next.issues.length} acesso(s), ${next.orphanIndexes.length} índice(s) e ${next.emailConflicts.length} e-mail(s) duplicado(s) requerem atenção.` : 'Vínculos de acesso conferidos. Nenhuma inconsistência encontrada.');
    return next;
  };

  const check = async () => {
    setChecking(true);
    try { await loadReport(); }
    catch (error) { console.error(error); toast.error('Não foi possível verificar a integridade dos acessos.'); }
    finally { setChecking(false); }
  };

  const repair = async item => {
    if (!item.repairable || !item.suggestedPessoaId || !window.confirm(`Reparar o vínculo de ${item.nome} com ${item.suggestedPersonName || 'o Membro sugerido'}?\n\nO e-mail será validado novamente e a operação ficará registrada na auditoria.`)) return;
    setRepairingUid(item.uid);
    try {
      await updateUserAccessOnServer({ targetUid: item.uid, action: 'link', pessoaBaseId: item.suggestedPessoaId });
      await loadReport({ notify: false });
      toast.success('Vínculo reparado e auditado.');
    } catch (error) {
      console.error(error);
      toast.error(getFriendlyErrorMessage(error, { fallback: 'Não foi possível reparar o vínculo.', businessMessages: {
        PESSOA_NAO_E_MEMBRO_ATIVO: 'O cadastro sugerido não é mais um Membro ativo.',
        EMAIL_MEMBRO_DIVERGENTE: 'O e-mail do Usuário não corresponde ao cadastro do Membro.',
        EMAIL_MEMBRO_AMBIGUO: 'Este e-mail pertence a mais de um Membro ativo. Corrija os cadastros antes de vincular.',
        PESSOA_JA_POSSUI_ACESSO: 'O Membro sugerido já está vinculado a outro Usuário.',
        USUARIO_JA_VINCULADO: 'O Usuário já possui um vínculo válido.',
        INDICE_VINCULO_DIVERGENTE: 'O índice possui conflito e não foi alterado.'
      } }));
    } finally { setRepairingUid(null); }
  };

  return <div className="border-t border-gray-100 pt-4 space-y-3">
    <div className="flex items-start gap-2"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-indigo-600"/><p className="text-sm text-gray-600">Confere a ligação entre Usuários, Pessoas e índices de acesso. A verificação não altera dados.</p></div>
    <Button variant="secondary" onClick={check} disabled={checking || Boolean(repairingUid)} className="w-full">{checking ? 'Verificando acessos...' : 'Verificar integridade dos acessos'}</Button>
    {report && <div className="space-y-3 rounded-xl bg-gray-50 p-3 text-xs">
      <p><strong>{report.analyzed}</strong> usuário(s) analisado(s) · <strong>{report.correct}</strong> correto(s) · <strong>{report.issues.length}</strong> inconsistência(s) · <strong>{report.repairable}</strong> reparável(is) · <strong>{report.emailConflicts.length}</strong> e-mail(s) duplicado(s)</p>
      {report.orphanIndexes.length > 0 && <p className="font-bold text-amber-800">{report.orphanIndexes.length} índice(s) órfão(s) preservado(s) para análise; nada foi excluído automaticamente.</p>}
      {report.emailConflicts.map(conflict => <div key={conflict.email} className="rounded-lg border border-rose-100 bg-rose-50 p-3">
        <p className="font-black text-rose-900">E-mail repetido entre Membros ativos</p>
        <p className="mt-1 break-all font-bold text-rose-800">{conflict.email}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{conflict.people.map(person => <div key={person.id} className="rounded-lg border border-rose-100 bg-white p-3 text-gray-700">
          <p className="font-black text-gray-900">{person.nome}</p>
          <p className="mt-1">CPF: {person.cpf ? maskCPF(person.cpf) : 'Não informado'}</p>
          <p>Contato: {person.contato ? maskPhone(person.contato) : 'Não informado'}</p>
          <p>Conta vinculada: {person.linkedUid ? 'Sim' : 'Não'}</p>
          <Button variant="secondary" onClick={() => onOpenPerson?.(person.id)} className="mt-2 w-full">Abrir cadastro</Button>
        </div>)}</div>
        <p className="mt-3 text-rose-700">Compare os cadastros, corrija o e-mail incorreto ou inative o registro indevido. Depois, volte e execute uma nova verificação. Nenhum registro será excluído ou unido automaticamente.</p>
      </div>)}
      {report.issues.slice(0, 20).map(item => <div key={item.uid} className="rounded-lg border border-gray-100 bg-white p-3">
        <p className="font-black text-gray-900">{item.nome}</p>
        <p className="mt-0.5 break-all text-gray-500">{item.email || 'E-mail não informado'}</p>
        <p className="mt-2 font-bold text-amber-800">{ACCESS_INTEGRITY_LABELS[item.code] || item.code}</p>
        {item.repairable ? <Button variant="warning" onClick={() => repair(item)} disabled={Boolean(repairingUid)} className="mt-2 w-full">{repairingUid === item.uid ? 'Reparando...' : `Reparar com ${item.suggestedPersonName || 'Membro compatível'}`}</Button> : <p className="mt-2 text-gray-500">Requer análise manual; nenhuma alteração automática será feita.</p>}
      </div>)}
      {report.issues.length > 20 && <p>Mais {report.issues.length - 20} inconsistência(s) não exibida(s).</p>}
    </div>}
  </div>;
};
