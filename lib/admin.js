// Lista degli admin autorizzati
const ADMIN_EMAILS = [
  "test44@test44.com", // Sostituisci con l'email dell'admin
  "admin@admin.com",     // Aggiungi altre email admin se necessario
  "giancarlo@giancarlo.com", // Admin principale
  "marco@marco.com",     // Admin personale
];

// Password passpartout per admin (cambiala in produzione!)
const ADMIN_PASSPARTOUT = "admin123!";

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
