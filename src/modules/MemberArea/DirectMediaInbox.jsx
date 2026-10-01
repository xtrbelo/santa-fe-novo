import React, { useEffect, useState } from 'react';
import { Archive, Camera, CheckCircle2, Copy, FileVideo2, FolderInput, HardDrive, Image as ImageIcon, LoaderCircle, Plus, RefreshCw, RotateCcw, Search, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { manageMemberAlbumOnServer, manageMemberMediaOnServer } from '../../services/firebaseFunctions';
import { useToast } from '../../components/ui/useToast';

const MAX_FILES = 20;
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']);
const validFile = file => acceptedTypes.has(file.type) && file.size > 0 && (file.type.startsWith('image/') ? file.size <= 10 * 1024 * 1024 : file.size <= 200 * 1024 * 1024);
const formatBytes = value => { const bytes = Math.max(0, Number(value) || 0); if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`; if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`; return `${(bytes / 1024 ** 3).toFixed(2)} GB`; };
const uploadFile = (url, file, onProgress) => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open('PUT', url);
  request.setRequestHeader('Content-Type', file.type);
  request.upload.addEventListener('progress', event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); });
  request.addEventListener('load', () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('ENVIO_R2_FALHOU')));
  request.addEventListener('error', () => reject(new Error('ENVIO_R2_FALHOU')));
  request.send(file);
});

