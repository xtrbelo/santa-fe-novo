import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemberSelfRegistrationPayload, maskSelfRegistrationCep, maskSelfRegistrationPhone, validateMemberSelfRegistrationPayload, validateSelfRegistrationHouseData } from '../src/utils/memberSelfRegistration.js';

test('máscara CEP aceita somente oito dígitos e é progressiva', () => {
  assert.equal(maskSelfRegistrationCep('6890'), '6890');
  assert.equal(maskSelfRegistrationCep('68.900-abc000'), '68900-000');
  assert.equal(maskSelfRegistrationCep('68900000123'), '68900-000');
});

test('máscara telefone formata números brasileiros de dez e onze dígitos', () => {
  assert.equal(maskSelfRegistrationPhone('96912'), '(96) 912');
  assert.equal(maskSelfRegistrationPhone('9691234567'), '(96) 9123-4567');
  assert.equal(maskSelfRegistrationPhone('96991234567'), '(96) 99123-4567');
  assert.equal(maskSelfRegistrationPhone('(96) 99123-456789'), '(96) 99123-4567');
});

test('normaliza autocadastro sem campos institucionais ou de acesso', () => {
  const invite = { id: 'a'.repeat(64), nome: 'Nome do Convite', cpf: '52998224725' };
  const payload = buildMemberSelfRegistrationPayload(invite, { email: ' PESSOA@EXAMPLE.TEST ', contato: ' 96999999999 ', sexo: 'feminino', estadoCivil: 'solteiro', endereco: { cep: '68.900-000', cidade: ' Macapá ', uf: 'ap' }, dadosCasa: { dataIngresso: '2020-01-01', batizadoCaesf: false, dataBatismoCaesf: '2021-01-01' }, role: 'admin', funcoesCasa: ['medium'] });
  assert.equal(payload.email, 'pessoa@example.test'); assert.equal(payload.contato, '96999999999'); assert.equal(payload.endereco.cep, '68900000'); assert.equal(payload.endereco.uf, 'AP');
  assert.equal(payload.nome, invite.nome); assert.equal(payload.cpf, invite.cpf); assert.equal(payload.statusCadastro, 'aguardando_validacao'); assert.equal(payload.origemCadastro, 'autocadastro');
  assert.deepEqual(payload.dadosCasa, { dataIngresso: '2020-01-01', batizadoCaesf: false, dataBatismoCaesf: null });
  for (const forbidden of ['role', 'funcoesCasa', 'pessoaId', 'usuarioId', 'token', 'permissoes']) assert.equal(Object.hasOwn(payload, forbidden), false);
  assert.equal(validateMemberSelfRegistrationPayload(payload), null);
});

test('valida email, data, CEP e UF opcionais quando preenchidos', () => {
  const base = buildMemberSelfRegistrationPayload({ id: 'a'.repeat(64), nome: 'Nome', cpf: '52998224725' }, { dadosCasa: { dataIngresso: '2020-01-01', batizadoCaesf: false } });
  assert.equal(validateMemberSelfRegistrationPayload({ ...base, contato: 'telefone inválido' }), 'AUTOCADASTRO_CONTATO_INVALIDO');
  assert.equal(validateMemberSelfRegistrationPayload({ ...base, email: 'invalido' }), 'AUTOCADASTRO_EMAIL_INVALIDO');
  assert.equal(validateMemberSelfRegistrationPayload({ ...base, dataNascimento: '30/08/2000' }), 'AUTOCADASTRO_DATA_INVALIDA');
  assert.equal(validateMemberSelfRegistrationPayload({ ...base, endereco: { ...base.endereco, cep: '123' } }), 'AUTOCADASTRO_CEP_INVALIDO');
  assert.equal(validateMemberSelfRegistrationPayload({ ...base, endereco: { ...base.endereco, uf: 'A' } }), 'AUTOCADASTRO_UF_INVALIDA');
});

test('valida e normaliza os dados da Casa', () => {
  assert.equal(validateSelfRegistrationHouseData({ dataIngresso: '', batizadoCaesf: false }, '2026-09-01'), null);
  assert.equal(buildMemberSelfRegistrationPayload({ id: 'b'.repeat(64), nome: 'Nome', cpf: '52998224725' }, { dadosCasa: { dataIngresso: '', batizadoCaesf: false } }).dadosCasa.dataIngresso, null);
  assert.equal(validateSelfRegistrationHouseData({ dataIngresso: '', batizadoCaesf: true, dataBatismoCaesf: '2020-02-01' }, '2026-09-01'), null);
  assert.equal(validateSelfRegistrationHouseData({ dataIngresso: '2020-01-01', batizadoCaesf: true, dataBatismoCaesf: '2020-02-01' }, '2026-09-01'), null);
  assert.equal(validateSelfRegistrationHouseData({ dataIngresso: '2020-01-01', batizadoCaesf: true }, '2026-09-01'), 'AUTOCADASTRO_DATA_BATISMO_OBRIGATORIA');
  assert.equal(validateSelfRegistrationHouseData({ dataIngresso: '2020-01-01', batizadoCaesf: false, dataBatismoCaesf: '2020-02-01' }, '2026-09-01'), null);
  assert.equal(validateSelfRegistrationHouseData({ dataIngresso: '2026-09-02', batizadoCaesf: false }, '2026-09-01'), 'AUTOCADASTRO_DATA_INGRESSO_FUTURA');
  assert.equal(validateSelfRegistrationHouseData({ dataIngresso: '2020-01-01', batizadoCaesf: true, dataBatismoCaesf: '2026-09-02' }, '2026-09-01'), 'AUTOCADASTRO_DATA_BATISMO_FUTURA');
  assert.equal(validateSelfRegistrationHouseData({ dataIngresso: '2020-02-01', batizadoCaesf: true, dataBatismoCaesf: '2020-01-01' }, '2026-09-01'), 'AUTOCADASTRO_BATISMO_ANTERIOR_INGRESSO');
});
