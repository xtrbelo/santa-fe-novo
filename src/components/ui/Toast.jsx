import React, { useState, useCallback, useMemo } from 'react';
import { ToastContext } from './useToast';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const MAX_VISIBLE_TOASTS = 4;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) return;
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => {
      if (prev.some(toast => toast.message === normalizedMessage && toast.type === type)) return prev;
      return [...prev, { id, message: normalizedMessage, type }].slice(-MAX_VISIBLE_TOASTS);
    });

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const success = useCallback((msg, duration) => showToast(msg, 'success', duration), [showToast]);
  const error = useCallback((msg, duration) => showToast(msg, 'error', duration), [showToast]);
  const info = useCallback((msg, duration) => showToast(msg, 'info', duration), [showToast]);
  const contextValue = useMemo(() => ({
    showToast,
    success,
    error,
    info
  }), [showToast, success, error, info]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed inset-x-3 top-3 z-[200] flex max-w-sm flex-col gap-2.5 pointer-events-none sm:left-auto sm:right-5 sm:top-5 sm:w-full" aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          
          return (
            <div
              key={toast.id}
              role={isError ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-center justify-between gap-3 p-4 rounded-2xl shadow-xl border text-sm font-semibold transition-all transform animate-in slide-in-from-top-4 duration-300 ${
                isSuccess 
                  ? 'bg-emerald-900/90 text-emerald-100 border-emerald-700/60 backdrop-blur-md'
                  : isError
                  ? 'bg-rose-900/90 text-rose-100 border-rose-700/60 backdrop-blur-md'
                  : 'bg-gray-900/90 text-gray-100 border-gray-700/60 backdrop-blur-md'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {isSuccess && <CheckCircle2 className="text-emerald-400 shrink-0" size={20} />}
                {isError && <AlertCircle className="text-rose-400 shrink-0" size={20} />}
                {!isSuccess && !isError && <Info className="text-blue-400 shrink-0" size={20} />}
                <p className="min-w-0 leading-snug [overflow-wrap:anywhere]">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Fechar notificação"
                className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
