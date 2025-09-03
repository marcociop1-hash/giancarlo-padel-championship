# Deploy rapido su Firebase Hosting (Next.js)

1) Installare la CLI:
   npm i -g firebase-tools

2) Login:
   firebase login

3) Nella root del progetto:
   # se non lo hai già fatto
   firebase init hosting

   - Scegli: Use an existing project → seleziona il progetto
   - La CLI rileverà Next.js e creerà il backend "frameworks"
   - Accetta la regione europe-west1 (o cambia nel firebase.json)

4) Variabili d'ambiente:
   - Copia .env.local.example in .env.local e incolla le chiavi

5) Deploy:
   npm install
   npm run build
   firebase deploy

6) Dopo il deploy:
   - In Firebase Console → Authentication → Domini autorizzati
     aggiungi l'URL del sito appena pubblicato.
