import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITY_THROTTLE_MS, getLastActivityKey, getRemainingMs, getSessionState, parseActivityTimestamp, SESSION_STATES, SESSION_TIMEOUT_MS, SESSION_WARNING_MS } from '../utils/sessionTimeout';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];

export function useInactivityTimeout({ userId, onExpire }) {
  const [sessionState, setSessionState] = useState(SESSION_STATES.ACTIVE);
  const [remainingMs, setRemainingMs] = useState(SESSION_TIMEOUT_MS);
  const lastActivityRef = useRef(null);
  const expirationStartedRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const clearActivity = useCallback(() => {
    if (userId) localStorage.removeItem(getLastActivityKey(userId));
    lastActivityRef.current = null;
  }, [userId]);

  const recordActivity = useCallback((force = false) => {
    if (!userId || expirationStartedRef.current) return;
    const now = Date.now();
    if (!force && now - (lastActivityRef.current ?? 0) < ACTIVITY_THROTTLE_MS) return;
    lastActivityRef.current = now;
    localStorage.setItem(getLastActivityKey(userId), String(now));
    setSessionState(SESSION_STATES.ACTIVE);
    setRemainingMs(SESSION_TIMEOUT_MS);
  }, [userId]);

  const continueSession = useCallback(() => recordActivity(true), [recordActivity]);

  useEffect(() => {
    if (!userId) {
      lastActivityRef.current = null;
      expirationStartedRef.current = false;
      setSessionState(SESSION_STATES.ACTIVE);
      setRemainingMs(SESSION_TIMEOUT_MS);
      return undefined;
    }

    const storageKey = getLastActivityKey(userId);
    const savedTimestamp = parseActivityTimestamp(localStorage.getItem(storageKey));
    const initialTimestamp = savedTimestamp ?? Date.now();
    if (savedTimestamp === null) localStorage.setItem(storageKey, String(initialTimestamp));
    lastActivityRef.current = initialTimestamp;
    expirationStartedRef.current = false;

    let boundaryTimer;
    let countdownInterval;

    const expire = () => {
      if (expirationStartedRef.current) return;
      expirationStartedRef.current = true;
      localStorage.removeItem(storageKey);
      setSessionState(SESSION_STATES.EXPIRED);
      setRemainingMs(0);
      void onExpireRef.current?.();
    };

    const evaluate = () => {
      clearTimeout(boundaryTimer);
      clearInterval(countdownInterval);
      if (expirationStartedRef.current) return;
      const now = Date.now();
      const state = getSessionState({ lastActivity: lastActivityRef.current, now });
      const remaining = getRemainingMs({ lastActivity: lastActivityRef.current, now });
      setSessionState(state);
      setRemainingMs(remaining);
      if (state === SESSION_STATES.EXPIRED) expire();
      else if (state === SESSION_STATES.WARNING) countdownInterval = setInterval(evaluate, 1000);
      else boundaryTimer = setTimeout(evaluate, Math.max(1, remaining - SESSION_WARNING_MS));
    };

    const handleActivity = () => { recordActivity(false); evaluate(); };
    const handleStorage = event => {
      if (event.key !== storageKey || event.newValue === null) return;
      const timestamp = parseActivityTimestamp(event.newValue);
      if (timestamp === null || timestamp <= (lastActivityRef.current ?? 0)) return;
      lastActivityRef.current = timestamp;
      evaluate();
    };
    const handleVisibility = () => { if (document.visibilityState === 'visible') evaluate(); };

    ACTIVITY_EVENTS.forEach(eventName => window.addEventListener(eventName, handleActivity, { passive: true }));
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    evaluate();

    return () => {
      clearTimeout(boundaryTimer);
      clearInterval(countdownInterval);
      ACTIVITY_EVENTS.forEach(eventName => window.removeEventListener(eventName, handleActivity));
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [recordActivity, userId]);

  return { clearActivity, continueSession, isWarning: Boolean(userId) && sessionState === SESSION_STATES.WARNING, remainingMs };
}
