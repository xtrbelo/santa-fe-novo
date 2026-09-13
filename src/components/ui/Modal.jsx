import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-lg", initialFocusRef }) => {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { e.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => {
      const initialFocus = initialFocusRef?.current || dialogRef.current?.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      (initialFocus || dialogRef.current)?.focus();
    });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [isOpen, initialFocusRef]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
        aria-hidden="true" 
      />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`relative bg-white rounded-t-3xl sm:rounded-3xl w-full ${maxWidth} shadow-2xl overflow-hidden flex flex-col max-h-[92vh] z-10 animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-250`}>
        <div className="p-5 border-b border-gray-100 flex justify-between items-center gap-3 bg-white sticky top-0 z-10">
          <h3 id={titleId} className="min-w-0 text-xl font-black text-gray-900 tracking-tight [overflow-wrap:anywhere]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5 sm:p-8 overflow-y-auto grow no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};
