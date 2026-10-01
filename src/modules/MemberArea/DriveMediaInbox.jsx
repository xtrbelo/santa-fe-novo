import React, { useState } from 'react';
import { CheckSquare, CloudDownload, FolderInput, RefreshCw, Square } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { manageDriveMediaInboxOnServer } from '../../services/firebaseFunctions';
import { useToast } from '../../components/ui/useToast';

const sizeText = value => value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`;

export function DriveMediaInbox({ albums, onImported }) {
  const [files, setFiles] = useState([]); const [selected, setSelected] = useState([]); const [albumId, setAlbumId] = useState('');
  const [loading, setLoading] = useState(false); const [open, setOpen] = useState(false); const toast = useToast();
  const load = async () => {
    setLoading(true);
    try { const result = await manageDriveMediaInboxOnServer({ action: 'list' }); setFiles(result.files || []); setOpen(true); }
    catch (error) { console.error(error); toast.error('Não foi possível acessar a pasta de entrada do Google Drive.'); }
    finally { setLoading(false); }
  };
  const toggle = id => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 10 ? [...current, id] : current);
  const importFiles = async () => {
    if (!albumId || !selected.length) { toast.error('Escolha um álbum e pelo menos um arquivo.'); return; }
    setLoading(true);
    try {
      const result = await manageDriveMediaInboxOnServer({ action: 'import', albumId, fileIds: selected });
      toast.success(`${result.imported} arquivo(s) importado(s) para o álbum.`); setSelected([]); await load(); await onImported?.();
    } catch (error) { console.error(error); toast.error('Não foi possível importar os arquivos selecionados.'); }
    finally { setLoading(false); }
  };
  return <div className="mt-4 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 p-4">
    <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => open ? setOpen(false) : load()}><span className="flex items-start gap-3"><FolderInput className="mt-0.5 shrink-0 text-indigo-600" size={21}/><span><span className="block text-sm font-black text-indigo-950">Importar do Google Drive</span><span className="mt-1 block text-xs leading-relaxed text-indigo-700">Opção secundária para trazer arquivos da pasta 00 - ENTRADA. O original permanece no Drive.</span></span></span><span className="rounded-xl bg-white px-3 py-2 text-xs font-black text-indigo-700">{loading ? 'Carregando...' : open ? 'Recolher' : 'Abrir'}</span></button>
    {open && <div className="mt-4 rounded-2xl bg-white p-3"><div className="mb-3 flex justify-end"><Button type="button" variant="secondary" disabled={loading} onClick={load}>{loading ? <RefreshCw className="animate-spin" size={16}/> : <CloudDownload size={16}/>} Atualizar</Button></div><div className="grid gap-3 sm:grid-cols-[1fr_auto]"><select aria-label="Álbum de destino" value={albumId} onChange={event => setAlbumId(event.target.value)} className="rounded-xl border border-indigo-100 p-3 text-sm"><option value="">Selecione o álbum de destino</option>{albums.map(album => <option key={album.id} value={album.id}>{album.titulo} — {album.status === 'publicado' ? 'Publicado' : 'Em preparação'}</option>)}</select><Button type="button" disabled={loading || !albumId || !selected.length} onClick={importFiles}>Importar selecionados ({selected.length})</Button></div><p className="mt-2 text-[11px] text-gray-500">Selecione até 10 arquivos por importação. Arquivos já importados ficam identificados e não são duplicados.</p><div className="mt-3 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">{files.length ? files.map(file => <button key={file.id} type="button" disabled={file.importado} onClick={() => toggle(file.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${file.importado ? 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-60' : selected.includes(file.id) ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-indigo-200'}`}>{selected.includes(file.id) ? <CheckSquare className="shrink-0 text-indigo-600" size={19}/> : <Square className="shrink-0 text-gray-400" size={19}/>}<span className="min-w-0"><span className="block truncate text-xs font-black text-gray-800">{file.nome}</span><span className="mt-1 block text-[10px] text-gray-500">{file.tipo.startsWith('video/') ? 'Vídeo' : 'Foto'} • {sizeText(file.tamanho)}{file.importado ? ' • Já importado' : ''}</span></span></button>) : <p className="col-span-full rounded-xl bg-gray-50 p-4 text-sm font-bold text-gray-500">Nenhuma foto ou vídeo compatível na pasta de entrada.</p>}</div></div>}
  </div>;
}
