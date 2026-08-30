import { getBatizadoCaesf } from './pessoaForm.js';

export const NAO_INFORMADO = 'Não informado';

const LABELS = {
  masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro', nao_informado: NAO_INFORMADO,
  solteiro: 'Solteiro(a)', casado: 'Casado(a)', uniao_estavel: 'União estável', separado: 'Separado(a)',
  divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)', convite_enviado: 'Convite enviado', preenchendo: 'Preenchendo',
  aguardando_validacao: 'Aguardando validação', correcao_solicitada: 'Correção solicitada', aprovado: 'Aprovado',
  rejeitado: 'Rejeitado', administrativo: 'Administrativo', autocadastro: 'Autocadastro',
};

export const formatDetailValue = value => String(value ?? '').trim() || NAO_INFORMADO;
export const formatDateBr = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : NAO_INFORMADO;
};
export const getDetailLabel = value => LABELS[value] || formatDetailValue(value);
export const getBatizadoCaesfLabel = dadosCasa => {
  const value = getBatizadoCaesf(dadosCasa);
  return value === null ? NAO_INFORMADO : value ? 'Sim' : 'Não';
};
