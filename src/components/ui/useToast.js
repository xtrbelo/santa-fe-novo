import { createContext, useContext } from 'react';

export const ToastContext = createContext({
  showToast: () => {},
  success: () => {},
  error: () => {},
  info: () => {}
});

export const useToast = () => useContext(ToastContext);
