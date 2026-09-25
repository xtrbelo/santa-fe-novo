import React, { useEffect, useState } from 'react';
import { createPessoa, getAppCollection, getPessoaByCpf, onSnapshot } from '../../services/firebase';
import { calcularIdade, cleanDigits, maskCPF, maskPhone, validateCPF } from '../../utils/formatters';
import { buildPessoaPayload, createEmptyMemberDetails, getEffectiveMemberFunctions, validatePessoaPayload } from '../../utils/pessoaForm';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { MembroDadosComplementares } from './MembroDadosComplementares';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

export const PessoaFormModal = ({ isOpen, onClose, onSaved, user, initialName = '', allowedVinculos = ['consulente', 'membro'], createOperation = createPessoa, cpfRequired = false }) => {
  const defaultVinculo = allowedVinculos[0] || 'consulente';
  const [form, setForm] = useState({ nome: initialName, cpf: '', dataNascimento: '', contato: '', email: '', responsavelCpf: '', responsavelNome: '', responsavelContato: '', vinculo: defaultVinculo, funcoesCasa: [], ...createEmptyMemberDetails() });
  const [funcoes, setFuncoes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const confirmDiscard = useUnsavedChanges(isOpen && dirty && !saving);
  useEffect(() => {
    if (!isOpen) return undefined;
    setForm({ nome: initialName, cpf: '', dataNascimento: '', contato: '', email: '', responsavelCpf: '', responsavelNome: '', responsavelContato: '', vinculo: defaultVinculo, funcoesCasa: [], ...createEmptyMemberDetails() });
    setDirty(false);
    return onSnapshot(getAppCollection('config_funcoes_membro'), snapshot => setFuncoes(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))));
  }, [isOpen, initialName, defaultVinculo]);
  const update = (field, value) => { setDirty(true); setForm(current => ({ ...current, [field]: value })); };
  const close = () => { if (!saving && confirmDiscard()) onClose(); };
  const save = async event => {
    event.preventDefault();
    const rawCpf = cleanDigits(form.cpf);
    const minor = calcularIdade(form.dataNascimento) !== null && calcularIdade(form.dataNascimento) < 18;
    const data = buildPessoaPayload({ ...form, cpf: rawCpf || null, contato: minor ? null : cleanDigits(form.contato) || null, email: minor && form.vinculo !== 'membro' ? null : form.email, dataNascimento: form.dataNascimento || null, responsavelCpf: minor ? cleanDigits(form.responsavelCpf) || null : null, responsavelNome: minor ? form.responsavelNome.trim() || null : null, responsavelContato: minor ? cleanDigits(form.responsavelContato) || null : null });
    const validationError = validatePessoaPayload(data);
    if (validationError) { setError(validationError); return; }
    if (cpfRequired && !rawCpf) { setError('O CPF é obrigatório neste evento.'); return; }
    if (rawCpf && !validateCPF(rawCpf)) { setError('Informe um CPF válido.'); return; }
    setSaving(true); setError('');
    try { const pessoa = await createOperation({ data, userId: user.uid }); setDirty(false); onSaved(pessoa); onClose(); }
    catch (cause) {
      console.error(cause);
      if (cause.message === 'CPF_DUPLICADO' && rawCpf) {
        const existing = await getPessoaByCpf(rawCpf).catch(() => null);
        if (existing) { setDirty(false); onSaved(existing, { existing: true }); onClose(); return; }
      }
      setError(cause.message === 'CPF_DUPLICADO' ? 'Já existe uma pessoa cadastrada com este CPF.' : 'Não foi possível salvar a pessoa.');
    }
    finally { setSaving(false); }
  };
  const member = form.vinculo === 'membro';
  const minor = calcularIdade(form.dataNascimento) !== null && calcularIdade(form.dataNascimento) < 18;
  const functionOptions = getEffectiveMemberFunctions(funcoes);
  return <Modal isOpen={isOpen} onClose={close} title="Cadastrar nova pessoa"><form onSubmit={save} className="space-y-4">
    {allowedVinculos.length > 1 && <label className="block text-xs font-black text-gray-500 uppercase">Tipo *<select value={form.vinculo} onChange={event => { setDirty(true); setForm(current => ({ ...current, vinculo: event.target.value, funcoesCasa: event.target.value === 'membro' ? current.funcoesCasa : [] })); }} className="mt-1 w-full bg-gray-50 p-3 rounded-xl text-sm"><option value="consulente">Consulente</option><option value="membro">Membro</option></select></label>}
    <label className="block text-xs font-black text-gray-500 uppercase">Nome completo *<input value={form.nome} onChange={event => update('nome', event.target.value)} required className="mt-1 w-full bg-gray-50 p-3 rounded-xl text-sm"/></label>
    <label className="block text-xs font-black text-gray-500 uppercase">CPF {(member || cpfRequired) && '*'}<input value={form.cpf} onChange={event => update('cpf', maskCPF(event.target.value))} required={member || cpfRequired} maxLength={14} placeholder="000.000.000-00" className="mt-1 w-full bg-gray-50 p-3 rounded-xl text-sm"/>{cpfRequired && !member && <span className="mt-1 block text-[11px] font-medium normal-case text-amber-700">Obrigatório para participar desta programação.</span>}</label>
    <label className="block text-xs font-black text-gray-500 uppercase">Data de nascimento<input type="date" value={form.dataNascimento} onChange={event => update('dataNascimento', event.target.value)} className="mt-1 w-full bg-gray-50 p-3 rounded-xl text-sm"/></label>
    <label className="block text-xs font-black text-gray-500 uppercase">Telefone<input value={form.contato} onChange={event => update('contato', maskPhone(event.target.value))} maxLength={15} placeholder="(00) 00000-0000" className="mt-1 w-full bg-gray-50 p-3 rounded-xl text-sm"/></label>
    <label className="block text-xs font-black text-gray-500 uppercase">E-mail<input type="email" value={form.email} onChange={event => update('email', event.target.value)} autoComplete="email" className="mt-1 w-full bg-gray-50 p-3 rounded-xl text-sm"/>{member && <span className="block normal-case font-medium text-[11px] text-purple-700 mt-1">E-mail opcional no cadastro do membro. Será necessário caso seja liberado acesso ao sistema.</span>}</label>
    {minor && <fieldset className="bg-amber-50 p-4 rounded-2xl space-y-3 border border-amber-200"><legend className="text-xs font-black uppercase text-amber-800 px-1">Dados do responsável</legend><input value={form.responsavelNome} onChange={event => update('responsavelNome', event.target.value)} required placeholder="Nome completo do responsável" className="w-full bg-white p-3 rounded-xl text-sm"/><input value={form.responsavelCpf} onChange={event => update('responsavelCpf', maskCPF(event.target.value))} required maxLength={14} placeholder="CPF do responsável" className="w-full bg-white p-3 rounded-xl text-sm"/><input value={form.responsavelContato} onChange={event => update('responsavelContato', maskPhone(event.target.value))} required maxLength={15} placeholder="WhatsApp do responsável" className="w-full bg-white p-3 rounded-xl text-sm"/></fieldset>}
    {member && <MembroDadosComplementares value={form} onChange={update} functionOptions={functionOptions} />}
    {error && <p className="text-xs font-bold text-red-600">{error}</p>}<Button type="submit" busy={saving} busyText="Salvando..." className="w-full">Cadastrar e selecionar</Button>
  </form></Modal>;
};
