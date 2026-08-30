import React from 'react';
import { Edit, History, Trash2 } from 'lucide-react';
import { getPessoaFuncoesCasa, getPessoaVinculo } from '../../utils/domain';
import { maskCPF, maskPhone } from '../../utils/formatters';
import { getMemberFunctionLabels } from '../../utils/pessoaForm';
import { formatDateBr, formatDetailValue, getBatizadoCaesfLabel, getDetailLabel } from '../../utils/pessoaDetails';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

const Item = ({ label, value }) => <div><dt className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</dt><dd className="mt-1 text-sm font-bold text-gray-800">{formatDetailValue(value)}</dd></div>;
const Section = ({ title, children }) => <section className="rounded-2xl border border-gray-100 p-4"><h4 className="mb-4 text-xs font-black uppercase tracking-wider text-purple-700">{title}</h4><dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</dl></section>;

export function PessoaDetalhesModal({ pessoa, functionOptions = [], canEdit, canToggleActive, onClose, onEdit, onHistory, onToggleActive }) {
  if (!pessoa) return null;
  const membro = getPessoaVinculo(pessoa) === 'membro';
  const endereco = pessoa.endereco || {};
  const dadosCasa = pessoa.dadosCasa || {};
  const funcoes = getMemberFunctionLabels(getPessoaFuncoesCasa(pessoa), functionOptions).join(', ');
  return <Modal isOpen onClose={onClose} title="Detalhes da pessoa" maxWidth="max-w-3xl">
    <div className="space-y-4">
      <Section title="Dados pessoais">
        <Item label="Nome" value={pessoa.nome} /><Item label="Vínculo" value={membro ? 'Membro' : 'Consulente'} />
        <Item label="CPF" value={pessoa.cpf ? maskCPF(pessoa.cpf) : null} /><Item label="Data de nascimento" value={formatDateBr(pessoa.dataNascimento)} />
        <Item label="Celular / WhatsApp" value={pessoa.contato ? maskPhone(pessoa.contato) : null} /><Item label="E-mail" value={pessoa.email} />
        {membro && <><Item label="Sexo" value={getDetailLabel(pessoa.sexo)} /><Item label="Estado civil" value={getDetailLabel(pessoa.estadoCivil)} /></>}
      </Section>
      {(pessoa.responsavelNome || pessoa.responsavelCpf || pessoa.responsavelContato) && <Section title="Responsável"><Item label="Nome" value={pessoa.responsavelNome} /><Item label="CPF" value={pessoa.responsavelCpf ? maskCPF(pessoa.responsavelCpf) : null} /><Item label="Contato" value={pessoa.responsavelContato ? maskPhone(pessoa.responsavelContato) : null} /></Section>}
      {membro && <>
        <Section title="Endereço"><Item label="CEP" value={endereco.cep} /><Item label="Logradouro" value={endereco.logradouro} /><Item label="Número" value={endereco.numero} /><Item label="Complemento" value={endereco.complemento} /><Item label="Bairro" value={endereco.bairro} /><Item label="Cidade / UF" value={[endereco.cidade, endereco.uf].filter(Boolean).join(' / ')} /></Section>
        <Section title="Dados da Casa Santa Fé"><Item label="Data de ingresso" value={formatDateBr(dadosCasa.dataIngresso)} /><Item label="Batizado na CAESF" value={getBatizadoCaesfLabel(dadosCasa)} />{dadosCasa.batizadoCaesf !== false && <Item label="Data de batismo" value={formatDateBr(dadosCasa.dataBatismoCaesf)} />}<Item label="Funções na Casa" value={funcoes} /></Section>
        <Section title="Situação cadastral"><Item label="Situação" value={pessoa.ativo === false ? 'Inativo' : 'Ativo'} /><Item label="Status do cadastro" value={getDetailLabel(pessoa.statusCadastro || 'aprovado')} /><Item label="Origem do cadastro" value={getDetailLabel(pessoa.origemCadastro || 'administrativo')} /></Section>
      </>}
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
        <Button variant="secondary" onClick={onHistory} className="flex-1"><History size={15} /> Histórico</Button>
        {canEdit && <Button variant="secondary" onClick={onEdit} className="flex-1 text-purple-700"><Edit size={15} /> Editar</Button>}
        {canToggleActive && <Button variant={pessoa.ativo === false ? 'success' : 'danger'} onClick={onToggleActive} className="flex-1">{pessoa.ativo === false ? 'Reativar' : <><Trash2 size={15} /> Inativar</>}</Button>}
      </div>
    </div>
  </Modal>;
}
