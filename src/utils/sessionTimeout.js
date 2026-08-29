export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_WARNING_MS = 5 * 60 * 1000;
export const ACTIVITY_THROTTLE_MS = 10 * 1000;

export const SESSION_STATES = Object.freeze({
  ACTIVE: "ACTIVE",
  WARNING: "WARNING",
  EXPIRED: "EXPIRED",
});

export const getLastActivityKey = (uid) => `santa-fe:last-activity:${uid}`;

export const parseActivityTimestamp = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const timestamp = typeof value === "number" ? value : Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null;
};

export const getRemainingMs = ({
  lastActivity,
  now = Date.now(),
  timeoutMs = SESSION_TIMEOUT_MS,
}) => {
  const timestamp = parseActivityTimestamp(lastActivity);
  if (timestamp === null) return timeoutMs;
  return Math.max(0, timeoutMs - Math.max(0, now - timestamp));
};

export const getSessionState = ({
  lastActivity,
  now = Date.now(),
  timeoutMs = SESSION_TIMEOUT_MS,
  warningMs = SESSION_WARNING_MS,
}) => {
  const remainingMs = getRemainingMs({ lastActivity, now, timeoutMs });
  if (remainingMs === 0) return SESSION_STATES.EXPIRED;
  if (remainingMs <= warningMs) return SESSION_STATES.WARNING;
  return SESSION_STATES.ACTIVE;
};
