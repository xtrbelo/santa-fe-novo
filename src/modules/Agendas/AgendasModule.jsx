import React, { useState, useEffect } from 'react';
import { 
  getAppCollection, 
  onSnapshot, 
  addDoc, 
  Timestamp 
} from '../../services/firebase';
import { AgendaAdminCard } from './AgendaAdminCard';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/useToast';
import { 
  Plus, 
  Filter, 
  CalendarDays, 
  Trash2, 
  Tag 
} from 'lucide-react';

export const AgendasModule = ({ user }) => {
  const [agendas, setAgendas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [tiposPessoa, setTiposPessoa] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [novasAgendas, setNovasAgendas] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [mostrarPassado, setMostrarPassado] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toast = useToast();

  useEffect(() => {
    if (!user) return;
    const unsubA = onSnapshot(getAppCollection('agendas'), (s) => 
      setAgendas(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubE = onSnapshot(getAppCollection('config_eventos'), (s) => 
      setEventos(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.ativo !== false))
    );
    const unsubS = onSnapshot(getAppCollection('config_servicos'), (s) => 
      setServicos(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.ativo !== false))
    );
    const unsubT = onSnapshot(getAppCollection('config_tipos_pessoa'), (s) => 
      setTiposPessoa(s.docs.map(d => d.data()).filter(item => item.ativo !== false).map(item => item.nome))
    );
    return () => { unsubA(); unsubE(); unsubS(); unsubT(); };
  }, [user]);

  const filtradas = agendas
    .filter(a => {
      if (!mostrarPassado) {
        const hoje = new Date(); 
        hoje.setHours(0, 0, 0, 0);
        if (a.data?.toDate() < hoje) return false;
      }
      return filtroTipo ? a.tipo === filtroTipo : true;
    })
    .sort((a, b) => (a.data?.toMillis() || 0) - (b.data?.toMillis() || 0));

  const addRow = () => {
    setNovasAgendas([
      ...novasAgendas, 
      { data: '', tipoId: eventos[0]?.id || '', vagas: {} }
    ]);
  };

  const updateRow = (idx, field, val) => {
    const updated = [...novasAgendas];
    if (field.startsWith('vaga_')) {
      const sId = field.split('_')[1];
      updated[idx].vagas = { ...updated[idx].vagas, [sId]: parseInt(val, 10) || 0 };
    } else {
      updated[idx][field] = val;
    }
    setNovasAgendas(updated);
  };

  const removeRow = (idx) => {
    setNovasAgendas(novasAgendas.filter((_, i) => i !== idx));
  };

  const create = async (e) => {
    e.preventDefault();
    if (!novasAgendas.length) return;

    setIsSubmitting(true);
    try {
      await Promise.all(
        novasAgendas.map(a => {
          const ev = eventos.find(e => e.id === a.tipoId);
          return addDoc(getAppCollection('agendas'), {
            data: Timestamp.fromDate(new Date(a.data + 'T12:00:00')),
            tipo: ev?.nome || 'Trabalho',
            tiposPessoaPermitidos: ev?.tiposPessoaPermitidos || [],
            vagasTotais: a.vagas,
            vagasOcupadas: Object.keys(a.vagas).reduce((acc, k) => ({ ...acc, [k]: 0 }), {}),
            status: 'Agendada',
            ativo: true,
            criadoEm: Timestamp.now(),
            criadoPor: user.uid,
            atualizadoEm: Timestamp.now(),
            atualizadoPor: user.uid
          });
        })
      );
      toast.success(`${novasAgendas.length} data(s) de agenda criada(s) com sucesso!`);
      setIsModalOpen(false); 
      setNovasAgendas([]);
    } catch (err) { 
      console.error(err);
      toast.error('Erro ao cadastrar novas agendas.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <header className="flex justify-between items-end gap-4 px-1">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tighter uppercase italic leading-none">
            Agendas
          </h2>
          <p className="text-gray-500 font-medium text-xs sm:text-sm mt-1">
            Gerenciamento e abertura de calendários
          </p>
        </div>
        <Button 
          variant="warning" 
          onClick={() => { 
            setNovasAgendas([{ data: '', tipoId: eventos[0]?.id || '', vagas: {} }]); 
            setIsModalOpen(true); 
          }} 
          className="rounded-full w-12 h-12 p-0 shadow-lg shadow-amber-500/30 shrink-0"
        >
          <Plus size={24} />
        </Button>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex items-center bg-white px-4 py-1.5 rounded-2xl border border-gray-100 shadow-sm">
          <Filter size={18} className="text-amber-500 mr-3 shrink-0" />
          <select 
            value={filtroTipo} 
            onChange={e => setFiltroTipo(e.target.value)} 
            className="w-full bg-transparent border-none outline-none text-sm font-bold text-gray-700 py-2.5 cursor-pointer"
          >
            <option value="">Todos os Tipos de Agenda...</option>
            {eventos.map(e => (
              <option key={e.id} value={e.nome}>{e.nome}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 px-2 cursor-pointer select-none">
          <input 
            type="checkbox" 
            checked={mostrarPassado} 
            onChange={e => setMostrarPassado(e.target.checked)} 
            className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 cursor-pointer" 
          />
          Mostrar Histórico Passado
        </label>
      </div>

      <div className="space-y-4">
        {filtradas.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
            <CalendarDays className="mx-auto text-gray-300 mb-3" size={36} />
            <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">
              Nenhuma agenda encontrada
            </p>
          </div>
        ) : (
          filtradas.map(a => (
            <AgendaAdminCard 
              key={a.id} 
              agenda={a} 
              user={user} 
              servicosCatalogo={servicos} 
              tiposPessoaGlobais={tiposPessoa} 
            />
          ))
        )}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Adicionar Novas Datas"
      >
        <form onSubmit={create} className="space-y-6">
          {novasAgendas.map((na, i) => (
            <div key={i} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                  Data {i + 1}
                </span>
                {novasAgendas.length > 1 && (
                  <button 
                    type="button" 
                    onClick={() => removeRow(i)} 
                    className="text-rose-400 hover:text-rose-600 transition-colors p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input 
                  type="date" 
                  value={na.data} 
                  onChange={e => updateRow(i, 'data', e.target.value)} 
                  required 
                  className="w-full bg-white px-3 py-2.5 rounded-xl border border-gray-200 font-bold text-sm outline-none focus:border-amber-500" 
                />
                <select 
                  value={na.tipoId} 
                  onChange={e => updateRow(i, 'tipoId', e.target.value)} 
                  required 
                  className="w-full bg-white px-3 py-2.5 rounded-xl border border-gray-200 font-bold text-sm outline-none focus:border-amber-500 cursor-pointer"
                >
                  {eventos.map(e => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </div>
              {servicos.filter(s => s.requerVagas).map(s => (
                <div key={s.id} className="flex items-center justify-between bg-white px-3.5 py-2.5 rounded-xl border border-gray-100">
                  <span className="text-[11px] font-black uppercase text-gray-500 flex items-center gap-1.5">
                    <Tag size={13} className="text-amber-500"/> {s.nome}
                  </span>
                  <input 
                    type="number" 
                    placeholder="Vagas" 
                    min="0"
                    onChange={e => updateRow(i, `vaga_${s.id}`, e.target.value)} 
                    className="w-20 text-right font-bold text-sm bg-transparent outline-none focus:text-amber-600" 
                  />
                </div>
              ))}
            </div>
          ))}
          <Button 
            onClick={addRow} 
            variant="secondary" 
            className="w-full border-2 border-dashed border-gray-300 bg-transparent text-gray-500 hover:bg-gray-50"
          >
            <Plus size={16}/> Adicionar mais uma data
          </Button>
          <Button 
            type="submit" 
            variant="warning" 
            disabled={isSubmitting}
            className="w-full py-4 text-base"
          >
            {isSubmitting ? 'Gravando...' : 'Confirmar Agendas'}
          </Button>
        </form>
      </Modal>
    </div>
  );
};
