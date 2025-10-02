// Lista degli admin autorizzati
const ADMIN_EMAILS = [
  "test44@test44.com", // Sostituisci con l'email dell'admin
  "admin@example.com",     // Aggiungi altre email admin se necessario
  "admin@giancarlo-padel.com", // Admin principale
];

// Funzione per determinare se un utente è admin
export const isUserAdmin = (user) => {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
};

// Funzione per verificare se un'email è admin
export const isEmailAdmin = (email) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
};
