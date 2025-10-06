// Lista degli admin autorizzati (ora per username)
const ADMIN_USERNAMES = [
  "test44", // Sostituisci con l'username dell'admin
  "admin",     // Aggiungi altri username admin se necessario
  "giancarlo", // Admin principale
];

// Password passpartout per admin (cambiala in produzione!)
const ADMIN_PASSPARTOUT = "admin123!";

// Funzione per determinare se un utente è admin
export const isUserAdmin = (user) => {
  if (!user || !user.username) return false;
  return ADMIN_USERNAMES.includes(user.username.toLowerCase());
};

// Funzione per verificare se un username è admin
export const isUsernameAdmin = (username) => {
  if (!username) return false;
  return ADMIN_USERNAMES.includes(username.toLowerCase());
};

// Funzione per verificare la password passpartout
export const isAdminPasspartout = (password) => {
  return password === ADMIN_PASSPARTOUT;
};

// Funzione per verificare se un'email è admin (per compatibilità con utenti esistenti)
export const isEmailAdmin = (email) => {
  if (!email) return false;
  // Converti email in username per compatibilità
  const username = email.split('@')[0];
  return ADMIN_USERNAMES.includes(username.toLowerCase());
};
