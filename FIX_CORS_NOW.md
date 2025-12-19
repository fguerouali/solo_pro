# 🔴 CORRECTION URGENTE - Erreur CORS Firebase

## Problème identifié

Votre domaine **`solo-pro.onrender.com`** n'est pas autorisé dans Firebase Console, ce qui cause l'erreur CORS.

## ✅ Solution rapide (5 minutes)

### Étape 1 : Accéder à Firebase Console

1. Allez sur : https://console.firebase.google.com
2. Connectez-vous avec votre compte Google
3. Sélectionnez le projet : **solopro-6521a**

### Étape 2 : Autoriser le domaine Render

1. Dans le menu de gauche, cliquez sur **Authentication** (ou **Authentification**)
2. Cliquez sur l'onglet **Settings** (ou **Paramètres**)
3. Faites défiler jusqu'à la section **Authorized domains** (ou **Domaines autorisés**)
4. Cliquez sur le bouton **Add domain** (ou **Ajouter un domaine**)
5. Entrez exactement : **`solo-pro.onrender.com`**
6. Cliquez sur **Add** (ou **Ajouter**)

### Étape 3 : Vérifier les domaines autorisés

Vous devriez maintenant voir dans la liste :
- `localhost` (déjà présent)
- `solo-pro.onrender.com` (nouvellement ajouté)

### Étape 4 : Recharger l'application

1. Retournez sur votre application : https://solo-pro.onrender.com
2. **Videz le cache** : Appuyez sur `Ctrl+Shift+R` (Windows/Linux) ou `Cmd+Shift+R` (Mac)
3. Reconnectez-vous avec `admin` / `admin123`

## ✅ Résultat attendu

Après ces étapes :
- ✅ L'erreur CORS disparaîtra
- ✅ Firebase se connectera correctement
- ✅ L'application fonctionnera normalement

## 📝 Si vous avez plusieurs environnements

Si vous avez aussi un environnement de test (`solo-pro-frontend-test.onrender.com`), ajoutez-le aussi :

1. Répétez l'étape 2
2. Ajoutez : **`solo-pro-frontend-test.onrender.com`**

## ⚠️ Important

- Les changements peuvent prendre **1-2 minutes** à se propager
- Si l'erreur persiste après 2 minutes, videz complètement le cache du navigateur
- Assurez-vous d'avoir bien sauvegardé dans Firebase Console

## 🆘 Si ça ne fonctionne toujours pas

1. Vérifiez que vous avez bien cliqué sur **Save** dans Firebase Console
2. Attendez 5 minutes et réessayez
3. Vérifiez les règles Firestore (Firestore Database → Rules) :
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

