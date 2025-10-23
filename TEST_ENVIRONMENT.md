# 🧪 Ambiente di Test

Questo documento spiega come usare l'ambiente di test per sviluppare senza toccare l'app ufficiale.

## 🚀 Avvio Rapido

### 1. Avvia l'ambiente di test completo
```bash
npm run test:env
```
Questo comando:
- Avvia Firebase Emulator (database locale)
- Avvia Next.js in modalità test
- Popola automaticamente i dati di test

### 2. Solo emulatore Firebase
```bash
npm run test:emulator
```

### 3. Popola dati di test
```bash
npm run test:data
```

## 🔧 Configurazione

### Firebase Emulator
- **Firestore**: `localhost:8080`
- **Auth**: `localhost:9099`
- **UI**: `localhost:4000`

### Next.js Test
- **App**: `localhost:3001`
- **Database**: Emulatore locale (non tocca produzione)

## 📊 Dati di Test

L'ambiente di test include:
- **Giornata 1**: 4 partite completate con dati realistici
- **Giocatori**: 16 giocatori con ID di test
- **Risultati**: Punteggi e game reali

## 🛠️ Sviluppo

### Testare nuove funzionalità
1. Avvia l'ambiente di test: `npm run test:env`
2. Sviluppa le tue funzionalità
3. Testa senza paura - non tocca la produzione!

### Testare generazione partite
1. Vai su `http://localhost:3001/admin`
2. Usa "Genera nuova giornata" per testare algoritmi
3. Usa "Cancella ultima giornata" per correggere errori
4. Ripeti finché non sei soddisfatto!

## 🔄 Reset Dati

Per resettare i dati di test:
```bash
npm run test:data
```

## 🚀 Deploy

Quando sei soddisfatto delle modifiche:
1. Committa le modifiche sul branch `feature/test-environment`
2. Fai merge su `local-development`
3. Testa su staging
4. Deploy su produzione

## ⚠️ Note Importanti

- **NON** toccare mai l'app ufficiale durante i test
- **SEMPRE** usa l'emulatore per lo sviluppo
- **SEMPRE** testa prima di fare deploy
- I dati di test sono **completamente separati** dalla produzione
