import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, BellRing, CalendarDays, CakeSlice, Clock3, Eye, Filter, Images, Pencil, Pin, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { getMemberAreaOverviewOnServer, manageMemberAlbumOnServer, manageMemberMediaOnServer, manageMemberNoticeOnServer } from '../../services/firebaseFunctions';
import { useToast } from '../../components/ui/useToast';
import { MemberAlbumModal } from './MemberAlbumModal';
import { getMemberAlbumCategory, MEMBER_ALBUM_CATEGORIES } from './memberAlbumCategories';
import { DriveMediaInbox } from './DriveMediaInbox';
import { DirectMediaInbox } from './DirectMediaInbox';

const dateText = value => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short' });
const monthText = month => new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2026, month - 1, 1));
const dateInput = value => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return `${parts.find(item => item.type === 'year')?.value}-${parts.find(item => item.type === 'month')?.value}-${parts.find(item => item.type === 'day')?.value}`;
};
const calendarMonthKey = value => dateInput(value).slice(0, 7);
const calendarMonthLabel = value => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'long', year: 'numeric' }).format(new Date(value));
const emptyNotice = () => ({ id: null, titulo: '', mensagem: '', inicioDia: dateInput(new Date()), fimDia: '', destaque: false });
const emptyAlbum = () => ({ id: null, titulo: '', atividade: '', categoria: '', subdivisao: '', dataAtividade: dateInput(new Date()), descricao: '', status: 'rascunho', participantesIds: [], revisaoAutorizacoesConfirmada: false });

