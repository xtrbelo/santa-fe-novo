import React, { useCallback, useEffect, useState } from 'react';
import { getAppCollection, getMyRegistration, getDocs, updateMyRegistration } from '../../services/firebase';
import { ROLE_LABELS } from '../../constants/roles';
import { getPessoaFuncoesCasa, getPessoaVinculo } from '../../utils/domain';
import { ESTADOS_CIVIS, getEffectiveMemberFunctions, getMemberFunctionLabels } from '../../utils/pessoaForm';
import { formatDateBr, formatDetailValue, getDetailLabel } from '../../utils/pessoaDetails';
import { maskCPF, maskPhone } from '../../utils/formatters';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { DataLoadState } from '../../components/ui/DataLoadState';
import { useToast } from '../../components/ui/useToast';
import { Camera, CheckCircle2, CircleHelp, Edit, ShieldX, UserRound } from 'lucide-react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { setMyImageConsentOnServer } from '../../services/firebaseFunctions';
import { IMAGE_CONSENT_VERSION } from '../../components/pessoas/ImageConsentField';

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
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingImageConsent, setSavingImageConsent] = useState(false);
  const [imageConsentDraft, setImageConsentDraft] = useState(false);
  const [imageConsentOpen, setImageConsentOpen] = useState(false);
  const [imageConsentConfirmed, setImageConsentConfirmed] = useState(false);
  const toast = useToast();
  const hasUnsavedChanges = editing && JSON.stringify(form) !== JSON.stringify(toForm(pessoa));
  const confirmDiscard = useUnsavedChanges(hasUnsavedChanges);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const [registration, configuredFunctions] = await Promise.all([
        getMyRegistration({ uid: user.uid }),
        getDocs(getAppCollection('config_funcoes_membro')).then(snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      ]);
      setPessoa(registration); setFunctions(getEffectiveMemberFunctions(configuredFunctions)); setForm(toForm(registration)); setImageConsentDraft(registration?.consentimentoImagem?.origem !== 'titular_presencial' && registration?.consentimentoImagem?.autorizado === true);
    } catch (error) { console.error(error); setLoadError(true); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { void load(); }, [load]);
  const updateAddress = (field, value) => setForm(current => ({ ...current, endereco: { ...current.endereco, [field]: value } }));
  const cancel = () => { if (confirmDiscard()) { setForm(toForm(pessoa)); setEditing(false); } };
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
  const saveImageConsent = async () => {
    if (!imageConsentConfirmed) { toast.error('Confirme que esta é a sua própria decisão.'); return; }
    setSavingImageConsent(true);
    try { const result = await setMyImageConsentOnServer(imageConsentDraft); await load(); setImageConsentOpen(false); setImageConsentConfirmed(false); toast.success(`Sua decisão foi registrada. Protocolo ${result.protocol}.`); }
    catch (error) { console.error(error); toast.error('Não foi possível atualizar a autorização de imagem.'); }
    finally { setSavingImageConsent(false); }
  };

  if (loading || loadError) return <DataLoadState loading={loading} error={loadError} subject="seu cadastro" onRetry={() => void load()} />;
  if (!profile?.pessoaBaseId || !pessoa) return <Card className="text-center py-10"><UserRound className="mx-auto mb-3 text-amber-500" size={36}/><p className="font-bold text-gray-700">Seu usuário ainda não está vinculado a um cadastro de membro.<br/>Procure um administrador.</p></Card>;
  const endereco = pessoa.endereco || {};
  const functionLabels = getMemberFunctionLabels(getPessoaFuncoesCasa(pessoa), functions).join(', ');
  const hasImageConsentDecision = pessoa.consentimentoImagem?.origem !== 'titular_presencial' && typeof pessoa.consentimentoImagem?.autorizado === 'boolean';
  const imageConsentDate = pessoa.consentimentoImagem?.registradoEm?.toDate?.() || (pessoa.consentimentoImagem?.registradoEm ? new Date(pessoa.consentimentoImagem.registradoEm) : null);

  return <div className="space-y-5 animate-in fade-in duration-500 pb-10"><header className="flex items-end justify-between gap-3 px-1"><div><h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tighter uppercase italic">Meu Cadastro</h2><p className="text-sm text-gray-500">Seus dados pessoais e vínculo institucional</p></div>{!editing && <Button onClick={() => setEditing(true)}><Edit size={16}/> Editar meus dados</Button>}</header>
    {!editing ? <>
      <Section title="Identificação"><Item label="Nome" value={pessoa.nome}/><Item label="CPF" value={pessoa.cpf ? maskCPF(pessoa.cpf) : null}/><Item label="Data de nascimento" value={formatDateBr(pessoa.dataNascimento)}/><Item label="Sexo" value={getDetailLabel(pessoa.sexo)}/><Item label="Estado civil" value={getDetailLabel(pessoa.estadoCivil)}/></Section>
      <Section title="Contato"><Item label="E-mail" value={pessoa.email}/><Item label="Telefone / contato" value={pessoa.contato ? maskPhone(pessoa.contato) : null}/></Section>
      <Section title="Endereço"><Item label="CEP" value={endereco.cep}/><Item label="Logradouro" value={endereco.logradouro}/><Item label="Número" value={endereco.numero}/><Item label="Complemento" value={endereco.complemento}/><Item label="Bairro" value={endereco.bairro}/><Item label="Cidade" value={endereco.cidade}/><Item label="UF" value={endereco.uf}/></Section>
      <Section title="Vínculo com a Casa"><Item label="Vínculo" value={getPessoaVinculo(pessoa) === 'membro' ? 'Membro' : pessoa.tipoPessoa || 'Consulente'}/><Item label="Funções da Casa" value={functionLabels}/></Section>
      <Card><div className="flex items-start gap-3"><Camera className="mt-0.5 shrink-0 text-violet-700" size={22}/><div className="flex-1"><h3 className="text-xs font-black uppercase tracking-wider text-indigo-700">Uso de imagem</h3><div className="mt-2 flex items-center gap-2">{!hasImageConsentDecision ? <CircleHelp className="text-amber-600" size={18}/> : pessoa.consentimentoImagem.autorizado ? <CheckCircle2 className="text-emerald-600" size={18}/> : <ShieldX className="text-rose-600" size={18}/>}<p className="text-sm font-black text-gray-800">{!hasImageConsentDecision ? 'Decisão pendente' : pessoa.consentimentoImagem.autorizado ? 'Autorizado' : 'Não autorizado'}</p></div><p className="mt-1 text-xs text-gray-500">Somente você, autenticado na sua conta, pode registrar ou alterar esta decisão.</p>{hasImageConsentDecision && imageConsentDate && !Number.isNaN(imageConsentDate.getTime()) && <p className="mt-2 text-[11px] font-bold text-gray-400">Registrado em {imageConsentDate.toLocaleString('pt-BR')}{pessoa.consentimentoImagem?.protocolo ? ` • Protocolo ${pessoa.consentimentoImagem.protocolo}` : ''}</p>}</div></div><Button type="button" className="mt-4 w-full" onClick={() => { setImageConsentDraft(hasImageConsentDecision && pessoa.consentimentoImagem?.autorizado === true); setImageConsentConfirmed(false); setImageConsentOpen(true); }}>{hasImageConsentDecision ? 'Revisar minha decisão' : 'Registrar minha decisão'}</Button></Card>
      <Section title="Acesso ao sistema"><Item label="Perfil" value={ROLE_LABELS[profile.role] || profile.role}/><Item label="Situação" value={profile.ativo === false ? 'Inativo' : 'Ativo'}/></Section>
    </> : <form onSubmit={save} className="space-y-5"><Card className="space-y-4"><h3 className="text-xs font-black uppercase text-indigo-700">Dados editáveis</h3><label className="block text-xs font-black uppercase text-gray-500">Telefone / contato<input value={form.contato} onChange={event => setForm(current => ({ ...current, contato: maskPhone(event.target.value) }))} maxLength={15} className={inputClass}/></label><label className="block text-xs font-black uppercase text-gray-500">Estado civil<select value={form.estadoCivil} onChange={event => setForm(current => ({ ...current, estadoCivil: event.target.value }))} className={inputClass}>{ESTADOS_CIVIS.map(value => <option key={value} value={value}>{getDetailLabel(value)}</option>)}</select></label></Card><Card><h3 className="mb-4 text-xs font-black uppercase text-indigo-700">Endereço</h3><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[['cep', 'CEP'], ['logradouro', 'Logradouro'], ['numero', 'Número'], ['complemento', 'Complemento'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'UF']].map(([field, label]) => <label key={field} className="text-xs font-black uppercase text-gray-500">{label}<input value={form.endereco[field]} onChange={event => updateAddress(field, field === 'uf' ? event.target.value.toUpperCase() : event.target.value)} maxLength={field === 'uf' ? 2 : field === 'cep' ? 10 : 150} className={inputClass}/></label>)}</div></Card><div className="grid grid-cols-2 gap-3"><Button variant="secondary" onClick={cancel} disabled={saving}>Cancelar</Button><Button type="submit" busy={saving} busyText="Salvando...">Salvar alterações</Button></div></form>}
    <Modal isOpen={imageConsentOpen} onClose={() => { if (!savingImageConsent) setImageConsentOpen(false); }} title="Minha decisão sobre uso de imagem" maxWidth="max-w-2xl"><div className="space-y-5"><section className="space-y-3 text-sm leading-relaxed text-gray-600"><p>A Casa de Auxílio Santa Fé poderá utilizar fotografias e vídeos em que você apareça para divulgação institucional, portal, comunicados, redes sociais e registros de atividades da Casa.</p><p>A autorização é livre, específica e não condiciona seu cadastro, atendimento ou participação nas atividades. Não haverá finalidade comercial.</p><p>Você poderá alterar ou revogar esta decisão gratuitamente. A alteração não invalida usos realizados antes do pedido.</p><p className="text-xs font-bold text-gray-500">Versão do termo: {IMAGE_CONSENT_VERSION}</p></section><fieldset><legend className="mb-2 text-xs font-black uppercase tracking-wider text-gray-600">Minha decisão</legend><div className="grid gap-3 sm:grid-cols-2"><label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${imageConsentDraft ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}><input type="radio" name="my-image-consent" className="mt-1" checked={imageConsentDraft === true} onChange={() => { setImageConsentDraft(true); setImageConsentConfirmed(false); }}/><span><strong className="block text-sm text-gray-900">Autorizo</strong><span className="text-xs text-gray-500">Permito o uso institucional da minha imagem.</span></span></label><label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${imageConsentDraft === false ? 'border-rose-500 bg-rose-50' : 'border-gray-200'}`}><input type="radio" name="my-image-consent" className="mt-1" checked={imageConsentDraft === false} onChange={() => { setImageConsentDraft(false); setImageConsentConfirmed(false); }}/><span><strong className="block text-sm text-gray-900">Não autorizo</strong><span className="text-xs text-gray-500">Não permito o uso institucional da minha imagem.</span></span></label></div></fieldset><label className="flex items-start gap-3 rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-700"><input type="checkbox" className="mt-1" checked={imageConsentConfirmed} onChange={event => setImageConsentConfirmed(event.target.checked)}/><span>Confirmo que esta é a minha decisão e que li o termo apresentado.</span></label><div className="flex gap-2"><Button type="button" variant="secondary" className="flex-1" disabled={savingImageConsent} onClick={() => setImageConsentOpen(false)}>Cancelar</Button><Button type="button" className="flex-1" disabled={savingImageConsent || !imageConsentConfirmed} onClick={saveImageConsent}>{savingImageConsent ? 'Registrando...' : 'Confirmar decisão'}</Button></div></div></Modal>
  </div>;
}
