import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConsulteeFromReusableRegistration, buildReusableRegistrationPayload, validateReusableRegistrationPayload } from '../src/utils/reusableRegistration.js';

const id = 'a'.repeat(64);
const acceptance = { avisoPrivacidade: true, declaracaoVeracidade: true };

test('Consulente usa cadastro mínimo com nome, contato e CPF', () => {
  const payload = buildReusableRegistrationPayload({ id, tipoCadastro: 'consulente' }, { nome: ' Maria ', contato: '(96) 99999-1111', cpf: '529.982.247-25', aceite: acceptance });
  assert.equal(payload.nome, 'Maria'); assert.equal(payload.contato, '96999991111'); assert.equal(payload.cpf, '52998224725');
  assert.equal(validateReusableRegistrationPayload(payload), null);
  assert.equal(validateReusableRegistrationPayload({ ...payload, contato: null }), 'CONTATO_OBRIGATORIO');
  assert.equal(validateReusableRegistrationPayload({ ...payload, cpf: null }), 'CPF_INVALIDO');
});

test('Membro exige CPF válido e dados completos da Casa', () => {
  const payload = buildReusableRegistrationPayload({ id, tipoCadastro: 'membro' }, { nome: 'João', cpf: '529.982.247-25', contato: '96999991111', email: 'joao@example.test', dadosCasa: { dataIngresso: '', batizadoCaesf: false, dataBatismoCaesf: '' }, aceite: acceptance, verificacaoEmailId: 'v'.repeat(20) });
  assert.equal(payload.cpf, '52998224725'); assert.equal(validateReusableRegistrationPayload(payload), null);
  assert.equal(validateReusableRegistrationPayload({ ...payload, contato: null }), 'CONTATO_OBRIGATORIO');
  assert.equal(validateReusableRegistrationPayload({ ...payload, email: null }), 'EMAIL_OBRIGATORIO');
  assert.equal(validateReusableRegistrationPayload({ ...payload, cpf: '11111111111' }), 'CPF_INVALIDO');
  assert.equal(validateReusableRegistrationPayload({ ...payload, verificacaoEmailId: null }), 'EMAIL_NAO_CONFIRMADO');
  assert.equal(validateReusableRegistrationPayload({ ...payload, aceite: { ...payload.aceite, avisoPrivacidade: false } }), 'AVISO_PRIVACIDADE_OBRIGATORIO');
});

test('nenhum dos formulários concede acesso ou cria Pessoa diretamente', () => {
  const payload = buildReusableRegistrationPayload({ id, tipoCadastro: 'consulente' }, { nome: 'Maria', contato: '96999991111', cpf: '52998224725', aceite: acceptance });
  assert.equal(payload.statusCadastro, 'aguardando_validacao');
  assert.equal(payload.origemCadastro, 'link_reutilizavel');
  assert.equal(Object.hasOwn(payload, 'role'), false);
  assert.equal(Object.hasOwn(payload, 'ativo'), false);
});

test('aprovação preserva a origem e o estado exigidos pelas regras', () => {
  const pessoa = buildConsulteeFromReusableRegistration({ nome: 'Maria', cpf: '52998224725', contato: '96999991111' });
  assert.equal(pessoa.vinculo, 'consulente');
  assert.equal(pessoa.statusCadastro, 'aprovado');
  assert.equal(pessoa.origemCadastro, 'link_reutilizavel');
});
