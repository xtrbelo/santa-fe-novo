import React, { useState } from 'react';
import { createPessoa } from '../../services/firebase';
import { cleanDigits, maskCPF, maskPhone, validateCPF } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export const PessoaFormModal = ({ isOpen, onClose, onSaved, user, initialName = '' }) => {
  const [nome, setNome] = useState(initialName);
  const [cpf, setCpf] = useState('');
  const [contato, setContato] = useState('');
  const [vinculo, setVinculo] = useState('consulente');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async event => {
    event.preventDefault();
    const rawCpf = cleanDigits(cpf);
    if (!nome.trim()) { setError('O nome é obrigatório.'); return; }
    if (rawCpf && !validateCPF(rawCpf)) { setError('Informe um CPF válido.'); return; }
    setSaving(true); setError('');
    try {
      const pessoa = await createPessoa({ data: { nome: nome.trim(), cpf: rawCpf || null, contato: cleanDigits(contato) || null, vinculo, funcoesCasa: [], tipoPessoa: vinculo === 'membro' ? 'Membro' : 'Consulente' }, userId: user.uid });
      onSaved(pessoa);
      onClose();
    } catch (cause) {
      console.error(cause);
      setError(cause.message === 'CPF_DUPLICADO' ? 'Já existe uma pessoa cadastrada com este CPF.' : 'Não foi possível salvar a pessoa.');
    } finally { setSaving(false); }
  };
  return <Modal isOpen={isOpen} onClose={onClose} title="Cadastrar nova pessoa">
    <form onSubmit={save} className="space-y-4">
      <label className="block text-xs font-black text-gray-500 uppercase">Tipo<select value={vinculo} onChange={event => setVinculo(event.target.value)} className="mt-1 w-full bg-gray-50 p-3 rounded-xl text-sm"><option value="consulente">Consulente</option><option value="membro">Membro</option></select></label>
      <label className="block text-xs font-black text-gray-500 uppercase">Nome completo *<input value={nome} onChange={event => setNome(event.target.value)} required className="mt-1 w-full bg-gray-50 p-3 rounded-xl text-sm"/></label>
      <label className="block text-xs font-black text-gray-500 uppercase">CPF<input value={cpf} onChange={event => setCpf(maskCPF(event.target.value))} maxLength={14} placeholder="000.000.000-00" className="mt-1 w-full bg-gray-50 p-3 rounded-xl text-sm"/></label>
      <label className="block text-xs font-black text-gray-500 uppercase">Telefone<input value={contato} onChange={event => setContato(maskPhone(event.target.value))} maxLength={15} placeholder="(00) 00000-0000" className="mt-1 w-full bg-gray-50 p-3 rounded-xl text-sm"/></label>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      <Button type="submit" disabled={saving} className="w-full">{saving ? 'Salvando...' : 'Cadastrar e selecionar'}</Button>
    </form>
  </Modal>;
};
