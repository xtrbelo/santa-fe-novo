import { ESTADOS_CIVIS, normalizeEndereco, normalizeEstadoCivil } from './pessoaForm.js';

export const MY_REGISTRATION_FIELDS = Object.freeze(['contato', 'estadoCivil', 'endereco']);

const normalizeContact = value => String(value ?? '').replace(/\D/g, '') || null;

export const buildMyRegistrationUpdate = (current, input) => {
  const unknown = Object.keys(input || {}).filter(key => !MY_REGISTRATION_FIELDS.includes(key));
  if (unknown.length) throw new Error('MEU_CADASTRO_CAMPOS_INVALIDOS');
  const contato = normalizeContact(input?.contato);
  const estadoCivil = normalizeEstadoCivil(input?.estadoCivil);
  const endereco = normalizeEndereco(input?.endereco);
  if (contato && contato.length > 11) throw new Error('MEU_CADASTRO_CONTATO_INVALIDO');
  if (!ESTADOS_CIVIS.includes(input?.estadoCivil)) throw new Error('MEU_CADASTRO_ESTADO_CIVIL_INVALIDO');
  if (endereco.cep && endereco.cep.length !== 8) throw new Error('MEU_CADASTRO_CEP_INVALIDO');
  if (endereco.uf && !/^[A-Z]{2}$/.test(endereco.uf)) throw new Error('MEU_CADASTRO_UF_INVALIDA');

  const fields = [];
  if ((current?.contato || null) !== contato) fields.push('contato');
  if ((current?.estadoCivil || 'nao_informado') !== estadoCivil) fields.push('estadoCivil');
  for (const key of Object.keys(endereco)) {
    if ((current?.endereco?.[key] || null) !== endereco[key]) fields.push(`endereco.${key}`);
  }
  return { data: { contato, estadoCivil, endereco }, fields };
};
