import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPessoaFromSelfRegistration, canReviewSelfRegistration, normalizeRejectionReason, validateSelfRegistrationApproval, validateSelfRegistrationRejection } from '../src/utils/memberSelfRegistrationReview.js';

const registration = { inviteId: 'a'.repeat(64), nome: ' Maria da Silva ', cpf: '52998224725', dataNascimento: '1990-01-20', contato: '96999999999', email: 'maria@example.test', sexo: 'feminino', estadoCivil: 'solteiro', endereco: { cidade: 'Macapá', uf: 'AP' }, statusCadastro: 'aguardando_validacao' };

test('constrói Pessoa/Membro canônica sem inferir dados institucionais', () => {
  const pessoa = buildPessoaFromSelfRegistration(registration);
  assert.equal(pessoa.nome, 'Maria da Silva'); assert.equal(pessoa.cpf, registration.cpf);
  assert.equal(pessoa.vinculo, 'membro'); assert.equal(pessoa.tipoPessoa, 'Membro');
  assert.deepEqual(pessoa.funcoesCasa, []); assert.equal(pessoa.origemCadastro, 'autocadastro'); assert.equal(pessoa.statusCadastro, 'aprovado');
  assert.deepEqual(pessoa.dadosCasa, { dataIngresso: null, batizadoCaesf: null, dataBatismoCaesf: null });
  for (const forbidden of ['role', 'usuarioId', 'dataIngresso', 'batizado']) assert.equal(Object.hasOwn(pessoa, forbidden), false);
  assert.equal(validateSelfRegistrationApproval(registration), null);
});

test('decisão é permitida somente enquanto aguarda validação', () => {
  assert.equal(canReviewSelfRegistration(registration), true);
  for (const statusCadastro of ['aprovado', 'rejeitado']) {
    const decided = { ...registration, statusCadastro };
    assert.equal(canReviewSelfRegistration(decided), false);
    assert.equal(validateSelfRegistrationApproval(decided), 'AUTOCADASTRO_JA_ANALISADO');
    assert.equal(validateSelfRegistrationRejection(decided, 'motivo'), 'AUTOCADASTRO_JA_ANALISADO');
  }
});

test('rejeição exige motivo normalizado', () => {
  assert.equal(normalizeRejectionReason('  Dados inconsistentes  '), 'Dados inconsistentes');
  assert.equal(validateSelfRegistrationRejection(registration, '   '), 'MOTIVO_REJEICAO_OBRIGATORIO');
  assert.equal(validateSelfRegistrationRejection(registration, 'Dados inconsistentes'), null);
});
