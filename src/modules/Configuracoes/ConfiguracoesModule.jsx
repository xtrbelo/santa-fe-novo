import React, { useState, useEffect } from 'react';
import { 
  getAppCollection, 
  getAppDoc, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  Timestamp
} from '../../services/firebase';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/useToast';
import { 
  UserSquare2, 
  CalendarDays, 
  Tag, 
  Plus, 
  Trash2, 
  X 
} from 'lucide-react';

export const ConfiguracoesModule = ({ user }) => {
  const [tiposPessoa, setTiposPessoa] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [novoTP, setNovoTP] = useState('');
  const [novoEV, setNovoEV] = useState({ nome: '', tiposPessoaPermitidos: [] });
  const [novoSV, setNovoSV] = useState({ nome: '', requerVagas: false });
  const [itemToDelete, setItemToDelete] = useState(null);

  const toast = useToast();

  useEffect(() => {
    if (!user) return;
    const unsubT = onSnapshot(getAppCollection('config_tipos_pessoa'), (s) => 
      setTiposPessoa(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.ativo !== false))
    );
    const unsubE = onSnapshot(getAppCollection('config_eventos'), (s) => 
      setEventos(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.ativo !== false))
    );
    const unsubS = onSnapshot(getAppCollection('config_servicos'), (s) => 
      setServicos(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.ativo !== false))
    );
    return () => {
      unsubT();
      unsubE();
      unsubS();
    };
  }, [user]);

  const addTipoPessoa = async () => {
    if (!novoTP.trim()) return;
    try {
      const now = Timestamp.now();
      await addDoc(getAppCollection('config_tipos_pessoa'), { nome: novoTP.trim(), ativo: true, criadoEm: now, criadoPor: user.uid, atualizadoEm: now, atualizadoPor: user.uid });
      toast.success(`Tipo de pessoa "${novoTP}" cadastrado com sucesso!`);
      setNovoTP('');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao adicionar tipo de pessoa.');
    }
  };

  const addEvento = async () => {
    if (!novoEV.nome.trim()) return;
    try {
      await addDoc(getAppCollection('config_eventos'), {
        nome: novoEV.nome.trim(),
        tiposPessoaPermitidos: novoEV.tiposPessoaPermitidos,
        ativo: true, criadoEm: Timestamp.now(), criadoPor: user.uid, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid
      });
      toast.success(`Tipo de agenda "${novoEV.nome}" cadastrado com sucesso!`);
      setNovoEV({ nome: '', tiposPessoaPermitidos: [] });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao cadastrar tipo de agenda.');
    }
  };

  const addServico = async () => {
    if (!novoSV.nome.trim()) return;
    try {
      await addDoc(getAppCollection('config_servicos'), {
        nome: novoSV.nome.trim(),
        requerVagas: novoSV.requerVagas,
        ativo: true, criadoEm: Timestamp.now(), criadoPor: user.uid, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid
      });
      toast.success(`Serviço "${novoSV.nome}" adicionado com sucesso!`);
      setNovoSV({ nome: '', requerVagas: false });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao cadastrar serviço.');
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await updateDoc(getAppDoc(itemToDelete.coll, itemToDelete.id), { ativo: false, atualizadoEm: Timestamp.now(), atualizadoPor: user.uid });
      toast.success(`Item "${itemToDelete.name}" desativado.`);
      setItemToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao remover item de configuração.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <header className="px-1">
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tighter uppercase italic leading-none">
          Ajustes
        </h2>
        <p className="text-gray-500 font-medium text-xs sm:text-sm mt-1">
          Configuração de parâmetros e catálogos do sistema
        </p>
      </header>

      {/* 1. Tipos de Pessoa */}
      <Card className="!border-none shadow-md">
        <h3 className="text-sm font-black uppercase text-purple-600 mb-4 flex items-center gap-2">
          <UserSquare2 size={18}/> 1. Tipos de Pessoa (Ex: Médium, Consulente, Membro)
        </h3>
        <div className="flex gap-2 mb-4">
          <input 
            value={novoTP} 
            onChange={e => setNovoTP(e.target.value)} 
            placeholder="Ex: Médium da Casa" 
            className="flex-1 bg-gray-50 px-4 py-2.5 rounded-xl border border-transparent text-sm font-bold outline-none focus:border-purple-500 focus:bg-white" 
          />
          <Button 
            onClick={addTipoPessoa} 
            className="px-4 py-2.5 h-auto text-xs bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus size={16}/> Adicionar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tiposPessoa.map(t => (
            <div 
              key={t.id} 
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 transition-colors px-3 py-1.5 rounded-xl text-xs font-bold text-gray-700 uppercase tracking-wider"
            >
              <span>{t.nome}</span>
              <button 
                onClick={() => setItemToDelete({ coll: 'config_tipos_pessoa', id: t.id, name: t.nome })} 
                className="text-gray-400 hover:text-rose-600 transition-colors p-0.5 rounded"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* 2. Tipos de Agenda */}
      <Card className="!border-none shadow-md">
        <h3 className="text-sm font-black uppercase text-amber-500 mb-4 flex items-center gap-2">
          <CalendarDays size={18}/> 2. Tipos de Agenda / Trabalhos
        </h3>
        <div className="space-y-4">
          <input 
            value={novoEV.nome} 
            onChange={e => setNovoEV({ ...novoEV, nome: e.target.value })} 
            placeholder="Nome do Trabalho (Ex: Gira de Atendimento, Sessão Festiva)" 
            className="w-full bg-gray-50 px-4 py-2.5 rounded-xl border border-transparent text-sm font-bold outline-none focus:border-amber-500 focus:bg-white" 
          />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
              Pessoas autorizadas a participar:
            </p>
            <div className="flex flex-wrap gap-2">
              {tiposPessoa.map(t => {
                const isSelected = novoEV.tiposPessoaPermitidos.includes(t.nome);
                return (
                  <label 
                    key={t.id} 
                    className={`px-3 py-1.5 rounded-xl border cursor-pointer text-xs font-black uppercase transition-all ${
                      isSelected 
                        ? 'bg-amber-500 border-amber-500 text-white shadow-sm' 
                        : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      onChange={() => setNovoEV(p => ({
                        ...p,
                        tiposPessoaPermitidos: isSelected 
                          ? p.tiposPessoaPermitidos.filter(x => x !== t.nome) 
                          : [...p.tiposPessoaPermitidos, t.nome]
                      }))} 
                    />
                    {t.nome}
                  </label>
                );
              })}
            </div>
          </div>
          <Button 
            onClick={addEvento} 
            variant="warning" 
            className="w-full py-3.5 text-xs"
          >
            <Plus size={16}/> Salvar Tipo de Agenda
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {eventos.map(e => (
            <div 
              key={e.id} 
              className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center"
            >
              <div>
                <span className="text-xs font-bold text-gray-800">{e.nome}</span>
                {e.tiposPessoaPermitidos?.length > 0 && (
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                    Permitido: {e.tiposPessoaPermitidos.join(', ')}
                  </p>
                )}
              </div>
              <button 
                onClick={() => setItemToDelete({ coll: 'config_eventos', id: e.id, name: e.nome })} 
                className="text-gray-400 hover:text-rose-600 transition-colors p-1"
              >
                <Trash2 size={16}/>
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* 3. Catálogo de Serviços */}
      <Card className="!border-none shadow-md">
        <h3 className="text-sm font-black uppercase text-emerald-600 mb-4 flex items-center gap-2">
          <Tag size={18}/> 3. Catálogo de Serviços Prestados
        </h3>
        <div className="flex flex-col gap-3 mb-4">
          <input 
            value={novoSV.nome} 
            onChange={e => setNovoSV({ ...novoSV, nome: e.target.value })} 
            placeholder="Nome do Serviço (Ex: Passe, Consulta Geral, Orientação)" 
            className="w-full bg-gray-50 px-4 py-2.5 rounded-xl border border-transparent text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white" 
          />
          <label className="flex items-center gap-2 text-xs font-bold text-gray-600 px-1 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={novoSV.requerVagas} 
              onChange={e => setNovoSV({ ...novoSV, requerVagas: e.target.checked })} 
              className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" 
            /> 
            Requer controle de limite de vagas por dia
          </label>
          <Button 
            onClick={addServico} 
            variant="success" 
            className="w-full py-3.5 text-xs"
          >
            <Plus size={16}/> Adicionar Serviço
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {servicos.map(s => (
            <div 
              key={s.id} 
              className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center"
            >
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-800">{s.nome}</span>
                {s.requerVagas && (
                  <span className="text-[9px] font-black text-amber-600 uppercase mt-0.5">
                    Vagas Limitadas
                  </span>
                )}
              </div>
              <button 
                onClick={() => setItemToDelete({ coll: 'config_servicos', id: s.id, name: s.nome })} 
                className="text-gray-400 hover:text-rose-600 transition-colors p-1"
              >
                <Trash2 size={16}/>
              </button>
            </div>
          ))}
        </div>
      </Card>

      <ConfirmDialog 
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        title="Desativar Configuração"
        message={`Deseja desativar "${itemToDelete?.name}"? Agendamentos existentes serão preservados.`}
        confirmText="Sim, Desativar"
      />
    </div>
  );
};
