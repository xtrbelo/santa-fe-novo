import React, { useState, useCallback } from 'react';
import { ToastContext } from './useToast';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const success = useCallback((msg, duration) => showToast(msg, 'success', duration), [showToast]);
  const error = useCallback((msg, duration) => showToast(msg, 'error', duration), [showToast]);
  const info = useCallback((msg, duration) => showToast(msg, 'info', duration), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      <div className="fixed top-5 right-5 z-[200] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          
          return (
            <div
              key={toast.id}
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
                <p className="leading-snug break-words">{toast.message}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
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
