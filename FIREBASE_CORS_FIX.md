# Correction de l'erreur CORS Firebase

## Problème

L'erreur `Fetch API cannot load https://firestore.googleapis.com/... due to access control checks` indique que votre domaine n'est pas autorisé dans Firebase Console.

## Solution : Autoriser votre domaine dans Firebase

### Étape 1 : Accéder à Firebase Console

1. Allez sur https://console.firebase.google.com
2. Sélectionnez votre projet : **solopro-6521a**

### Étape 2 : Autoriser les domaines pour l'authentification

1. Dans le menu de gauche, cliquez sur **Authentication**
2. Cliquez sur l'onglet **Settings**
3. Faites défiler jusqu'à **Authorized domains**
4. Cliquez sur **Add domain**
5. Ajoutez les domaines suivants selon votre cas :

#### Pour le développement local :
- `localhost`
- `127.0.0.1`

#### Pour le déploiement sur Render :
- `solo-pro-frontend-test.onrender.com` (ou votre URL Render)
- `*.onrender.com` (pour autoriser tous les sous-domaines Render)

### Étape 3 : Vérifier les règles Firestore

1. Dans Firebase Console, allez dans **Firestore Database**
2. Cliquez sur l'onglet **Rules**
3. Assurez-vous que les règles permettent l'accès (pour le test) :

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

**⚠️ Attention :** Ces règles permettent l'accès à tous les utilisateurs authentifiés. Pour la production, utilisez des règles plus restrictives.

### Étape 4 : Vérifier la configuration de l'application

1. Dans Firebase Console, allez dans **Project Settings** (icône ⚙️)
2. Faites défiler jusqu'à **Your apps**
3. Vérifiez que votre application web est bien configurée
4. Si nécessaire, ajoutez votre domaine dans la section **Authorized domains**

## Vérification

Après avoir ajouté les domaines :

1. Rechargez votre application
2. Connectez-vous avec `admin` / `admin123`
3. L'erreur CORS ne devrait plus apparaître

## Domaines à ajouter (liste complète)

Pour un environnement de test complet, ajoutez :

- `localhost`
- `127.0.0.1`
- `solo-pro-frontend-test.onrender.com`
- `solo-pro.onrender.com` (si vous avez aussi un environnement de production)
- Votre domaine personnalisé (si vous en avez un)

## Dépannage

### L'erreur persiste après avoir ajouté le domaine

1. Videz le cache du navigateur (Ctrl+Shift+R ou Cmd+Shift+R)
2. Vérifiez que vous avez bien sauvegardé les modifications dans Firebase Console
3. Attendez quelques minutes (les changements peuvent prendre du temps à se propager)
4. Vérifiez la console du navigateur pour d'autres erreurs

### Erreur "Permission denied"

Cela signifie que les règles Firestore bloquent l'accès. Vérifiez les règles Firestore comme indiqué à l'étape 3.

