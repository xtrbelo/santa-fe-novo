import React, { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { getMemberInviteByToken, submitMemberSelfRegistration } from '../../services/firebase';
import { ESTADOS_CIVIS, SEXOS } from '../../utils/pessoaForm';
import { maskCPF } from '../../utils/formatters';
import { maskSelfRegistrationCep, maskSelfRegistrationPhone } from '../../utils/memberSelfRegistration';

const fieldClass = 'mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-100';
const labels = { masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro', nao_informado: 'Prefiro não informar', solteiro: 'Solteiro(a)', casado: 'Casado(a)', uniao_estavel: 'União estável', separado: 'Separado(a)', divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)' };
const emptyAddress = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };

function Message({ sent = false }) {
  return <main className="flex min-h-screen items-center justify-center bg-purple-50/50 p-4"><section className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl shadow-purple-900/5">{sent ? <CheckCircle2 className="mx-auto text-emerald-600" size={48} /> : <ShieldCheck className="mx-auto text-purple-600" size={48} />}<h1 className="mt-4 text-xl font-black text-gray-900">{sent ? 'Cadastro enviado' : 'Convite indisponível'}</h1><p className="mt-3 text-sm font-medium leading-relaxed text-gray-600">{sent ? 'Seu cadastro já foi enviado e está aguardando análise.' : 'Este convite é inválido ou não está mais disponível.'}</p></section></main>;
}

const errorText = message => ({
  AUTOCADASTRO_EMAIL_INVALIDO: 'Informe um e-mail válido.', AUTOCADASTRO_CEP_INVALIDO: 'Informe um CEP com 8 dígitos.', AUTOCADASTRO_UF_INVALIDA: 'Informe uma UF com 2 letras.', AUTOCADASTRO_DATA_INVALIDA: 'Informe uma data de nascimento válida.',
  AUTOCADASTRO_DATA_INGRESSO_INVALIDA: 'Informe uma data de entrada válida.', AUTOCADASTRO_BATIZADO_OBRIGATORIO: 'Informe se foi batizado na CAESF.', AUTOCADASTRO_DATA_BATISMO_OBRIGATORIA: 'Informe a data de batismo na CAESF.', AUTOCADASTRO_DATA_INGRESSO_FUTURA: 'A data de entrada na Casa não pode ser futura.', AUTOCADASTRO_DATA_BATISMO_FUTURA: 'A data de batismo não pode ser futura.', AUTOCADASTRO_BATISMO_ANTERIOR_INGRESSO: 'A data de batismo não pode ser anterior à entrada na Casa.',
}[message]);

