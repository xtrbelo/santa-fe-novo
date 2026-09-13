import { useCallback, useEffect } from 'react';

export const UNSAVED_CHANGES_MESSAGE = 'Existem alterações não salvas. Deseja descartá-las?';
export const UNSAVED_NAVIGATION_EVENT = 'santa-fe:before-navigate';

export function useUnsavedChanges(isDirty) {
  const confirmDiscard = useCallback(() => !isDirty || window.confirm(UNSAVED_CHANGES_MESSAGE), [isDirty]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = event => {
      event.preventDefault();
      event.returnValue = '';
    };
    const handleNavigation = event => {
      if (!window.confirm(UNSAVED_CHANGES_MESSAGE)) event.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener(UNSAVED_NAVIGATION_EVENT, handleNavigation);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener(UNSAVED_NAVIGATION_EVENT, handleNavigation);
    };
  }, [isDirty]);

  return confirmDiscard;
}
