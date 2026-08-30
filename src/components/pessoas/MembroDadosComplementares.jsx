import React from 'react';

const inputClass = 'mt-1 w-full rounded-xl bg-gray-50 p-3 text-sm outline-none focus:ring-2 focus:ring-purple-300';
const labels = { masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro', nao_informado: 'Não informado', solteiro: 'Solteiro(a)', casado: 'Casado(a)', uniao_estavel: 'União estável', separado: 'Separado(a)', divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)' };

export function MembroDadosComplementares({ value, onChange, functionOptions = [] }) {
  const endereco = value.endereco || {};
  const dadosCasa = value.dadosCasa || {};
  const updateAddress = (field, fieldValue) => onChange('endereco', { ...endereco, [field]: fieldValue });
  const updateHouse = (field, fieldValue) => onChange('dadosCasa', { ...dadosCasa, [field]: fieldValue });
  const updateBaptism = value => onChange('dadosCasa', {
    ...dadosCasa,
    batizadoCaesf: value === '' ? null : value === 'sim',
    dataBatismoCaesf: value === 'nao' ? null : dadosCasa.dataBatismoCaesf,
  });
  const toggleFunction = id => onChange('funcoesCasa', (value.funcoesCasa || []).includes(id) ? value.funcoesCasa.filter(item => item !== id) : [...(value.funcoesCasa || []), id]);
  return <div className="space-y-5">
    <fieldset className="rounded-2xl border border-purple-100 p-4"><legend className="px-2 text-xs font-black uppercase text-purple-700">Dados pessoais</legend><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="text-xs font-black uppercase text-gray-500">Sexo<select value={value.sexo || 'nao_informado'} onChange={event => onChange('sexo', event.target.value)} className={inputClass}>{['nao_informado', 'feminino', 'masculino', 'outro'].map(option => <option key={option} value={option}>{labels[option]}</option>)}</select></label>
      <label className="text-xs font-black uppercase text-gray-500">Estado civil<select value={value.estadoCivil || 'nao_informado'} onChange={event => onChange('estadoCivil', event.target.value)} className={inputClass}>{['nao_informado', 'solteiro', 'casado', 'uniao_estavel', 'separado', 'divorciado', 'viuvo', 'outro'].map(option => <option key={option} value={option}>{labels[option]}</option>)}</select></label>
    </div></fieldset>
    <fieldset className="rounded-2xl border border-gray-200 p-4"><legend className="px-2 text-xs font-black uppercase text-gray-600">Endereço</legend><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="text-xs font-black uppercase text-gray-500">CEP<input value={endereco.cep || ''} onChange={event => updateAddress('cep', event.target.value)} inputMode="numeric" maxLength={10} className={inputClass} /></label>
      <label className="text-xs font-black uppercase text-gray-500">Logradouro<input value={endereco.logradouro || ''} onChange={event => updateAddress('logradouro', event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-black uppercase text-gray-500">Número<input value={endereco.numero || ''} onChange={event => updateAddress('numero', event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-black uppercase text-gray-500">Complemento<input value={endereco.complemento || ''} onChange={event => updateAddress('complemento', event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-black uppercase text-gray-500">Bairro<input value={endereco.bairro || ''} onChange={event => updateAddress('bairro', event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-black uppercase text-gray-500">Cidade<input value={endereco.cidade || ''} onChange={event => updateAddress('cidade', event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-black uppercase text-gray-500">Estado/UF<input value={endereco.uf || ''} onChange={event => updateAddress('uf', event.target.value.toUpperCase())} maxLength={2} className={inputClass} /></label>
    </div></fieldset>
    <fieldset className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4"><legend className="px-2 text-xs font-black uppercase text-purple-700">Dados da Casa Santa Fé</legend><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="text-xs font-black uppercase text-gray-500">Data de ingresso na Casa<input type="date" value={dadosCasa.dataIngresso || ''} onChange={event => updateHouse('dataIngresso', event.target.value)} className={inputClass} /></label>
      <label className="text-xs font-black uppercase text-gray-500">Batizado na CAESF? *<select required value={dadosCasa.batizadoCaesf === true ? 'sim' : dadosCasa.batizadoCaesf === false ? 'nao' : ''} onChange={event => updateBaptism(event.target.value)} className={inputClass}><option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option></select></label>
      {dadosCasa.batizadoCaesf === true && <label className="text-xs font-black uppercase text-gray-500">Data de Batismo na CAESF<input type="date" value={dadosCasa.dataBatismoCaesf || ''} onChange={event => updateHouse('dataBatismoCaesf', event.target.value)} className={inputClass} /></label>}
    </div><div className="mt-4"><p className="mb-2 text-xs font-black uppercase text-purple-700">Funções na Casa</p><div className="flex flex-wrap gap-3">{functionOptions.map(item => <label key={item.id} className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={(value.funcoesCasa || []).includes(item.id)} onChange={() => toggleFunction(item.id)} />{item.nome}</label>)}</div></div></fieldset>
  </div>;
}
