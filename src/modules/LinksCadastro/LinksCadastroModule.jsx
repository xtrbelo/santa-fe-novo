import React, { useEffect, useMemo, useState } from 'react';
import { Clipboard, ClipboardCheck, Download, History, Link2, MessageCircle, Plus, Power, PowerOff, Printer, QrCode, Search, SquarePen } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataLoadState } from '../../components/ui/DataLoadState';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/useToast';
import { createRegistrationLink, getAppCollection, onSnapshot, setRegistrationLinkActive, updateRegistrationLink } from '../../services/firebase';
import { buildRegistrationLinkUrl, getRegistrationLinkEffectiveStatus, getRegistrationLinkWarnings, REGISTRATION_LINK_TYPE_LABELS } from '../../utils/registrationLink';

const inputClass = 'mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-purple-500';
const statusLabel = { ativo: 'Ativo', inativo: 'Desativado', expirado: 'Expirado', esgotado: 'Limite atingido' };
const statusClass = { ativo: 'bg-emerald-50 text-emerald-700', inativo: 'bg-gray-100 text-gray-600', expirado: 'bg-amber-100 text-amber-800', esgotado: 'bg-red-100 text-red-700' };

export function LinksCadastroModule({ user, onOpenRequests }) {
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [qrPreview, setQrPreview] = useState(null);
  const [historyLink, setHistoryLink] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [form, setForm] = useState({ tipoCadastro: 'membro', nome: 'Cadastro de Membros', validadeDias: '', limiteUsos: '' });
  const [editForm, setEditForm] = useState({ nome: '', validadeDias: '', limiteUsos: '' });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const toast = useToast();

  useEffect(() => onSnapshot(getAppCollection('links_autocadastro'), snapshot => {
    setItems(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0)));
    setLoading(false); setError(false);
  }, loadError => { console.error(loadError); setLoading(false); setError(true); }), []);
  useEffect(() => onSnapshot(getAppCollection('solicitacoes_cadastro'), snapshot => setRequests(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), loadError => console.error(loadError)), []);
  useEffect(() => onSnapshot(getAppCollection('links_autocadastro_historico'), snapshot => setHistoryItems(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), loadError => console.error(loadError)), []);

  const responsibleName = user.displayName || user.email || 'Responsável';

  const links = useMemo(() => items.map(item => {
    const linked = requests.filter(request => request.linkId === item.id);
    return { ...item, effectiveStatus: getRegistrationLinkEffectiveStatus(item), warnings: getRegistrationLinkWarnings(item), requestCounts: { total: linked.length, pendentes: linked.filter(request => request.statusCadastro === 'aguardando_validacao').length, aprovadas: linked.filter(request => request.statusCadastro === 'aprovado').length, rejeitadas: linked.filter(request => request.statusCadastro === 'rejeitado').length } };
  }), [items, requests]);
  const linkCounters = useMemo(() => links.reduce((counts, item) => ({ ...counts, [item.effectiveStatus]: counts[item.effectiveStatus] + 1 }), { ativo: 0, inativo: 0, expirado: 0, esgotado: 0 }), [links]);
  const filteredLinks = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const priority = item => item.effectiveStatus === 'expirado' ? 0 : item.effectiveStatus === 'esgotado' ? 1 : item.warnings.length ? 2 : item.effectiveStatus === 'ativo' ? 3 : 4;
    return links.filter(item => {
      const normalizedName = item.nome.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return (!normalizedSearch || normalizedName.includes(normalizedSearch)) && (typeFilter === 'todos' || item.tipoCadastro === typeFilter) && (statusFilter === 'todos' || item.effectiveStatus === statusFilter);
    }).sort((a, b) => priority(a) - priority(b) || (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));
  }, [links, searchTerm, typeFilter, statusFilter]);
  const pagination = usePagination(filteredLinks, [searchTerm, typeFilter, statusFilter]);
  const changeType = tipoCadastro => setForm(current => ({ ...current, tipoCadastro, nome: current.nome === 'Cadastro de Membros' || current.nome === 'Cadastro de Consulentes' ? `Cadastro de ${tipoCadastro === 'membro' ? 'Membros' : 'Consulentes'}` : current.nome }));
  const copy = async item => {
    try { await navigator.clipboard.writeText(buildRegistrationLinkUrl(item.id, window.location.origin)); toast.success('Link copiado.'); }
    catch { toast.error('Não foi possível copiar o link automaticamente.'); }
  };
  const whatsapp = item => window.open(`https://wa.me/?text=${encodeURIComponent(`Preencha seu ${REGISTRATION_LINK_TYPE_LABELS[item.tipoCadastro].toLowerCase()}: ${buildRegistrationLinkUrl(item.id, window.location.origin)}`)}`, '_blank', 'noopener,noreferrer');
  const submit = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const created = await createRegistrationLink({ ...form, userId: user.uid, responsibleName });
      setOpen(false); setForm({ tipoCadastro: 'membro', nome: 'Cadastro de Membros', validadeDias: '', limiteUsos: '' });
      await navigator.clipboard?.writeText?.(created.url);
      toast.success('Link criado e copiado.');
    } catch (submitError) { console.error(submitError); toast.error('Não foi possível criar o link. Revise os dados informados.'); }
    finally { setBusy(false); }
  };
  const toggle = async item => {
    setBusy(true);
    try { await setRegistrationLinkActive({ linkId: item.id, active: item.status !== 'ativo', userId: user.uid, responsibleName }); toast.success(item.status === 'ativo' ? 'Link desativado.' : 'Link reativado.'); }
    catch (toggleError) { console.error(toggleError); toast.error(toggleError.message === 'LINK_EXPIRADO' ? 'Um link expirado não pode ser reativado.' : 'Não foi possível alterar o link.'); }
    finally { setBusy(false); }
  };
  const startEdit = item => {
    const remainingDays = item.expiraEm?.toMillis ? Math.max(1, Math.ceil((item.expiraEm.toMillis() - Date.now()) / 86400000)) : '';
    setEditForm({ nome: item.nome, validadeDias: remainingDays, limiteUsos: item.limiteUsos ?? '' });
    setEditing(item);
  };
  const submitEdit = async event => {
    event.preventDefault();
    if (!window.confirm('Confirmar as alterações deste link? A URL e o histórico serão mantidos.')) return;
    setBusy(true);
    try {
      await updateRegistrationLink({ linkId: editing.id, ...editForm, userId: user.uid, responsibleName });
      setEditing(null); toast.success('Link atualizado sem alterar a URL.');
    } catch (submitError) {
      console.error(submitError);
      toast.error(submitError.message === 'LIMITE_INFERIOR_AOS_USOS' ? `O limite não pode ser menor que os ${editing.totalUsos || 0} usos já registrados.` : 'Não foi possível atualizar o link. Revise os dados.');
    } finally { setBusy(false); }
  };
  const showQrCode = async item => {
    setBusy(true);
    try {
      const url = buildRegistrationLinkUrl(item.id, window.location.origin);
      const dataUrl = await QRCode.toDataURL(url, { width: 720, margin: 2, errorCorrectionLevel: 'H', color: { dark: '#111827', light: '#ffffff' } });
      setQrPreview({ item, url, dataUrl });
    } catch (qrError) { console.error(qrError); toast.error('Não foi possível gerar o QR Code.'); }
    finally { setBusy(false); }
  };
  const downloadQrCode = () => {
    const anchor = document.createElement('a');
    anchor.href = qrPreview.dataUrl;
    anchor.download = `qr-${qrPreview.item.tipoCadastro}-${qrPreview.item.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    anchor.click();
  };
  const printQrCode = () => {
    const printWindow = window.open('', '_blank', 'popup');
    if (!printWindow) { toast.error('Permita a abertura da janela para imprimir.'); return; }
    printWindow.opener = null;
    const title = printWindow.document.createElement('h1');
    const type = printWindow.document.createElement('p');
    const image = printWindow.document.createElement('img');
    const address = printWindow.document.createElement('p');
    title.textContent = qrPreview.item.nome;
    type.textContent = REGISTRATION_LINK_TYPE_LABELS[qrPreview.item.tipoCadastro];
    address.textContent = qrPreview.url;
    image.src = qrPreview.dataUrl; image.alt = `QR Code para ${qrPreview.item.nome}`; image.style.width = '320px';
    printWindow.document.body.style.cssText = 'font-family:Arial,sans-serif;text-align:center;padding:40px;color:#111827';
    address.style.cssText = 'font-size:12px;overflow-wrap:anywhere';
    printWindow.document.body.append(title, type, image, address);
    image.onload = () => { printWindow.focus(); printWindow.print(); };
  };

  if (loading || error) return <DataLoadState loading={loading} error={error} subject="os links de cadastro" onRetry={() => window.location.reload()} />;
  return <div className="space-y-6 pb-10">
    <header className="flex items-end justify-between gap-4"><div><h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-900 sm:text-3xl">Links de cadastro</h2><p className="mt-1 text-sm font-medium text-gray-500">Links reutilizáveis para Membros e Consulentes.</p></div><Button variant="purple" onClick={() => setOpen(true)}><Plus size={18}/> Novo link</Button></header>
    <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Os links ativos já podem ser compartilhados. Todo envio entra em Solicitações e depende de análise administrativa.</p>
    <section className="space-y-3" aria-label="Filtros dos links"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries({ ativo: 'Ativos', inativo: 'Desativados', expirado: 'Expirados', esgotado: 'Esgotados' }).map(([status, label]) => <button type="button" key={status} onClick={() => setStatusFilter(current => current === status ? 'todos' : status)} className={`rounded-2xl border p-3 text-left ${statusFilter === status ? 'border-purple-500 bg-purple-50' : 'border-gray-100 bg-white'}`}><span className="block text-xl font-black text-gray-900">{linkCounters[status]}</span><span className="text-[10px] font-black uppercase text-gray-500">{label}</span></button>)}</div><div className="grid gap-2 rounded-2xl bg-white p-3 shadow-sm sm:grid-cols-[1fr_180px_180px]"><label className="relative"><Search size={17} className="absolute left-3 top-3.5 text-gray-400"/><span className="sr-only">Buscar link pelo nome</span><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Buscar link pelo nome" className={`${inputClass} !mt-0 pl-10`}/></label><select aria-label="Filtrar pelo tipo" value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className={`${inputClass} !mt-0`}><option value="todos">Todos os tipos</option><option value="membro">Membros</option><option value="consulente">Consulentes</option></select><select aria-label="Filtrar pela situação" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={`${inputClass} !mt-0`}><option value="todos">Todas as situações</option><option value="ativo">Ativos</option><option value="inativo">Desativados</option><option value="expirado">Expirados</option><option value="esgotado">Esgotados</option></select></div></section>
    <div className="grid gap-4">{links.length === 0 ? <Card className="py-12 text-center text-sm font-bold text-gray-400">Nenhum link criado.</Card> : filteredLinks.length === 0 ? <Card className="py-12 text-center text-sm font-bold text-gray-400">Nenhum link corresponde aos filtros.</Card> : pagination.items.map(item => <Card key={item.id} className={`space-y-4 !border-none shadow-md ${['expirado', 'esgotado'].includes(item.effectiveStatus) ? 'ring-2 ring-amber-200' : ''}`}><div className="flex gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${['expirado', 'esgotado'].includes(item.effectiveStatus) ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-600'}`}><Link2 size={22}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-gray-900">{item.nome}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${statusClass[item.effectiveStatus]}`}>{statusLabel[item.effectiveStatus]}</span></div><p className="mt-1 text-xs font-bold text-gray-500">{REGISTRATION_LINK_TYPE_LABELS[item.tipoCadastro]}</p><p className="mt-1 text-xs text-gray-400">Usos: {item.totalUsos || 0}{item.limiteUsos ? ` de ${item.limiteUsos}` : ' · sem limite'}{item.expiraEm?.toDate ? ` · expira em ${item.expiraEm.toDate().toLocaleDateString('pt-BR')}` : ' · sem validade'}</p><p className="mt-2 text-xs font-bold text-gray-600">Solicitações: {item.requestCounts.total} · {item.requestCounts.pendentes} pendentes · {item.requestCounts.aprovadas} aprovadas · {item.requestCounts.rejeitadas} rejeitadas</p></div></div>{item.warnings.length > 0 && <div className="space-y-2 rounded-2xl bg-amber-50 p-3 text-amber-900">{item.warnings.map(warning => <p key={warning.type} className="text-xs font-bold">{warning.message}</p>)}<button type="button" disabled={busy} onClick={() => startEdit(item)} className="text-xs font-black uppercase text-purple-700 underline underline-offset-2 disabled:opacity-50">Editar ou renovar agora</button></div>}<div className="grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-2 xl:grid-cols-7"><Button variant="secondary" disabled={item.effectiveStatus !== 'ativo'} onClick={() => copy(item)}><Clipboard size={16}/> Copiar</Button><Button variant="success" disabled={item.effectiveStatus !== 'ativo'} onClick={() => whatsapp(item)}><MessageCircle size={16}/> WhatsApp</Button><Button variant="secondary" disabled={item.effectiveStatus !== 'ativo' || busy} onClick={() => showQrCode(item)}><QrCode size={16}/> QR Code</Button><Button variant="secondary" disabled={item.requestCounts.total === 0} onClick={() => onOpenRequests?.(item.id)}><ClipboardCheck size={16}/> Solicitações</Button><Button variant="secondary" onClick={() => setHistoryLink(item)}><History size={16}/> Histórico</Button><Button variant="secondary" disabled={busy} onClick={() => startEdit(item)}><SquarePen size={16}/> Editar</Button><Button variant={item.status === 'ativo' ? 'danger' : 'secondary'} disabled={busy || item.effectiveStatus === 'expirado'} onClick={() => toggle(item)}>{item.status === 'ativo' ? <PowerOff size={16}/> : <Power size={16}/>} {item.status === 'ativo' ? 'Desativar' : 'Reativar'}</Button></div></Card>)}</div>
    <Pagination pagination={pagination} label="link(s)" />
    <Modal isOpen={open} onClose={() => !busy && setOpen(false)} title="Criar link de cadastro" maxWidth="max-w-xl"><form onSubmit={submit} className="space-y-4"><label className="block text-xs font-black uppercase text-gray-500">Tipo de cadastro<select value={form.tipoCadastro} onChange={event => changeType(event.target.value)} className={inputClass}><option value="membro">Membro — cadastro completo</option><option value="consulente">Consulente — cadastro simplificado</option></select></label><label className="block text-xs font-black uppercase text-gray-500">Nome do link<input required maxLength={100} value={form.nome} onChange={event => setForm(current => ({ ...current, nome: event.target.value }))} className={inputClass}/></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-black uppercase text-gray-500">Validade em dias<input type="number" min="1" max="365" placeholder="Sem validade" value={form.validadeDias} onChange={event => setForm(current => ({ ...current, validadeDias: event.target.value }))} className={inputClass}/></label><label className="block text-xs font-black uppercase text-gray-500">Limite de cadastros<input type="number" min="1" max="10000" placeholder="Sem limite" value={form.limiteUsos} onChange={event => setForm(current => ({ ...current, limiteUsos: event.target.value }))} className={inputClass}/></label></div><Button type="submit" variant="purple" busy={busy} className="w-full">Criar link</Button></form></Modal>
    <Modal isOpen={Boolean(editing)} onClose={() => !busy && setEditing(null)} title="Editar link de cadastro" maxWidth="max-w-xl"><form onSubmit={submitEdit} className="space-y-4"><p className="rounded-xl bg-purple-50 p-3 text-xs font-bold text-purple-800">{editing && REGISTRATION_LINK_TYPE_LABELS[editing.tipoCadastro]}. A URL e o histórico não serão alterados.</p><label className="block text-xs font-black uppercase text-gray-500">Nome do link<input required maxLength={100} value={editForm.nome} onChange={event => setEditForm(current => ({ ...current, nome: event.target.value }))} className={inputClass}/></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-black uppercase text-gray-500">Validade a partir de hoje<input type="number" min="1" max="365" placeholder="Sem validade" value={editForm.validadeDias} onChange={event => setEditForm(current => ({ ...current, validadeDias: event.target.value }))} className={inputClass}/></label><label className="block text-xs font-black uppercase text-gray-500">Limite de cadastros<input type="number" min={Math.max(1, editing?.totalUsos || 0)} max="10000" placeholder="Sem limite" value={editForm.limiteUsos} onChange={event => setEditForm(current => ({ ...current, limiteUsos: event.target.value }))} className={inputClass}/><span className="mt-1 block text-[10px] normal-case text-gray-400">Mínimo: {editing?.totalUsos || 0} usos já registrados.</span></label></div><Button type="submit" variant="purple" busy={busy} className="w-full">Salvar alterações</Button></form></Modal>
    <Modal isOpen={Boolean(qrPreview)} onClose={() => setQrPreview(null)} title="QR Code do link" maxWidth="max-w-md">{qrPreview && <div className="space-y-4 text-center"><div><h3 className="font-black text-gray-900">{qrPreview.item.nome}</h3><p className="text-xs font-bold text-purple-700">{REGISTRATION_LINK_TYPE_LABELS[qrPreview.item.tipoCadastro]}</p></div><img src={qrPreview.dataUrl} alt={`QR Code para ${qrPreview.item.nome}`} className="mx-auto w-full max-w-72 rounded-2xl border border-gray-100"/><p className="break-all text-[10px] text-gray-400">{qrPreview.url}</p><div className="grid gap-2 sm:grid-cols-2"><Button variant="purple" onClick={downloadQrCode}><Download size={16}/> Baixar PNG</Button><Button variant="secondary" onClick={printQrCode}><Printer size={16}/> Imprimir</Button></div></div>}</Modal>
    <Modal isOpen={Boolean(historyLink)} onClose={() => setHistoryLink(null)} title={`Histórico de ${historyLink?.nome || ''}`} maxWidth="max-w-xl"><div className="max-h-[60vh] space-y-3 overflow-y-auto">{historyLink && historyItems.filter(item => item.linkId === historyLink.id).sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0)).map(item => <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><p className="text-sm font-black text-gray-900">{{ LINK_CRIADO: 'Link criado', LINK_EDITADO: 'Link editado', LINK_ATIVADO: 'Link ativado', LINK_DESATIVADO: 'Link desativado' }[item.tipo] || 'Alteração no link'}</p><p className="mt-1 text-sm text-gray-600">{item.descricao}</p><p className="mt-2 text-xs font-bold text-gray-400">{item.criadoEm?.toDate?.().toLocaleString('pt-BR') || 'Data indisponível'} · {item.responsavelNome}</p></div>)}{historyLink && historyItems.every(item => item.linkId !== historyLink.id) && <p className="py-8 text-center text-sm font-bold text-gray-400">Este link ainda não possui alterações registradas.</p>}</div></Modal>
  </div>;
}
