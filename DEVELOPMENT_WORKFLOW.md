# 🚀 Workflow di Sviluppo - Giancarlo Padel Championship

## 📋 Setup Completato

✅ **Branch di Produzione**: `master` → Deploy automatico su Vercel  
✅ **Branch di Sviluppo**: `development` → Deploy su preview URL  

## 🔄 Workflow di Sviluppo

### 1. **Per ogni modifica:**
```bash
# Passa al branch di sviluppo
git checkout development

# Fai le tue modifiche...
# Testa in locale con: npm run dev

# Committa le modifiche
git add .
git commit -m "Descrizione della modifica"
git push origin development
```

### 2. **Test su Preview:**
- Vercel creerà automaticamente un URL di preview per il branch `development`
- Testa tutte le funzionalità su questo URL
- Verifica che tutto funzioni correttamente

### 3. **Deploy in Produzione:**
```bash
# Quando sei sicuro che tutto funziona
git checkout master
git merge development
git push origin master
```

## 🛡️ Vantaggi

- ✅ **Sicurezza**: L'app in produzione rimane sempre stabile
- ✅ **Testing**: Puoi testare tutto prima del deploy
- ✅ **Rollback**: Se qualcosa va storto, il master è sempre sicuro
- ✅ **Preview**: Vedi le modifiche su un ambiente reale prima del deploy

## 📝 Comandi Utili

```bash
# Vedere su quale branch sei
git branch

# Vedere tutti i branch
git branch -a

# Tornare al branch di sviluppo
git checkout development

# Tornare al branch di produzione
git checkout master

# Vedere le differenze tra branch
git diff master..development
```

## 🎯 Regole d'Oro

1. **MAI** lavorare direttamente su `master`
2. **SEMPRE** testare su `development` prima del merge
3. **SEMPRE** fare il merge solo quando sei sicuro
4. **SEMPRE** mantenere `master` stabile per gli utenti

## 🚨 In Caso di Emergenza

Se qualcosa va storto in produzione:
```bash
# Rollback immediato (torna al commit precedente)
git checkout master
git reset --hard HEAD~1
git push --force origin master
```

---
*Setup completato il: $(date)*
