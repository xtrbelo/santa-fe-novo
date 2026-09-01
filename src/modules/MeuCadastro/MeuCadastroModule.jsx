import React, { useCallback, useEffect, useState } from 'react';
import { getAppCollection, getMyRegistration, getDocs, updateMyRegistration } from '../../services/firebase';
import { ROLE_LABELS } from '../../constants/roles';
import { getPessoaFuncoesCasa, getPessoaVinculo } from '../../utils/domain';
import { ESTADOS_CIVIS, getEffectiveMemberFunctions, getMemberFunctionLabels } from '../../utils/pessoaForm';
import { formatDateBr, formatDetailValue, getDetailLabel } from '../../utils/pessoaDetails';
import { maskCPF, maskPhone } from '../../utils/formatters';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/useToast';
import { Edit, UserRound } from 'lucide-react';

const inputClass = 'mt-1 w-full rounded-xl bg-gray-50 p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300';
const Item = ({ label, value }) => <div><dt className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</dt><dd className="mt-1 text-sm font-bold text-gray-800">{formatDetailValue(value)}</dd></div>;
const Section = ({ title, children }) => <Card><h3 className="mb-4 text-xs font-black uppercase tracking-wider text-indigo-700">{title}</h3><dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</dl></Card>;
const emptyAddress = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };
const toForm = pessoa => ({ contato: maskPhone(pessoa?.contato || ''), estadoCivil: pessoa?.estadoCivil || 'nao_informado', endereco: Object.fromEntries(Object.keys(emptyAddress).map(key => [key, pessoa?.endereco?.[key] || ''])) });

export function MeuCadastroModule({ user, profile }) {
  const [pessoa, setPessoa] = useState(null);
  const [functions, setFunctions] = useState([]);
  const [form, setForm] = useState(toForm());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [registration, configuredFunctions] = await Promise.all([
        getMyRegistration({ uid: user.uid }),
        getDocs(getAppCollection('config_funcoes_membro')).then(snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      ]);
      setPessoa(registration); setFunctions(getEffectiveMemberFunctions(configuredFunctions)); setForm(toForm(registration));
    } catch (error) { console.error(error); toast.error('Não foi possível carregar seu cadastro.'); }
    finally { setLoading(false); }
  }, [user.uid, toast]);

  useEffect(() => { void load(); }, [load]);
  const updateAddress = (field, value) => setForm(current => ({ ...current, endereco: { ...current.endereco, [field]: value } }));
  const cancel = () => { setForm(toForm(pessoa)); setEditing(false); };
  const save = async event => {
    event.preventDefault(); setSaving(true);
    try {
      await updateMyRegistration({ uid: user.uid, data: form });
      await load(); setEditing(false); toast.success('Cadastro atualizado com sucesso.');
    } catch (error) {
      console.error(error);
      const messages = { MEU_CADASTRO_CONTATO_INVALIDO: 'Informe um contato válido.', MEU_CADASTRO_CEP_INVALIDO: 'Informe um CEP com 8 dígitos.', MEU_CADASTRO_UF_INVALIDA: 'Informe uma UF com 2 letras.' };
      toast.error(messages[error.message] || 'Não foi possível salvar seu cadastro.');
    } finally { setSaving(false); }
  };

  if (loading) return <Card><p className="text-sm font-bold text-gray-500">Carregando seu cadastro...</p></Card>;
  if (!profile?.pessoaBaseId || !pessoa) return <Card className="text-center py-10"><UserRound className="mx-auto mb-3 text-amber-500" size={36}/><p className="font-bold text-gray-700">Seu usuário ainda não está vinculado a um cadastro de membro.<br/>Procure um administrador.</p></Card>;
  const endereco = pessoa.endereco || {};
  const functionLabels = getMemberFunctionLabels(getPessoaFuncoesCasa(pessoa), functions).join(', ');

  return <div className="space-y-5 animate-in fade-in duration-500 pb-10"><header className="flex items-end justify-between gap-3 px-1"><div><h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tighter uppercase italic">Meu Cadastro</h2><p className="text-sm text-gray-500">Seus dados pessoais e vínculo institucional</p></div>{!editing && <Button onClick={() => setEditing(true)}><Edit size={16}/> Editar meus dados</Button>}</header>
    {!editing ? <>
      <Section title="Identificação"><Item label="Nome" value={pessoa.nome}/><Item label="CPF" value={pessoa.cpf ? maskCPF(pessoa.cpf) : null}/><Item label="Data de nascimento" value={formatDateBr(pessoa.dataNascimento)}/><Item label="Sexo" value={getDetailLabel(pessoa.sexo)}/><Item label="Estado civil" value={getDetailLabel(pessoa.estadoCivil)}/></Section>
      <Section title="Contato"><Item label="E-mail" value={pessoa.email}/><Item label="Telefone / contato" value={pessoa.contato ? maskPhone(pessoa.contato) : null}/></Section>
      <Section title="Endereço"><Item label="CEP" value={endereco.cep}/><Item label="Logradouro" value={endereco.logradouro}/><Item label="Número" value={endereco.numero}/><Item label="Complemento" value={endereco.complemento}/><Item label="Bairro" value={endereco.bairro}/><Item label="Cidade" value={endereco.cidade}/><Item label="UF" value={endereco.uf}/></Section>
      <Section title="Vínculo com a Casa"><Item label="Vínculo" value={getPessoaVinculo(pessoa) === 'membro' ? 'Membro' : pessoa.tipoPessoa || 'Consulente'}/><Item label="Funções da Casa" value={functionLabels}/></Section>
      <Section title="Acesso ao sistema"><Item label="Perfil" value={ROLE_LABELS[profile.role] || profile.role}/><Item label="Situação" value={profile.ativo === false ? 'Inativo' : 'Ativo'}/></Section>
    </> : <form onSubmit={save} className="space-y-5"><Card className="space-y-4"><h3 className="text-xs font-black uppercase text-indigo-700">Dados editáveis</h3><label className="block text-xs font-black uppercase text-gray-500">Telefone / contato<input value={form.contato} onChange={event => setForm(current => ({ ...current, contato: maskPhone(event.target.value) }))} maxLength={15} className={inputClass}/></label><label className="block text-xs font-black uppercase text-gray-500">Estado civil<select value={form.estadoCivil} onChange={event => setForm(current => ({ ...current, estadoCivil: event.target.value }))} className={inputClass}>{ESTADOS_CIVIS.map(value => <option key={value} value={value}>{getDetailLabel(value)}</option>)}</select></label></Card><Card><h3 className="mb-4 text-xs font-black uppercase text-indigo-700">Endereço</h3><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[['cep', 'CEP'], ['logradouro', 'Logradouro'], ['numero', 'Número'], ['complemento', 'Complemento'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'UF']].map(([field, label]) => <label key={field} className="text-xs font-black uppercase text-gray-500">{label}<input value={form.endereco[field]} onChange={event => updateAddress(field, field === 'uf' ? event.target.value.toUpperCase() : event.target.value)} maxLength={field === 'uf' ? 2 : field === 'cep' ? 10 : 150} className={inputClass}/></label>)}</div></Card><div className="grid grid-cols-2 gap-3"><Button variant="secondary" onClick={cancel} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</Button></div></form>}
  </div>;
}
