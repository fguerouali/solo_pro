# Guide de restauration - Retour à la version de base

## 📌 Version sauvegardée

Une version de référence a été sauvegardée avec :
- **Tag Git** : `v1.0.0-base`
- **Branche de sauvegarde** : `backup-base-version`

## 🔄 Comment revenir à cette version

### Option 1 : Utiliser le tag (recommandé)

```bash
# Voir tous les tags
git tag -l

# Restaurer le fichier index.html à la version du tag
git checkout v1.0.0-base -- index.html

# Ou restaurer tous les fichiers à cette version
git checkout v1.0.0-base
```

### Option 2 : Utiliser la branche de sauvegarde

```bash
# Voir toutes les branches
git branch -a

# Basculer sur la branche de sauvegarde
git checkout backup-base-version

# Ou copier un fichier spécifique depuis cette branche
git checkout backup-base-version -- index.html
```

### Option 3 : Créer une nouvelle branche depuis cette version

```bash
# Créer une nouvelle branche depuis le tag
git checkout -b ma-nouvelle-branche v1.0.0-base
```

## ⚠️ Attention

- Si vous restaurez des fichiers, vous perdrez les modifications non commitées
- Il est recommandé de commiter ou stasher vos changements avant de restaurer :
  ```bash
  # Sauvegarder vos modifications actuelles
  git stash
  
  # Restaurer la version de base
  git checkout v1.0.0-base -- index.html
  
  # Si vous voulez récupérer vos modifications plus tard
  git stash pop
  ```

## 📝 Commandes utiles

```bash
# Voir l'historique des commits
git log --oneline

# Voir les différences avec la version de base
git diff v1.0.0-base

# Voir les différences d'un fichier spécifique
git diff v1.0.0-base -- index.html

# Créer un nouveau tag pour une autre version importante
git tag -a v1.1.0 -m "Description de cette version"
```

## 🚀 Workflow recommandé

1. **Avant de commencer des modifications importantes** :
   ```bash
   git tag -a v1.0.1 -m "Avant modifications importantes"
   ```

2. **Faire vos modifications et les tester**

3. **Si tout fonctionne bien** :
   ```bash
   git add .
   git commit -m "Description des modifications"
   git push
   ```

4. **Si vous voulez revenir en arrière** :
   ```bash
   git checkout v1.0.0-base -- index.html
   ```

## 📦 Pousser les tags vers GitLab

Pour que les tags soient disponibles sur GitLab :

```bash
# Pousser un tag spécifique
git push origin v1.0.0-base

# Pousser tous les tags
git push origin --tags
```