export function DirectMediaInbox({ albums = [], onChanged, onOpenAlbum }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [items, setItems] = useState([]);
  const [archivedItems, setArchivedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [destinationAlbumId, setDestinationAlbumId] = useState('');
  const [organizing, setOrganizing] = useState(false);
  const [newAlbum, setNewAlbum] = useState(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [duplicateFiles, setDuplicateFiles] = useState([]);
  const [storageSummary, setStorageSummary] = useState({ totalBytes: 0, totalArquivos: 0, duplicados: 0, economiaPossivelBytes: 0 });
  const [confirmation, setConfirmation] = useState(null);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try { const result = await manageMemberMediaOnServer({ action: 'list-inbox' }); setItems(result.files || []); setArchivedItems(result.archived || []); setDuplicateFiles(result.repetidos || []); setStorageSummary(result.armazenamento || { totalBytes: 0, totalArquivos: 0, duplicados: 0, economiaPossivelBytes: 0 }); setSelectedIds([]); }
    catch (error) { console.error(error); toast.error('Não foi possível carregar a entrada de mídia.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseFiles = selected => {
    const next = [...selected];
    if (next.length > MAX_FILES) {
      setSelectedFiles([]);
      toast.error(`Você selecionou ${next.length} arquivos. O limite é ${MAX_FILES} por envio. Nenhum arquivo foi adicionado.`);
      return;
    }
    const invalid = next.filter(file => !validFile(file));
    if (invalid.length) {
      setSelectedFiles([]);
      toast.error(`${invalid.length} arquivo(s) não atendem ao tipo ou tamanho permitido. Nenhum arquivo foi adicionado.`);
      return;
    }
    setSelectedFiles(next);
  };

  const send = async () => {
    if (!selectedFiles.length) return;
    setSending(true);
    const queue = selectedFiles.map((file, index) => ({ localId: `${file.name}-${file.size}-${index}`, file, nome: file.name, tipo: file.type, tamanho: file.size, progresso: 0, status: 'aguardando' }));
    setItems(current => [...queue, ...current]);
    let successes = 0;
    const failed = [];
    for (const queued of queue) {
      try {
        setItems(current => current.map(item => item.localId === queued.localId ? { ...item, status: 'enviando' } : item));
        const ticket = await manageMemberMediaOnServer({ action: 'create-inbox-upload', fileName: queued.file.name, contentType: queued.file.type, size: queued.file.size });
        await uploadFile(ticket.uploadUrl, queued.file, progresso => setItems(current => current.map(item => item.localId === queued.localId ? { ...item, progresso } : item)));
        await manageMemberMediaOnServer({ action: 'confirm-inbox-upload', mediaId: ticket.mediaId });
        setItems(current => current.map(item => item.localId === queued.localId ? { ...item, id: ticket.mediaId, progresso: 100, status: 'concluido' } : item));
        successes += 1;
      } catch (error) {
        console.error(error);
        failed.push(queued);
        setItems(current => current.map(item => item.localId === queued.localId ? { ...item, status: 'erro' } : item));
      }
    }
    setSelectedFiles(failed.map(item => item.file)); setSending(false);
    if (successes) toast.success(`${successes} arquivo(s) enviado(s) para a entrada.`);
    if (successes !== queue.length) toast.error(`${queue.length - successes} arquivo(s) não foram enviados.`);
    if (!failed.length) await load();
  };

  const finishOrganization = async message => {
    toast.success(message); setSelectedIds([]); setDestinationAlbumId(''); setNewAlbum(null); await load(); await onChanged?.();
  };
  const organize = async (action, confirmed = false) => {
    if (!selectedIds.length) return;
    if (action === 'move-inbox' && !destinationAlbumId) { toast.error('Escolha o álbum de destino.'); return; }
    if (action === 'delete-inbox' && !confirmed) { setConfirmation({ title: 'Excluir arquivos', message: `Excluir definitivamente ${selectedIds.length} arquivo(s) da entrada? Esta ação não poderá ser desfeita.`, confirmText: 'Excluir definitivamente', onConfirm: () => organize(action, true) }); return; }
    setOrganizing(true);
    try {
      await manageMemberMediaOnServer({ action, mediaIds: selectedIds, albumId: destinationAlbumId });
      await finishOrganization(action === 'move-inbox' ? 'Arquivos movidos. O álbum ficou em preparação para nova revisão.' : action === 'archive-inbox' ? 'Arquivos arquivados.' : 'Arquivos excluídos.');
    } catch (error) { console.error(error); toast.error('Não foi possível concluir a ação com os arquivos selecionados.'); }
    finally { setOrganizing(false); }
  };
  const createAlbumAndMove = async event => {
    event.preventDefault();
    if (!newAlbum?.titulo?.trim() || !newAlbum?.dataAtividade || !selectedIds.length) return;
    setOrganizing(true);
    try {
      const created = await manageMemberAlbumOnServer({ action: 'save', album: { titulo: newAlbum.titulo, atividade: '', categoria: '', subdivisao: '', dataAtividade: newAlbum.dataAtividade, descricao: '', status: 'rascunho', participantesIds: [], revisaoAutorizacoesConfirmada: false } });
      await manageMemberMediaOnServer({ action: 'move-inbox', mediaIds: selectedIds, albumId: created.albumId });
      await finishOrganization('Álbum criado com os arquivos selecionados.');
    } catch (error) { console.error(error); toast.error('Não foi possível criar o álbum com a seleção.'); }
    finally { setOrganizing(false); }
  };
  const manageArchived = async (item, action, confirmed = false) => {
    if (action === 'delete-inbox' && !confirmed) { setConfirmation({ title: 'Excluir arquivo', message: `Excluir definitivamente “${item.nome}”? Esta ação não poderá ser desfeita.`, confirmText: 'Excluir definitivamente', onConfirm: () => manageArchived(item, action, true) }); return; }
    setOrganizing(true);
    try {
      await manageMemberMediaOnServer({ action, mediaIds: [item.id] });
      toast.success(action === 'restore-inbox' ? 'Arquivo restaurado para a entrada.' : 'Arquivo excluído definitivamente.');
      await load();
    } catch (error) { console.error(error); toast.error('Não foi possível concluir a ação.'); }
    finally { setOrganizing(false); }
  };
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const visibleItems = items.filter(item => !normalizedSearch || item.nome.toLocaleLowerCase('pt-BR').includes(normalizedSearch));
  const visibleArchived = archivedItems.filter(item => !normalizedSearch || item.nome.toLocaleLowerCase('pt-BR').includes(normalizedSearch));

  return <section className="mt-5 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/60">
    <ConfirmDialog isOpen={!!confirmation} onClose={() => setConfirmation(null)} onConfirm={async () => { await confirmation?.onConfirm?.(); setConfirmation(null); }} title={confirmation?.title} message={confirmation?.message} confirmText={confirmation?.confirmText}/>
    <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-600 p-2.5 text-white"><Camera size={21}/></div><div><h3 className="text-sm font-black text-emerald-950">Entrada direta pelo celular</h3><p className="mt-1 text-xs leading-relaxed text-emerald-800">Envie fotos e vídeos para uma área privada. A organização em álbuns será feita depois.</p></div></div>
      <Button type="button" variant="secondary" disabled={loading || sending} onClick={load}><RefreshCw className={loading ? 'animate-spin' : ''} size={16}/> Atualizar</Button>
    </div>
    <div className="border-t border-emerald-200 bg-white/70 p-4">
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase text-sky-800"><HardDrive size={14}/> Armazenamento</p><p className="mt-1 text-lg font-black text-sky-950">{formatBytes(storageSummary.totalBytes)}</p><p className="text-[10px] text-sky-700">{storageSummary.totalArquivos} arquivo(s) privados</p></div>
        <button type="button" aria-expanded={duplicatesOnly} onClick={() => setDuplicatesOnly(current => !current)} className={`rounded-xl border p-3 text-left transition ${duplicatesOnly ? 'border-violet-500 bg-violet-100 ring-2 ring-violet-100' : 'border-violet-200 bg-violet-50 hover:border-violet-400'}`}><p className="flex items-center gap-1.5 text-[10px] font-black uppercase text-violet-800"><Copy size={14}/> Repetidos</p><p className="mt-1 text-lg font-black text-violet-950">{storageSummary.duplicados}</p><p className="text-[10px] font-bold text-violet-700">{duplicatesOnly ? 'Clique para recolher a revisão' : `Clique para localizar • até ${formatBytes(storageSummary.economiaPossivelBytes)} revisáveis`}</p></button>
      </div>
      {duplicatesOnly && <section className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-black text-violet-950">Revisão de arquivos repetidos</h4><p className="mt-1 text-xs text-violet-800">A contagem representa cópias excedentes. Confira a localização antes de remover qualquer arquivo pelo álbum.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-800">{duplicateFiles.length} arquivo(s)</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{duplicateFiles.length ? duplicateFiles.map(item => <article key={`${item.origem}-${item.id}`} className="overflow-hidden rounded-xl border border-violet-200 bg-white"><div className="flex h-28 items-center justify-center overflow-hidden bg-gray-100">{item.tipo?.startsWith('image/') ? <img src={item.url} alt={item.nome} className="h-full w-full object-cover"/> : <FileVideo2 className="text-indigo-600" size={28}/>}</div><div className="p-3"><p className="truncate text-xs font-black text-gray-900">{item.nome}</p><p className="mt-1 text-[10px] font-bold text-violet-700">{item.duplicidade === 'confirmada' ? 'Conteúdo repetido confirmado' : 'Possível repetição por nome e tamanho'}</p><p className="mt-1 text-[11px] text-gray-600">Local: {item.albumTitulo ? `Álbum “${item.albumTitulo}”` : 'Entrada direta'}</p>{item.albumId && <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => onOpenAlbum?.(albums.find(album => album.id === item.albumId))}><FolderInput size={15}/> Abrir álbum</Button>}</div></article>) : <p className="col-span-full rounded-xl bg-white p-4 text-center text-xs font-bold text-gray-500">Nenhum arquivo repetido foi localizado.</p>}</div></section>}
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-white p-5 text-center hover:bg-emerald-50">
        <UploadCloud className="text-emerald-600" size={30}/><span className="mt-2 text-sm font-black text-emerald-950">Selecionar fotos ou vídeos</span><span className="mt-1 text-[11px] text-gray-500">Até {MAX_FILES} por envio • imagens até 10 MB • vídeos até 200 MB</span>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" disabled={sending} onChange={event => { chooseFiles(event.target.files || []); event.target.value = ''; }} className="sr-only"/>
      </label>
      {selectedFiles.length > 0 && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-100 p-3"><p className="text-xs font-black text-emerald-950">Prontos para enviar: {selectedFiles.length} arquivo(s)</p><p className="mt-1 truncate text-[11px] text-emerald-800">{selectedFiles.slice(0, 3).map(file => file.name).join(' • ')}{selectedFiles.length > 3 ? ` • +${selectedFiles.length - 3}` : ''}</p><div className="mt-3 grid grid-cols-2 gap-2"><Button type="button" variant="secondary" disabled={sending} onClick={() => setSelectedFiles([])}>Cancelar seleção</Button><Button type="button" disabled={sending} onClick={send}>{sending ? <LoaderCircle className="animate-spin" size={16}/> : <UploadCloud size={16}/>} {sending ? 'Enviando...' : 'Enviar arquivos'}</Button></div></div>}
      {(items.length > 0 || archivedItems.length > 0) && <label className="relative mt-5 block"><Search className="absolute left-3 top-3 text-gray-400" size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar arquivo pelo nome" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm"/></label>}
      {items.length > 0 && <div className="mt-5 flex items-center justify-between"><h4 className="text-xs font-black uppercase tracking-wide text-gray-700">Arquivos na entrada</h4><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-800">{visibleItems.length} de {items.length}</span></div>}
      {visibleItems.length > 0 && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setSelectedIds(visibleItems.map(item => item.id).filter(Boolean))} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-black text-gray-700">Selecionar resultados</button>{selectedIds.length > 0 && <button type="button" onClick={() => setSelectedIds([])} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-black text-gray-700">Limpar seleção</button>}</div>}
      {selectedIds.length > 0 && <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-sm font-black text-indigo-950">{selectedIds.length} arquivo(s) selecionado(s)</p><p className="mt-1 text-[11px] text-indigo-700">Ao adicionar arquivos, um álbum já publicado volta para preparação até ser revisado novamente.</p><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><select aria-label="Álbum de destino" value={destinationAlbumId} onChange={event => setDestinationAlbumId(event.target.value)} className="rounded-xl border border-indigo-200 bg-white p-3 text-sm"><option value="">Escolha um álbum existente</option>{albums.filter(album => album.status !== 'arquivado').map(album => <option key={album.id} value={album.id}>{album.titulo} — {album.status === 'publicado' ? 'Publicado' : 'Em preparação'}</option>)}</select><Button type="button" disabled={organizing || !destinationAlbumId} onClick={() => organize('move-inbox')}><FolderInput size={16}/> Mover para álbum</Button></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><Button type="button" variant="secondary" disabled={organizing} onClick={() => setNewAlbum({ titulo: '', dataAtividade: new Date().toISOString().slice(0, 10) })}><Plus size={16}/> Criar álbum</Button><Button type="button" variant="secondary" disabled={organizing} onClick={() => organize('archive-inbox')}><Archive size={16}/> Arquivar</Button><Button type="button" variant="danger" disabled={organizing} onClick={() => organize('delete-inbox')}><Trash2 size={16}/> Excluir</Button></div>{newAlbum && <form onSubmit={createAlbumAndMove} className="mt-3 grid gap-2 rounded-xl border border-indigo-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto]"><input required maxLength={120} value={newAlbum.titulo} onChange={event => setNewAlbum(current => ({ ...current, titulo: event.target.value }))} placeholder="Nome do novo álbum" className="rounded-xl border border-gray-200 p-3 text-sm"/><input required type="date" value={newAlbum.dataAtividade} onChange={event => setNewAlbum(current => ({ ...current, dataAtividade: event.target.value }))} className="rounded-xl border border-gray-200 p-3 text-sm"/><Button type="submit" disabled={organizing}>{organizing ? 'Criando...' : 'Criar e mover'}</Button></form>}</div>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{visibleItems.map((item, index) => <article key={item.id || item.localId || `${item.nome}-${index}`} className={`relative overflow-hidden rounded-xl border-2 bg-white ${selectedIds.includes(item.id) ? 'border-indigo-600 ring-2 ring-indigo-100' : item.duplicadoPossivel ? 'border-violet-400' : 'border-gray-200'}`}><label className="absolute left-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white shadow"><input type="checkbox" aria-label={`Selecionar ${item.nome}`} disabled={!item.id || organizing} checked={selectedIds.includes(item.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...new Set([...current, item.id])] : current.filter(id => id !== item.id))}/></label>{item.duplicadoPossivel && <span className="absolute right-2 top-2 z-10 rounded-full bg-violet-700 px-2 py-1 text-[9px] font-black text-white"><Copy className="mr-1 inline" size={10}/> {item.duplicidade === 'confirmada' ? 'Repetido' : 'Possível repetido'}</span>}<div className="flex aspect-square items-center justify-center overflow-hidden bg-gray-100">{item.url && item.tipo?.startsWith('image/') ? <img src={item.url} alt={item.nome} className="h-full w-full object-cover"/> : item.tipo?.startsWith('video/') ? <FileVideo2 className="text-indigo-600" size={30}/> : <ImageIcon className="text-emerald-600" size={30}/>}</div><div className="p-2"><p className="truncate text-[11px] font-bold text-gray-700">{item.nome}</p>{item.status === 'enviando' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-emerald-500" style={{ width: `${item.progresso || 0}%` }}/></div>}{item.status === 'concluido' && <p className="mt-1 flex items-center gap-1 text-[10px] font-black text-emerald-700"><CheckCircle2 size={11}/> Enviado</p>}{item.status === 'erro' && <p className="mt-1 flex items-center gap-1 text-[10px] font-black text-rose-700"><XCircle size={11}/> Falhou</p>}{!item.status && <p className="mt-1 flex items-center gap-1 text-[10px] font-black text-emerald-700"><CheckCircle2 size={11}/> Na entrada</p>}</div></article>)}</div>
      {!loading && !items.length && <p className="mt-4 rounded-xl bg-gray-50 p-4 text-center text-xs font-bold text-gray-500">A entrada está vazia.</p>}
      {archivedItems.length > 0 && <section className="mt-5 border-t border-gray-200 pt-4"><button type="button" onClick={() => setShowArchived(current => !current)} className="flex w-full items-center justify-between rounded-xl bg-amber-50 p-3 text-left"><span><span className="flex items-center gap-2 text-xs font-black uppercase text-amber-900"><Archive size={16}/> Arquivados</span><span className="mt-1 block text-[10px] font-bold text-amber-800">Recuperação disponível por 30 dias</span></span><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-amber-800">{archivedItems.length}</span></button>{showArchived && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{visibleArchived.map(item => <article key={item.id} className="overflow-hidden rounded-xl border border-amber-200 bg-white"><div className="flex aspect-square items-center justify-center overflow-hidden bg-gray-100 opacity-75">{item.tipo?.startsWith('image/') ? <img src={item.url} alt={item.nome} className="h-full w-full object-cover"/> : <FileVideo2 className="text-indigo-600" size={30}/>}</div><div className="p-2"><p className="truncate text-[11px] font-bold text-gray-700">{item.nome}</p><p className={`mt-1 text-[10px] font-black ${item.recuperavel ? 'text-amber-700' : 'text-rose-700'}`}>{item.recuperavel && item.recuperarAte ? `Recuperável até ${new Date(item.recuperarAte).toLocaleDateString('pt-BR')}` : 'Prazo de recuperação encerrado'}</p><div className="mt-2 grid gap-1">{item.recuperavel && <button type="button" disabled={organizing} onClick={() => manageArchived(item, 'restore-inbox')} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-50 px-2 py-2 text-[10px] font-black text-emerald-800"><RotateCcw size={12}/> Restaurar</button>}<button type="button" disabled={organizing} onClick={() => manageArchived(item, 'delete-inbox')} className="flex items-center justify-center gap-1 rounded-lg bg-rose-50 px-2 py-2 text-[10px] font-black text-rose-800"><Trash2 size={12}/> Excluir definitivamente</button></div></div></article>)}</div>}</section>}
    </div>
  </section>;
}
