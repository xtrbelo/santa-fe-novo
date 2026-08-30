import React, { useState } from 'react';
import { RefreshCw, ShieldX } from 'lucide-react';
import { reissueMemberInvite, revokeMemberInvite } from '../../services/firebase';
import { formatDateBr } from '../../utils/pessoaDetails';
import { getMemberInviteEffectiveStatus } from '../../utils/memberInvite';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { InviteCreatedContent } from './ConvidarMembroModal';

const timestampText = value => value?.toDate ? `${formatDateBr(value.toDate().toISOString().slice(0, 10))} ${value.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Não informado';

export function GerenciarConviteModal({ invite, userId, userNames = {}, onClose, toast }) {
  const [newResult, setNewResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  if (!invite) return null;
  const copy = async () => { try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(newResult.url); toast.success('Link copiado.'); } catch { toast.error('Selecione o link e copie manualmente.'); } };
  const revoke = async () => { setSubmitting(true); try { await revokeMemberInvite({ inviteId: invite.id, userId }); toast.success('Convite revogado.'); onClose(); } catch { toast.error('Não foi possível revogar o convite.'); } finally { setSubmitting(false); } };
  const reissue = async () => { setSubmitting(true); try { setNewResult(await reissueMemberInvite({ inviteId: invite.id, userId, origin: window.location.origin })); } catch (error) { toast.error(error.message === 'CPF_DUPLICADO' ? 'Já existe uma pessoa cadastrada com este CPF.' : error.message === 'AUTOCADASTRO_PENDENTE' ? 'Este autocadastro já foi enviado e aguarda análise.' : 'Não foi possível gerar um novo convite.'); } finally { setSubmitting(false); } };
  return <Modal isOpen onClose={onClose} title="Gerenciar convite" maxWidth="max-w-xl">{newResult ? <InviteCreatedContent result={newResult} onCopy={copy} /> : <div className="space-y-5">
    <dl className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-100 p-4 sm:grid-cols-2"><div><dt className="text-xs font-black uppercase text-gray-400">Situação efetiva</dt><dd className="mt-1 font-black capitalize text-purple-700">{getMemberInviteEffectiveStatus(invite)}</dd></div><div><dt className="text-xs font-black uppercase text-gray-400">Criado em</dt><dd className="mt-1 font-bold">{timestampText(invite.criadoEm)}</dd></div>{userNames[invite.criadoPor] && <div><dt className="text-xs font-black uppercase text-gray-400">Criado por</dt><dd className="mt-1 font-bold">{userNames[invite.criadoPor]}</dd></div>}<div><dt className="text-xs font-black uppercase text-gray-400">Expira em</dt><dd className="mt-1 font-bold">{timestampText(invite.expiraEm)}</dd></div>{invite.respondidoEm && <div><dt className="text-xs font-black uppercase text-gray-400">Cadastro enviado em</dt><dd className="mt-1 font-bold text-emerald-600">{timestampText(invite.respondidoEm)}</dd></div>}{invite.revogadoEm && <div><dt className="text-xs font-black uppercase text-gray-400">Revogado em</dt><dd className="mt-1 font-bold">{timestampText(invite.revogadoEm)}</dd></div>}{userNames[invite.revogadoPor] && <div><dt className="text-xs font-black uppercase text-gray-400">Revogado por</dt><dd className="mt-1 font-bold">{userNames[invite.revogadoPor]}</dd></div>}</dl><p className="text-xs font-bold text-gray-500">O token anterior não é armazenado e não pode ser exibido.</p>{invite.status !== 'respondido' && <div className="grid gap-2 sm:grid-cols-2">{invite.status === 'ativo' && <Button variant="danger" disabled={submitting} onClick={revoke}><ShieldX size={16} /> Revogar convite</Button>}<Button variant="purple" disabled={submitting} onClick={reissue}><RefreshCw size={16} /> Reenviar convite</Button></div>}
  </div>}</Modal>;
}
