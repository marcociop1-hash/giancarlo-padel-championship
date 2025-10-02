// lib/utils.js
// Funzioni di utilità ottimizzate per performance

// Cache per funzioni costose
const memoizeCache = new Map();

/**
 * Memoizza una funzione per evitare calcoli ripetuti
 */
export function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  return (...args) => {
    const key = keyFn(...args);
    if (memoizeCache.has(key)) {
      return memoizeCache.get(key);
    }
    const result = fn(...args);
    memoizeCache.set(key, result);
    return result;
  };
}

/**
 * Pulisce la cache memoizzata
 */
export function clearMemoizeCache() {
  memoizeCache.clear();
}

/**
 * Debounce per ottimizzare chiamate frequenti
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle per limitare la frequenza di esecuzione
 */
export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Normalizza i dati di una squadra in formato standard
 */
export const normalizeTeam = memoize((team, playersMap) => {
  if (!team) {
    return { a: { id: null, name: "??" }, b: { id: null, name: "??" } };
  }

  const toPlayer = (x) => {
    if (!x) return { id: null, name: "??" };
    if (typeof x === "string") {
      const name = playersMap.get(x)?.name || playersMap.get(x)?.Nome || playersMap.get(x)?.displayName || x;
      return { id: x, name };
    }
    const id = x.id || x.uid || null;
    const nameFromId = id ? playersMap.get(id)?.name || playersMap.get(id)?.Nome || playersMap.get(id)?.displayName : null;
    const name = x.name || x.Nome || x.displayName || nameFromId || "??";
    return { id, name };
  };

  if (Array.isArray(team)) {
    return { a: toPlayer(team[0]), b: toPlayer(team[1]) };
  }
  if (team.player1 || team.player2) {
    return { a: toPlayer(team.player1), b: toPlayer(team.player2) };
  }
  if (team.A || team.B) {
    return { a: toPlayer(team.A), b: toPlayer(team.B) };
  }
  
  const vals = Object.values(team);
  if (vals.length >= 2) {
    return { a: toPlayer(vals[0]), b: toPlayer(vals[1]) };
  }
  
  return { a: { id: null, name: "??" }, b: { id: null, name: "??" } };
});

/**
 * Genera etichetta squadra
 */
export const teamLabel = memoize((team, playersMap) => {
  const t = normalizeTeam(team, playersMap);
  return `${t.a.name} & ${t.b.name}`;
});

/**
 * Formatta data in formato leggibile
 */
export function formatDate(date) {
  if (!date) return '';
  
  try {
    const d = new Date(date);
    return d.toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return String(date);
  }
}

/**
 * Formatta ora in formato leggibile
 */
export function formatTime(time) {
  if (!time) return '';
  
  try {
    if (typeof time === 'string' && time.includes(':')) {
      return time;
    }
    const d = new Date(time);
    return d.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(time);
  }
}

/**
 * Calcola differenza tra due date in giorni
 */
export function daysBetween(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000;
  const first = new Date(date1);
  const second = new Date(date2);
  return Math.round(Math.abs((first - second) / oneDay));
}

/**
 * Verifica se una data è nel passato
 */
export function isPastDate(date) {
  return new Date(date) < new Date();
}

/**
 * Verifica se una data è oggi
 */
export function isToday(date) {
  const today = new Date();
  const checkDate = new Date(date);
  return today.toDateString() === checkDate.toDateString();
}

/**
 * Genera ID univoco
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Valida email
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valida password (minimo 6 caratteri)
 */
export function isValidPassword(password) {
  return password && password.length >= 6;
}

/**
 * Trunca testo con ellipsis
 */
export function truncateText(text, maxLength = 50) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Capitalizza prima lettera
 */
export function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Ordina array per proprietà
 */
export function sortBy(array, property, direction = 'asc') {
  return [...array].sort((a, b) => {
    const aVal = a[property];
    const bVal = b[property];
    
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Filtra array per proprietà
 */
export function filterBy(array, property, value) {
  return array.filter(item => {
    const itemValue = item[property];
    if (typeof value === 'string') {
      return itemValue.toLowerCase().includes(value.toLowerCase());
    }
    return itemValue === value;
  });
}

/**
 * Raggruppa array per proprietà
 */
export function groupBy(array, property) {
  return array.reduce((groups, item) => {
    const key = item[property];
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
}

/**
 * Rimuove duplicati da array
 */
export function removeDuplicates(array, key = null) {
  if (!key) {
    return [...new Set(array)];
  }
  
  const seen = new Set();
  return array.filter(item => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

/**
 * Calcola media di array numerico
 */
export function average(array) {
  if (!array.length) return 0;
  return array.reduce((sum, val) => sum + val, 0) / array.length;
}

/**
 * Calcola somma di array numerico
 */
export function sum(array) {
  return array.reduce((sum, val) => sum + val, 0);
}

/**
 * Trova valore massimo in array
 */
export function max(array) {
  return Math.max(...array);
}

/**
 * Trova valore minimo in array
 */
export function min(array) {
  return Math.min(...array);
}


