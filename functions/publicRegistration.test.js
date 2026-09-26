import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSecureRegistrationPayload, hashPublicIdentity, isRateLimitExceeded } from './publicRegistration.js';

const base = { nome: 'Ana', cpf: '529.982.247-25', contato: '(96) 99999-9999', aceite: { avisoPrivacidade: true, declaracaoVeracidade: true } };
test('normaliza solicitação pública no servidor', () => { const value = buildSecureRegistrationPayload({ linkId: 'a'.repeat(64), link: { tipoCadastro: 'consulente' }, data: base }); assert.equal(value.cpf, '52998224725'); assert.equal(value.contato, '96999999999'); });
test('membro exige confirmação de e-mail', () => assert.throws(() => buildSecureRegistrationPayload({ linkId: 'a'.repeat(64), link: { tipoCadastro: 'membro' }, data: { ...base, email: 'ana@example.com', dadosCasa: { batizadoCaesf: false } } }), /EMAIL_NAO_CONFIRMADO/));
test('limite considera quantidade dentro da janela', () => { assert.equal(isRateLimitExceeded({ count: 5, windowStartedAt: 1000, now: 2000, windowMs: 5000, maximum: 5 }), true); assert.equal(isRateLimitExceeded({ count: 5, windowStartedAt: 1000, now: 7000, windowMs: 5000, maximum: 5 }), false); });
test('identidades sensíveis são resumidas', () => assert.equal(hashPublicIdentity('valor').length, 64));
