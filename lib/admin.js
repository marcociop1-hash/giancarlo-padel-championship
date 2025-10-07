// Lista degli admin autorizzati (fallback per compatibilitÃ )
const ADMIN_EMAILS = [
  "test44@test44.com", // Nico
  "test53@test53.com", // Gelli - aggiunto
  "admin@admin.com",     // Aggiungi altre email admin se necessario
  "giancarlo@giancarlo.com", // Admin principale
  "marco@marco.com",     // Admin personale
];

// Password passpartout per admin (cambiala in produzione!)
const ADMIN_PASSPARTOUT = "admin123!";

// Funzione per determinare se un utente Ã¨ admin
export const isUserAdmin = (user) => {
  if (!user || !user.email) return false;
  
  // Controlla prima il campo role nel database (se disponibile)
  if (user.role === 'admin') {
    return true;
  }
  
  // Fallback: controlla la lista hardcoded per compatibilitÃ 
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
};

// Funzione per verificare se un'email Ã¨ admin
export const isEmailAdmin = (email) => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
};
