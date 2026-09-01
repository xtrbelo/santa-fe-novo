import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMyRegistrationUpdate } from '../src/utils/myRegistration.js';

const current = {
  nome: 'Pessoa Protegida', cpf: '12345678900', email: 'pessoa@example.test',
  contato: null, estadoCivil: 'nao_informado',
  endereco: { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null }
};

describe('Meu Cadastro', () => {
  test('normaliza somente contato, estado civil e endereço', () => {
    const result = buildMyRegistrationUpdate(current, {
      contato: '(11) 99999-9999', estadoCivil: 'casado',
      endereco: { cep: '01001-000', logradouro: ' Praça da Sé ', numero: '1', complemento: '', bairro: 'Sé', cidade: 'São Paulo', uf: 'sp' }
    });
    assert.deepEqual(result.data, {
      contato: '11999999999', estadoCivil: 'casado',
      endereco: { cep: '01001000', logradouro: 'Praça da Sé', numero: '1', complemento: null, bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' }
    });
    assert.deepEqual(result.fields, ['contato', 'estadoCivil', 'endereco.cep', 'endereco.logradouro', 'endereco.numero', 'endereco.bairro', 'endereco.cidade', 'endereco.uf']);
  });

  for (const campo of ['nome', 'cpf', 'email', 'vinculo', 'funcoesCasa', 'dadosCasa', 'ativo', 'pessoaBaseId']) {
    test(`rejeita o campo protegido ${campo}`, () => {
      assert.throws(() => buildMyRegistrationUpdate(current, { contato: null, estadoCivil: 'nao_informado', endereco: current.endereco, [campo]: 'fraude' }), /CAMPOS_INVALIDOS/);
    });
  }

  test('valida contato, estado civil, CEP e UF', () => {
    assert.throws(() => buildMyRegistrationUpdate(current, { contato: '119999999999', estadoCivil: 'casado', endereco: current.endereco }), /CONTATO_INVALIDO/);
    assert.throws(() => buildMyRegistrationUpdate(current, { contato: null, estadoCivil: 'inválido', endereco: current.endereco }), /ESTADO_CIVIL_INVALIDO/);
    assert.throws(() => buildMyRegistrationUpdate(current, { contato: null, estadoCivil: 'casado', endereco: { ...current.endereco, cep: '123' } }), /CEP_INVALIDO/);
    assert.throws(() => buildMyRegistrationUpdate(current, { contato: null, estadoCivil: 'casado', endereco: { ...current.endereco, uf: 'S' } }), /UF_INVALIDA/);
  });
});
