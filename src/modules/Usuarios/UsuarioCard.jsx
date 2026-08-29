import React from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import { getPessoaFuncoesCasa } from '../../utils/domain';
import { ShieldCheck, UserRoundCheck, UserRoundX } from 'lucide-react';

const formatTimestamp = timestamp => timestamp?.toDate?.().toLocaleString('pt-BR') || 'Não disponível';

export const UsuarioCard = ({ usuario, pessoa, currentUid, onAuthorize, onLink, onEditRole, onToggleStatus }) => {
  const isOwnAccount = usuario.uid === currentUid;
  const isPending = usuario.role === ROLES.PENDENTE;
  return (
    <Card className={`!border-none shadow-md ${usuario.ativo === false ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><ShieldCheck size={22} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2 items-center">
            <h3 className="font-black text-gray-900 truncate">{usuario.nome || 'Usuário sem nome'}</h3>
            {isOwnAccount && <span className="text-[9px] font-black uppercase bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Sua conta</span>}
            {usuario.ativo === false && <span className="text-[9px] font-black uppercase bg-rose-100 text-rose-700 px-2 py-1 rounded-full">Inativo</span>}
          </div>
          <p className="text-xs text-gray-500 truncate mt-1">{usuario.email || 'E-mail não informado'}</p>
          <p className="text-[10px] text-gray-400 break-all mt-1">UID: {usuario.uid}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 text-[10px] text-gray-500">
        <p><strong className="block uppercase text-gray-400">Criação</strong>{formatTimestamp(usuario.criadoEm)}</p>
        <p><strong className="block uppercase text-gray-400">Atualização</strong>{formatTimestamp(usuario.atualizadoEm)}</p>
      </div>
      {pessoa ? <div className="mt-4 bg-emerald-50 p-3 rounded-xl text-xs"><strong className="text-emerald-800">Membro vinculado: {pessoa.nome}</strong><p className="text-gray-600 mt-1">Funções: {getPessoaFuncoesCasa(pessoa).join(', ') || 'Sem função cadastrada'}</p></div> : !isPending && <div className="mt-4 bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs font-bold text-amber-800">⚠ Cadastro de membro ainda não vinculado</div>}
      <div className="flex flex-col sm:flex-row gap-2 border-t border-gray-100 mt-4 pt-4">
        {isPending ? <Button onClick={() => onAuthorize(usuario)} className="flex-1">Autorizar acesso</Button> : <>
        {!usuario.pessoaBaseId && <Button variant="secondary" onClick={() => onLink(usuario)} className="flex-1">Vincular membro</Button>}
        <Button variant="secondary" onClick={() => onEditRole(usuario)} disabled={isOwnAccount || !usuario.pessoaBaseId} className="flex-1">
          Perfil: {ROLE_LABELS[usuario.role] || usuario.role}
        </Button>
        </>}
        <Button variant={usuario.ativo === false ? 'success' : 'danger'} onClick={() => onToggleStatus(usuario)} disabled={isOwnAccount} className="flex-1">
          {usuario.ativo === false ? <><UserRoundCheck size={16} /> Ativar</> : <><UserRoundX size={16} /> Desativar</>}
        </Button>
      </div>
    </Card>
  );
};