export const MemberAreaModule = ({ profile, mode = 'member' }) => {
  const isMediaCenter = mode === 'media';
  const [overview, setOverview] = useState({ calendario: [], aniversariantes: [], avisos: [], albuns: [], albunsArquivados: [], autorizacoesImagem: [], mesAniversarios: new Date().getMonth() + 1 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState('');
  const [noticeDraft, setNoticeDraft] = useState(null);
  const [savingNotice, setSavingNotice] = useState(false);
  const [albumDraft, setAlbumDraft] = useState(null);
  const [savingAlbum, setSavingAlbum] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [activeAlbum, setActiveAlbum] = useState(null);
  const [albumFilters, setAlbumFilters] = useState({ busca: '', status: 'todos', categoria: 'todas', ano: 'todos', somenteRevisao: false });
  const [showArchivedAlbums, setShowArchivedAlbums] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const toast = useToast();
  const canManageNotices = ['admin', 'gestor'].includes(profile?.role);
  const canManageAlbums = isMediaCenter && ['admin', 'gestor', 'midia'].includes(profile?.role);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const result = await getMemberAreaOverviewOnServer();
      setOverview(result);
      setSelectedCalendarMonth(current => current || (result.calendario[0] ? calendarMonthKey(result.calendario[0].data) : ''));
    } catch (error) { console.error(error); setLoadError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveNotice = async event => {
    event.preventDefault();
    if (!noticeDraft.titulo.trim() || !noticeDraft.mensagem.trim() || !noticeDraft.inicioDia) { toast.error('Informe título, mensagem e data inicial.'); return; }
    setSavingNotice(true);
    try {
      await manageMemberNoticeOnServer({
        action: 'save', noticeId: noticeDraft.id,
        notice: {
          titulo: noticeDraft.titulo, mensagem: noticeDraft.mensagem, destaque: noticeDraft.destaque,
          inicioEm: `${noticeDraft.inicioDia}T00:00:00-03:00`,
          fimEm: noticeDraft.fimDia ? `${noticeDraft.fimDia}T23:59:59-03:00` : null,
        },
      });
      toast.success(noticeDraft.id ? 'Aviso atualizado.' : 'Aviso publicado.'); setNoticeDraft(null); await load();
    } catch (error) { console.error(error); toast.error('Não foi possível salvar o aviso. Verifique o período informado.'); }
    finally { setSavingNotice(false); }
  };
  const editNotice = item => setNoticeDraft({ id: item.id, titulo: item.titulo, mensagem: item.mensagem, inicioDia: dateInput(item.inicioEm), fimDia: item.fimEm ? dateInput(item.fimEm) : '', destaque: item.destaque });
  const performArchiveNotice = async item => {
    try { await manageMemberNoticeOnServer({ action: 'archive', noticeId: item.id }); toast.success('Aviso retirado do mural.'); await load(); }
    catch (error) { console.error(error); toast.error('Não foi possível retirar o aviso.'); }
  };
  const archiveNotice = item => setConfirmation({ title: 'Retirar aviso', message: `Retirar o aviso “${item.titulo}” do mural?`, confirmText: 'Retirar aviso', onConfirm: () => performArchiveNotice(item) });

  const saveAlbum = async event => {
    event.preventDefault();
    if (!albumDraft.titulo.trim() || !albumDraft.dataAtividade) { toast.error('Informe o título e a data da atividade.'); return; }
    if (albumDraft.status === 'publicado' && !albumDraft.revisaoAutorizacoesConfirmada) { toast.error('Confirme a revisão das autorizações antes de publicar.'); return; }
    const blockedParticipants = overview.autorizacoesImagem.filter(item => albumDraft.participantesIds.includes(item.pessoaId) && item.status !== 'autorizado');
    if (albumDraft.status === 'publicado' && blockedParticipants.length) { toast.error(`Publicação bloqueada: revise a autorização de ${blockedParticipants.map(item => item.nome).join(', ')}.`); return; }
    setSavingAlbum(true);
    try {
      await manageMemberAlbumOnServer({ action: 'save', albumId: albumDraft.id, album: albumDraft });
      toast.success(albumDraft.id ? 'Álbum atualizado.' : 'Álbum criado.'); setAlbumDraft(null); await load();
    } catch (error) { console.error(error); toast.error('Não foi possível salvar o álbum. Verifique os dados informados.'); }
    finally { setSavingAlbum(false); }
  };
  const editAlbum = item => { setActiveAlbum(null); setAlbumDraft({ id: item.id, titulo: item.titulo, atividade: item.atividade, categoria: item.categoria || '', subdivisao: item.subdivisao || '', dataAtividade: item.dataAtividade, descricao: item.descricao, status: item.status, participantesIds: item.participantesIds || [], arquivos: item.arquivos || [], revisaoAutorizacoesConfirmada: false }); };
  const performArchiveAlbum = async item => {
    try { await manageMemberAlbumOnServer({ action: 'archive', albumId: item.id }); toast.success('Álbum retirado.'); await load(); }
    catch (error) { console.error(error); toast.error('Não foi possível retirar o álbum.'); }
  };
  const archiveAlbum = item => setConfirmation({ title: 'Retirar álbum', message: `Retirar o álbum “${item.titulo}” da Área do Membro? Ele poderá ser recuperado durante 30 dias.`, confirmText: 'Retirar álbum', onConfirm: () => performArchiveAlbum(item) });
  const restoreAlbum = async item => {
    try { await manageMemberAlbumOnServer({ action: 'restore', albumId: item.id }); toast.success('Álbum restaurado em preparação.'); await load(); }
    catch (error) { console.error(error); toast.error('Não foi possível restaurar o álbum. Verifique o prazo de recuperação.'); }
  };
  const openAlbum = async item => {
    setActiveAlbum({ ...item, files: [], loading: true });
    try { const result = await manageMemberMediaOnServer({ action: 'list-view', albumId: item.id }); setActiveAlbum({ ...item, files: result.files, loading: false }); }
    catch (error) { console.error(error); setActiveAlbum(null); toast.error('Não foi possível abrir o álbum.'); }
  };
  const uploadMedia = async (album, files) => {
    if (!album?.id || !files.length) return;
    if ((album.files?.length || album.quantidadeArquivos || 0) + files.length > 30) { toast.error('Cada álbum pode possuir no máximo 30 arquivos.'); return; }
    setUploadingMedia(true);
    try {
      for (const file of files) {
        const image = file.type.startsWith('image/'); const video = file.type.startsWith('video/');
        if ((!image && !video) || (image && file.size > 10 * 1024 * 1024) || (video && file.size > 200 * 1024 * 1024)) throw new Error('ARQUIVO_INVALIDO');
        const ticket = await manageMemberMediaOnServer({ action: 'create-upload', albumId: album.id, fileName: file.name, contentType: file.type, size: file.size });
        const response = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!response.ok) throw new Error('ENVIO_R2_FALHOU');
        await manageMemberMediaOnServer({ action: 'confirm-upload', albumId: album.id, mediaId: ticket.mediaId });
      }
      toast.success(`${files.length} arquivo(s) enviado(s).`); await load(); await openAlbum(album);
    } catch (error) { console.error(error); toast.error('Não foi possível enviar. Verifique o tipo, tamanho e conexão.'); }
    finally { setUploadingMedia(false); }
  };
  const setAlbumCover = async (album, file) => {
    setUploadingMedia(true);
    try { await manageMemberMediaOnServer({ action: 'set-cover', albumId: album.id, mediaId: file.id }); toast.success('Capa do álbum atualizada.'); await load(); await openAlbum({ ...album, capaArquivoId: file.id }); }
    catch (error) { console.error(error); toast.error('Não foi possível definir a capa.'); }
    finally { setUploadingMedia(false); }
  };
  const removeAlbumFile = async (album, file) => {
    setUploadingMedia(true);
    try { await manageMemberMediaOnServer({ action: 'delete', albumId: album.id, mediaId: file.id }); toast.success('Arquivo removido.'); await load(); await openAlbum(album); }
    catch (error) { console.error(error); toast.error('Não foi possível remover o arquivo.'); }
    finally { setUploadingMedia(false); }
  };
  const deleteAlbumFile = (album, file) => setConfirmation({ title: 'Remover arquivo', message: `Remover “${file.nome}” definitivamente deste álbum?`, confirmText: 'Remover arquivo', onConfirm: () => removeAlbumFile(album, file) });
  const reorderAlbumFiles = async (album, mediaIds) => {
    setUploadingMedia(true);
    try { await manageMemberMediaOnServer({ action: 'reorder', albumId: album.id, mediaIds }); toast.success('Ordem do álbum atualizada.'); await openAlbum(album); }
    catch (error) { console.error(error); toast.error('Não foi possível reorganizar o álbum.'); }
    finally { setUploadingMedia(false); }
  };
  const updateAlbumFileDetails = async (album, file, details) => {
    setUploadingMedia(true);
    try { await manageMemberMediaOnServer({ action: 'update-details', albumId: album.id, mediaId: file.id, ...details }); toast.success('Informações da mídia atualizadas.'); await openAlbum(album); }
    catch (error) { console.error(error); toast.error('Não foi possível atualizar as informações da mídia.'); }
    finally { setUploadingMedia(false); }
  };
  const downloadAlbumFiles = async (album, mediaIds, { zip = false } = {}) => {
    if (!mediaIds.length) return;
    setUploadingMedia(true);
    try {
      const result = await manageMemberMediaOnServer({ action: 'create-downloads', albumId: album.id, mediaIds });
      const downloads = result.downloads || [];
      if (zip) {
        const totalSize = downloads.reduce((sum, item) => sum + Number(item.tamanho || 0), 0);
        if (totalSize > 500 * 1024 * 1024) throw new Error('ALBUM_MUITO_GRANDE_PARA_ZIP');
        const { default: JSZip } = await import('jszip'); const archive = new JSZip();
        for (const item of downloads) { const response = await fetch(item.url); if (!response.ok) throw new Error('DOWNLOAD_ARQUIVO_FALHOU'); archive.file(item.nome, await response.blob()); }
        const content = await archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const link = document.createElement('a'); const objectUrl = URL.createObjectURL(content); const safeTitle = String(album.titulo || 'album').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'album';
        link.href = objectUrl; link.download = `${album.dataAtividade || 'sem-data'}_${safeTitle}.zip`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(objectUrl);
        toast.success('Álbum compactado e preparado para download.');
      } else {
        for (const item of downloads) { const link = document.createElement('a'); link.href = item.url; link.download = item.nome; document.body.appendChild(link); link.click(); link.remove(); }
        toast.success(`${downloads.length} arquivo(s) preparado(s) para download.`);
      }
    } catch (error) { console.error(error); toast.error(error?.message === 'ALBUM_MUITO_GRANDE_PARA_ZIP' ? 'O álbum ultrapassa 500 MB. Selecione menos arquivos para baixar.' : 'Não foi possível preparar o download.'); }
    finally { setUploadingMedia(false); }
  };
  const applyAlbumPublication = async (album, publishing) => {
    setUploadingMedia(true);
    try { await manageMemberAlbumOnServer({ action: 'save', albumId: album.id, album: { ...album, status: publishing ? 'publicado' : 'rascunho', revisaoAutorizacoesConfirmada: publishing } }); toast.success(publishing ? 'Álbum publicado.' : 'Álbum voltou para rascunho.'); setActiveAlbum(null); await load(); }
    catch (error) { console.error(error); toast.error('Não foi possível alterar a publicação do álbum.'); }
    finally { setUploadingMedia(false); }
  };
  const toggleAlbumPublish = album => {
    const publishing = album.status !== 'publicado';
    if (!publishing) { applyAlbumPublication(album, false); return; }
    setConfirmation({ title: 'Publicar álbum', message: 'Confirma que todos os membros identificáveis foram marcados e possuem autorização válida?', confirmText: 'Publicar álbum', variant: 'success', onConfirm: () => applyAlbumPublication(album, true) });
  };

  const birthdayMonth = useMemo(() => monthText(overview.mesAniversarios), [overview.mesAniversarios]);
  const calendarMonths = useMemo(() => [...new Map(overview.calendario.map(item => [calendarMonthKey(item.data), { key: calendarMonthKey(item.data), label: calendarMonthLabel(item.data) }])).values()], [overview.calendario]);
  const visibleCalendar = useMemo(() => overview.calendario.filter(item => !selectedCalendarMonth || calendarMonthKey(item.data) === selectedCalendarMonth), [overview.calendario, selectedCalendarMonth]);
  const albumYears = useMemo(() => [...new Set(overview.albuns.map(item => item.dataAtividade?.slice(0, 4)).filter(Boolean))].sort().reverse(), [overview.albuns]);
  const visibleAlbums = useMemo(() => overview.albuns.filter(item => {
    if (!isMediaCenter && item.status !== 'publicado') return false;
    const searchText = `${item.titulo} ${item.atividade} ${item.descricao} ${item.subdivisao}`.toLocaleLowerCase('pt-BR');
    return (!albumFilters.busca || searchText.includes(albumFilters.busca.toLocaleLowerCase('pt-BR')))
      && (albumFilters.status === 'todos' || item.status === albumFilters.status)
      && (!albumFilters.somenteRevisao || (item.status === 'rascunho' && item.quantidadeArquivos > 0))
      && (albumFilters.categoria === 'todas' || item.categoria === albumFilters.categoria)
      && (albumFilters.ano === 'todos' || item.dataAtividade?.startsWith(albumFilters.ano));
  }), [albumFilters, isMediaCenter, overview.albuns]);
  const mediaSummary = useMemo(() => ({
    preparacao: overview.albuns.filter(item => item.status === 'rascunho').length,
    revisao: overview.albuns.filter(item => item.status === 'rascunho' && item.quantidadeArquivos > 0).length,
    publicados: overview.albuns.filter(item => item.status === 'publicado').length,
  }), [overview.albuns]);
  const showAlbums = (status, somenteRevisao = false) => {
    setAlbumFilters(current => ({ ...current, status, somenteRevisao }));
    requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
  };

  return <div className="space-y-6">
    {isMediaCenter && <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-teal-700 to-indigo-700 p-7 text-white shadow-xl shadow-emerald-200 sm:p-9"><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100">Equipe de Mídia</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Central de Mídia</h1><p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-emerald-100">Receba, organize, revise e publique as fotos e os vídeos da Casa.</p></section>}
    {!isMediaCenter && <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-purple-700 p-7 text-white shadow-xl shadow-indigo-200 sm:p-9">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-100">Área do Membro</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Olá, {profile?.nome?.split(' ')[0] || 'Membro'}!</h1>
      <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-indigo-100">Acompanhe os avisos, as próximas atividades da Casa e os aniversariantes do mês.</p>
    </section>}

    {loadError ? <Card className="text-center"><p className="font-black text-rose-700">Não foi possível carregar {isMediaCenter ? 'a Central de Mídia' : 'a Área do Membro'}.</p><p className="mt-1 text-sm text-gray-500">Verifique sua conexão e tente novamente.</p><Button type="button" variant="secondary" className="mt-4" onClick={load}><RefreshCw size={16}/> Tentar novamente</Button></Card> : <div className={isMediaCenter ? 'hidden' : 'contents'}>
      <Card>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><BellRing size={22}/></div><div><h2 className="font-black text-gray-900">Mural de avisos</h2><p className="text-xs text-gray-500">Comunicados oficiais da Casa</p></div></div>{canManageNotices && !noticeDraft && <Button type="button" variant="warning" onClick={() => setNoticeDraft(emptyNotice())}><Plus size={16}/> Novo aviso</Button>}</div>
        {canManageNotices && noticeDraft && <form onSubmit={saveNotice} className="mt-5 space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4"><h3 className="font-black text-amber-950">{noticeDraft.id ? 'Editar aviso' : 'Publicar aviso'}</h3><input value={noticeDraft.titulo} maxLength={120} onChange={event => setNoticeDraft(current => ({ ...current, titulo: event.target.value }))} placeholder="Título do aviso" className="w-full rounded-xl border border-amber-200 bg-white p-3 text-sm font-bold outline-none focus:border-amber-500"/><textarea value={noticeDraft.mensagem} maxLength={1000} rows={4} onChange={event => setNoticeDraft(current => ({ ...current, mensagem: event.target.value }))} placeholder="Mensagem para os membros" className="w-full resize-y rounded-xl border border-amber-200 bg-white p-3 text-sm outline-none focus:border-amber-500"/><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-gray-600">Exibir a partir de<input type="date" required value={noticeDraft.inicioDia} onChange={event => setNoticeDraft(current => ({ ...current, inicioDia: event.target.value }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white p-3"/></label><label className="text-xs font-black text-gray-600">Exibir até (opcional)<input type="date" value={noticeDraft.fimDia} onChange={event => setNoticeDraft(current => ({ ...current, fimDia: event.target.value }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white p-3"/></label></div><label className="flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" checked={noticeDraft.destaque} onChange={event => setNoticeDraft(current => ({ ...current, destaque: event.target.checked }))}/> Fixar no topo do mural</label><div className="flex gap-2"><Button type="button" variant="secondary" className="flex-1" disabled={savingNotice} onClick={() => setNoticeDraft(null)}>Cancelar</Button><Button type="submit" variant="warning" className="flex-1" disabled={savingNotice}>{savingNotice ? 'Salvando...' : 'Publicar aviso'}</Button></div></form>}
        <div className="mt-5 space-y-3">{loading ? <p className="rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-400">Carregando avisos...</p> : overview.avisos.length ? overview.avisos.map(item => <article key={item.id} className={`rounded-2xl border p-4 ${item.destaque ? 'border-amber-300 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}><div className="flex items-start justify-between gap-3"><div>{item.destaque && <p className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-700"><Pin size={12}/> Aviso importante</p>}<h3 className="font-black text-gray-900">{item.titulo}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{item.mensagem}</p>{item.fimEm && <p className="mt-3 text-[11px] font-bold text-gray-400">Disponível até {new Date(item.fimEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}</div>{canManageNotices && <div className="flex shrink-0 gap-1"><button type="button" aria-label={`Editar ${item.titulo}`} onClick={() => editNotice(item)} className="rounded-lg p-2 text-indigo-600 hover:bg-white"><Pencil size={16}/></button><button type="button" aria-label={`Retirar ${item.titulo}`} onClick={() => archiveNotice(item)} className="rounded-lg p-2 text-rose-600 hover:bg-white"><Trash2 size={16}/></button></div>}</div></article>) : <p className="rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-500">Nenhum aviso publicado no momento.</p>}</div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2"><div className="mb-5 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><CalendarDays size={22}/></div><div><h2 className="font-black text-gray-900">Próximas atividades</h2><p className="text-xs text-gray-500">Programação disponível para membros</p></div></div>{loading ? <p className="rounded-2xl bg-gray-50 p-5 text-sm font-bold text-gray-400">Carregando calendário...</p> : overview.calendario.length ? <><div className="mb-4 flex gap-2 overflow-x-auto pb-1">{calendarMonths.map(month => <button key={month.key} type="button" onClick={() => setSelectedCalendarMonth(month.key)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-black capitalize ${selectedCalendarMonth === month.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{month.label}</button>)}</div><div className="space-y-3">{visibleCalendar.map(item => <article key={item.id} className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><p className="font-black text-gray-900">{item.titulo}</p>{item.servicos.length > 0 && <p className="mt-1 text-xs font-medium text-gray-600">{item.servicos.join(' • ')}</p>}</div><span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black capitalize text-indigo-700">{dateText(item.data)}</span></div>{item.horario && <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-gray-500"><Clock3 size={14}/> {item.horario}</p>}</article>)}</div></> : <p className="rounded-2xl bg-gray-50 p-5 text-sm font-bold text-gray-500">Nenhuma atividade para membros está programada.</p>}</Card>
        <Card><div className="mb-5 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pink-50 text-pink-700"><CakeSlice size={22}/></div><div><h2 className="font-black text-gray-900">Aniversariantes</h2><p className="text-xs capitalize text-gray-500">{birthdayMonth}</p></div></div>{loading ? <p className="rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-400">Carregando...</p> : overview.aniversariantes.length ? <div className="space-y-2">{overview.aniversariantes.map(item => <div key={item.id} className={`flex items-center justify-between rounded-2xl p-3 ${item.hoje ? 'bg-pink-100 text-pink-900' : 'bg-gray-50 text-gray-700'}`}><span className="font-bold">{item.nome}</span><span className="text-xs font-black">{String(item.dia).padStart(2, '0')}/{String(item.mes).padStart(2, '0')}{item.hoje ? ' • Hoje' : ''}</span></div>)}</div> : <p className="rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-500">Nenhum aniversário visível neste mês.</p>}<p className="mt-4 text-[11px] leading-relaxed text-gray-400">Por privacidade, não exibimos idade nem ano de nascimento.</p></Card>
      </div>
    </div>}

    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Images size={22}/></div><div><h2 className="font-black text-gray-900">{canManageAlbums ? 'Central de Mídia' : 'Fotos e vídeos'}</h2><p className="text-xs text-gray-500">{canManageAlbums ? 'Prepare, revise e publique os registros da Casa' : 'Álbuns autorizados da Casa'}</p></div></div>{canManageAlbums && !albumDraft && <Button type="button" onClick={() => setAlbumDraft(emptyAlbum())}><Plus size={16}/> Novo álbum</Button>}</div>
      {canManageAlbums && <><div className="mt-5 grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => showAlbums('rascunho')} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left"><p className="text-xs font-black uppercase text-amber-700">Em preparação</p><p className="mt-1 text-2xl font-black text-amber-950">{mediaSummary.preparacao}</p></button><button type="button" onClick={() => showAlbums('rascunho', true)} className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-left"><p className="text-xs font-black uppercase text-violet-700">Com arquivos para revisar</p><p className="mt-1 text-2xl font-black text-violet-950">{mediaSummary.revisao}</p></button><button type="button" onClick={() => showAlbums('publicado')} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left"><p className="text-xs font-black uppercase text-emerald-700">Publicados</p><p className="mt-1 text-2xl font-black text-emerald-950">{mediaSummary.publicados}</p></button></div><DirectMediaInbox albums={overview.albuns} onChanged={load} onOpenAlbum={openAlbum}/><DriveMediaInbox albums={overview.albuns} onImported={load}/></>}
      {canManageAlbums && overview.albunsArquivados?.length > 0 && <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4"><button type="button" onClick={() => setShowArchivedAlbums(current => !current)} className="flex w-full items-center justify-between gap-3 text-left"><span><span className="flex items-center gap-2 text-sm font-black text-amber-950"><Archive size={17}/> Álbuns retirados</span><span className="mt-1 block text-xs text-amber-800">Disponíveis para recuperação por 30 dias.</span></span><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-800">{overview.albunsArquivados.length}</span></button>{showArchivedAlbums && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{overview.albunsArquivados.map(item => <article key={item.id} className="overflow-hidden rounded-xl border border-amber-200 bg-white"><div className="flex h-28 items-center justify-center overflow-hidden bg-gray-100">{item.capaUrl ? <img src={item.capaUrl} alt={`Capa de ${item.titulo}`} className="h-full w-full object-cover opacity-75"/> : <Images className="text-gray-400" size={30}/>}</div><div className="p-3"><h4 className="font-black text-gray-900">{item.titulo}</h4><p className="mt-1 text-[11px] font-bold text-amber-800">Recuperável até {new Date(item.recuperarAte).toLocaleDateString('pt-BR')}</p><Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => restoreAlbum(item)}><RotateCcw size={15}/> Restaurar álbum</Button></div></article>)}</div>}</section>}
      {canManageAlbums && albumDraft && <form onSubmit={saveAlbum} className="mt-5 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <h3 className="font-black text-emerald-950">{albumDraft.id ? 'Editar álbum' : 'Criar álbum'}</h3>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-gray-600">Título *<input required maxLength={120} value={albumDraft.titulo} onChange={event => setAlbumDraft(current => ({ ...current, titulo: event.target.value }))} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm"/></label><label className="text-xs font-black text-gray-600">Data da atividade *<input type="date" required value={albumDraft.dataAtividade} onChange={event => setAlbumDraft(current => ({ ...current, dataAtividade: event.target.value }))} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm"/></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-black text-gray-600">Categoria<select value={albumDraft.categoria} onChange={event => setAlbumDraft(current => ({ ...current, categoria: event.target.value, subdivisao: '' }))} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm"><option value="">Sem categoria</option>{MEMBER_ALBUM_CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="text-xs font-black text-gray-600">Subdivisão<select value={albumDraft.subdivisao} disabled={!getMemberAlbumCategory(albumDraft.categoria)?.subdivisions.length} onChange={event => setAlbumDraft(current => ({ ...current, subdivisao: event.target.value }))} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm disabled:bg-gray-100"><option value="">Sem subdivisão</option>{(getMemberAlbumCategory(albumDraft.categoria)?.subdivisions || []).map(item => <option key={item} value={item}>{item}</option>)}</select></label></div>
        <label className="block text-xs font-black text-gray-600">Atividade ou evento<input maxLength={120} value={albumDraft.atividade} onChange={event => setAlbumDraft(current => ({ ...current, atividade: event.target.value }))} placeholder="Ex.: Confraternização da Casa" className="mt-1 w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm"/></label>
        <label className="block text-xs font-black text-gray-600">Descrição<textarea maxLength={600} rows={3} value={albumDraft.descricao} onChange={event => setAlbumDraft(current => ({ ...current, descricao: event.target.value }))} className="mt-1 w-full resize-y rounded-xl border border-emerald-200 bg-white p-3 text-sm"/></label>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><h4 className="text-sm font-black text-violet-950">Membros identificáveis nas imagens</h4><p className="mt-1 text-xs text-violet-800">Marque todos os membros que aparecem. Pendentes ou não autorizados impedem a publicação.</p><div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-xl bg-white p-2">{overview.autorizacoesImagem.length ? overview.autorizacoesImagem.map(item => <label key={item.pessoaId} className="flex items-center justify-between gap-3 rounded-lg p-2 text-xs font-bold hover:bg-gray-50"><span className="flex items-center gap-2"><input type="checkbox" checked={albumDraft.participantesIds.includes(item.pessoaId)} onChange={event => setAlbumDraft(current => ({ ...current, participantesIds: event.target.checked ? [...new Set([...current.participantesIds, item.pessoaId])] : current.participantesIds.filter(id => id !== item.pessoaId), revisaoAutorizacoesConfirmada: false }))}/>{item.nome}</span><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${item.status === 'autorizado' ? 'bg-emerald-100 text-emerald-800' : item.status === 'nao_autorizado' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'autorizado' ? 'Autorizado' : item.status === 'nao_autorizado' ? 'Não autorizado' : 'Pendente'}</span></label>) : <p className="p-2 text-xs font-bold text-gray-500">Nenhum membro ativo disponível.</p>}</div></div>
        <label className="block text-xs font-black text-gray-600">Visibilidade<select value={albumDraft.status} onChange={event => setAlbumDraft(current => ({ ...current, status: event.target.value, revisaoAutorizacoesConfirmada: false }))} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm"><option value="rascunho">Rascunho — somente equipe</option><option value="publicado">Publicado — visível aos membros</option></select></label>
        {albumDraft.status === 'publicado' && <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900"><input type="checkbox" className="mt-0.5" checked={albumDraft.revisaoAutorizacoesConfirmada} onChange={event => setAlbumDraft(current => ({ ...current, revisaoAutorizacoesConfirmada: event.target.checked }))}/><span>Confirmei que marquei todos os membros identificáveis e revisei suas autorizações.</span></label>}
        <p className="rounded-xl bg-white p-3 text-xs font-medium text-gray-500">Fotos, vídeos e capa são administrados ao abrir o álbum.</p>
        <div className="flex gap-2"><Button type="button" variant="secondary" className="flex-1" disabled={savingAlbum} onClick={() => setAlbumDraft(null)}>Cancelar</Button><Button type="submit" className="flex-1" disabled={savingAlbum}>{savingAlbum ? 'Salvando...' : 'Salvar álbum'}</Button></div>
      </form>}
      {canManageAlbums && <div className="mt-5 grid gap-3 rounded-2xl bg-gray-50 p-4 sm:grid-cols-2 xl:grid-cols-4"><label className="relative sm:col-span-2 xl:col-span-1"><Search className="absolute left-3 top-3 text-gray-400" size={17}/><input value={albumFilters.busca} onChange={event => setAlbumFilters(current => ({ ...current, busca: event.target.value }))} placeholder="Buscar álbum" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm"/></label><label className="relative"><Filter className="absolute left-3 top-3 text-gray-400" size={16}/><select aria-label="Filtrar por situação" value={albumFilters.somenteRevisao ? 'revisao' : albumFilters.status} onChange={event => setAlbumFilters(current => ({ ...current, status: event.target.value === 'revisao' ? 'rascunho' : event.target.value, somenteRevisao: event.target.value === 'revisao' }))} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm"><option value="todos">Todas as situações</option><option value="rascunho">Em preparação</option><option value="revisao">Com arquivos para revisar</option><option value="publicado">Publicados</option></select></label><select aria-label="Filtrar por categoria" value={albumFilters.categoria} onChange={event => setAlbumFilters(current => ({ ...current, categoria: event.target.value }))} className="rounded-xl border border-gray-200 bg-white p-2.5 text-sm"><option value="todas">Todas as categorias</option>{MEMBER_ALBUM_CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select aria-label="Filtrar por ano" value={albumFilters.ano} onChange={event => setAlbumFilters(current => ({ ...current, ano: event.target.value }))} className="rounded-xl border border-gray-200 bg-white p-2.5 text-sm"><option value="todos">Todos os anos</option>{albumYears.map(year => <option key={year} value={year}>{year}</option>)}</select></div>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{loading ? <p className="rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-400">Carregando álbuns...</p> : visibleAlbums.length ? visibleAlbums.map(item => <article key={item.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><button type="button" onClick={() => openAlbum(item)} className="block w-full text-left"><div className="flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-indigo-600 text-white">{item.capaUrl ? <img src={item.capaUrl} alt={`Capa de ${item.titulo}`} className="h-full w-full object-cover"/> : <Images size={34}/>}</div><div className="p-4">{item.categoria && <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-indigo-600">{getMemberAlbumCategory(item.categoria)?.label || item.categoria}{item.subdivisao ? ` • ${item.subdivisao}` : ''}</p>}<div className="flex items-start justify-between gap-2"><div><h3 className="font-black text-gray-900">{item.titulo}</h3><p className="mt-1 text-xs font-bold text-emerald-700">{new Date(`${item.dataAtividade}T12:00:00`).toLocaleDateString('pt-BR')}{item.atividade ? ` • ${item.atividade}` : ''}</p></div>{canManageAlbums && <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${item.status === 'publicado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.status === 'publicado' ? 'Publicado' : 'Em preparação'}</span>}</div>{item.descricao && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-500">{item.descricao}</p>}<div className="mt-4 flex items-center justify-between"><span className="text-[11px] font-bold text-gray-400">{item.quantidadeArquivos} arquivo(s)</span><span className="flex items-center gap-1 text-xs font-black text-indigo-600"><Eye size={14}/> Abrir álbum</span></div></div></button></article>) : <p className="rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-500">Nenhum álbum encontrado com esses filtros.</p>}</div>
    </Card>
    <MemberAlbumModal album={activeAlbum} authorizations={overview.autorizacoesImagem} canManage={canManageAlbums} busy={uploadingMedia} onClose={() => setActiveAlbum(null)} onEdit={editAlbum} onUpload={uploadMedia} onSetCover={setAlbumCover} onDeleteFile={deleteAlbumFile} onReorder={reorderAlbumFiles} onUpdateDetails={updateAlbumFileDetails} onDownload={downloadAlbumFiles} onTogglePublish={toggleAlbumPublish} onArchive={async album => { await archiveAlbum(album); setActiveAlbum(null); }}/>
    <ConfirmDialog isOpen={!!confirmation} onClose={() => setConfirmation(null)} onConfirm={async () => { await confirmation?.onConfirm?.(); setConfirmation(null); }} title={confirmation?.title} message={confirmation?.message} confirmText={confirmation?.confirmText} variant={confirmation?.variant || 'danger'}/>
    <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900"><ShieldCheck className="mt-0.5 shrink-0" size={20}/><p><strong>Acesso protegido.</strong> Avisos retirados e álbuns em rascunho não são enviados aos membros.</p></div>
  </div>;
};