export function AutocadastroMembroPage() {
  const [state, setState] = useState({ status: 'carregando', invite: null });
  const [form, setForm] = useState({ dataNascimento: '', contato: '', email: '', sexo: 'nao_informado', estadoCivil: 'nao_informado', endereco: emptyAddress, dadosCasa: { dataIngresso: '', batizadoCaesf: null, dataBatismoCaesf: '' } });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const token = new URLSearchParams(window.location.search).get('token');
    getMemberInviteByToken(token).then(result => {
      if (!active) return;
      setState(result);
      if (result.status === 'ativo') setForm(current => ({ ...current, email: result.invite.email || '' }));
    }).catch(() => active && setState({ status: 'invalido', invite: null }));
    return () => { active = false; };
  }, []);
  if (state.status === 'carregando') return <main className="flex min-h-screen items-center justify-center bg-purple-50/50"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-purple-600" size={40} /><p className="mt-3 text-sm font-bold text-gray-500">Validando convite...</p></div></main>;
  if (state.status === 'respondido') return <Message sent />;
  if (state.status !== 'ativo') return <Message />;
  const invite = state.invite;
  const update = (key, value) => setForm(current => ({ ...current, [key]: key === 'contato' ? maskSelfRegistrationPhone(value) : value }));
  const updateAddress = (key, value) => setForm(current => ({ ...current, endereco: { ...current.endereco, [key]: key === 'cep' ? maskSelfRegistrationCep(value) : value } }));
  const updateHouseData = (key, value) => setForm(current => ({ ...current, dadosCasa: { ...current.dadosCasa, [key]: value, ...(key === 'batizadoCaesf' && value === false ? { dataBatismoCaesf: '' } : {}) } }));
  const submit = async event => {
    event.preventDefault(); setSubmitting(true); setError('');
    try { await submitMemberSelfRegistration({ inviteId: invite.id, data: { ...form, nome: invite.nome, cpf: invite.cpf } }); setState({ status: 'respondido', invite }); }
    catch (submitError) {
      const friendly = errorText(submitError.message);
      if (friendly) setError(friendly);
      else if (submitError.message === 'AUTOCADASTRO_JA_ENVIADO') setState({ status: 'respondido', invite });
      else setState({ status: 'invalido', invite: null });
    } finally { setSubmitting(false); }
  };
  return <main className="min-h-screen bg-purple-50/50 px-4 py-8 sm:py-12"><form onSubmit={submit} className="mx-auto w-full max-w-3xl space-y-6 rounded-3xl bg-white p-5 shadow-xl shadow-purple-900/5 sm:p-8">
    <header className="border-b border-gray-100 pb-5"><p className="text-xs font-black uppercase tracking-widest text-purple-600">Casa Santa Fé</p><h1 className="mt-1 text-2xl font-black text-gray-900 sm:text-3xl">Autocadastro de membro</h1><p className="mt-2 text-sm text-gray-500">Preencha seus dados para análise da administração.</p></header>
    <section><h2 className="font-black text-gray-900">Identificação</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-gray-600">Nome<input className={`${fieldClass} bg-gray-50`} value={invite.nome} disabled /></label><label className="text-xs font-bold text-gray-600">CPF<input className={`${fieldClass} bg-gray-50`} value={maskCPF(invite.cpf)} disabled /></label></div></section>
    <section><h2 className="font-black text-gray-900">Contato e dados pessoais</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-gray-600">E-mail<input className={fieldClass} type="email" value={form.email} onChange={e => update('email', e.target.value)} /></label><label className="text-xs font-bold text-gray-600">Contato<input className={fieldClass} value={form.contato} maxLength={30} onChange={e => update('contato', e.target.value)} /></label><label className="text-xs font-bold text-gray-600">Data de nascimento<input className={fieldClass} type="date" value={form.dataNascimento} onChange={e => update('dataNascimento', e.target.value)} /></label><label className="text-xs font-bold text-gray-600">Sexo<select className={fieldClass} value={form.sexo} onChange={e => update('sexo', e.target.value)}>{SEXOS.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label><label className="text-xs font-bold text-gray-600 sm:col-span-2">Estado civil<select className={fieldClass} value={form.estadoCivil} onChange={e => update('estadoCivil', e.target.value)}>{ESTADOS_CIVIS.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label></div></section>
    <section><h2 className="font-black text-gray-900">Endereço</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{[['cep', 'CEP'], ['logradouro', 'Logradouro'], ['numero', 'Número'], ['complemento', 'Complemento'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'UF']].map(([key, label]) => <label key={key} className={`text-xs font-bold text-gray-600 ${key === 'logradouro' ? 'sm:col-span-2' : ''}`}>{label}<input className={fieldClass} value={form.endereco[key]} maxLength={key === 'uf' ? 2 : key === 'cep' ? 9 : 120} onChange={e => updateAddress(key, e.target.value)} /></label>)}</div></section>
    <section><h2 className="font-black text-gray-900">Dados da Casa</h2><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-gray-600">Data de entrada na Casa<input className={fieldClass} type="date" value={form.dadosCasa.dataIngresso} onChange={e => updateHouseData('dataIngresso', e.target.value)} /></label><fieldset><legend className="text-xs font-bold text-gray-600">Batizado na CAESF? *</legend><div className="mt-3 flex gap-5 text-sm font-bold"><label><input type="radio" name="batizadoCaesf" required checked={form.dadosCasa.batizadoCaesf === true} onChange={() => updateHouseData('batizadoCaesf', true)} /> Sim</label><label><input type="radio" name="batizadoCaesf" required checked={form.dadosCasa.batizadoCaesf === false} onChange={() => updateHouseData('batizadoCaesf', false)} /> Não</label></div></fieldset>{form.dadosCasa.batizadoCaesf === true && <label className="text-xs font-bold text-gray-600 sm:col-span-2">Data de batismo na CAESF *<input className={fieldClass} type="date" required value={form.dadosCasa.dataBatismoCaesf} onChange={e => updateHouseData('dataBatismoCaesf', e.target.value)} /></label>}</div></section>
    <p className="rounded-2xl bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-800">O envio deste cadastro não concede acesso ao Sistema Santa Fé. Seus dados serão analisados pela administração.</p>{error && <p role="alert" className="text-sm font-bold text-rose-600">{error}</p>}<Button type="submit" variant="purple" disabled={submitting} className="w-full">{submitting ? 'Enviando...' : 'Enviar cadastro para análise'}</Button>
  </form></main>;
}
