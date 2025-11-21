/**
 * Ingredients Module
 * Module de gestion du stock (ingrédients)
 */

import { showToast, openModal, closeModal, getTodayDateString } from '../core/helpers.js';
import { getAllIngredients, setAllIngredients, getCollections } from '../core/state.js';
import { addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp } from '../services/firebase-service.js';
import { renderIngredients } from '../ui/renderers.js';

/**
 * Initialise le module ingrédients
 */
export const initializeIngredients = () => {
    // Bouton ajout
    document.getElementById('add-ingredient-btn').addEventListener('click', handleAddClick);
    
    // Bouton annulation
    document.getElementById('cancel-ingredient').addEventListener('click', () => closeModal('ingredient-modal'));
    
    // Formulaire de soumission
    document.getElementById('ingredient-form').addEventListener('submit', handleFormSubmit);
    
    // Event delegation pour la liste
    document.getElementById('ingredients-list').addEventListener('click', handleListClick);
};

/**
 * Handler pour le bouton "Ajouter"
 */
const handleAddClick = () => {
    document.getElementById('ingredient-modal-title').textContent = 'Ajouter un ingrédient';
    document.getElementById('ingredient-form').reset();
    document.getElementById('ingredient-id').value = '';
    openModal('ingredient-modal');
};

/**
 * Handler pour la soumission du formulaire
 */
const handleFormSubmit = async (e) => {
    e.preventDefault();
    const cols = getCollections();
    const id = document.getElementById('ingredient-id').value;
    const data = {
        name: document.getElementById('ingredient-name').value,
        quantity: parseFloat(document.getElementById('ingredient-quantity').value),
        unit: document.getElementById('ingredient-unit').value,
        cost: parseFloat(document.getElementById('ingredient-cost').value) || 0
    };
    
    try {
        if (id) {
            await updateDoc(doc(cols.ingredientsCol, id), data);
            showToast('Ingrédient mis à jour !');
        } else {
            await addDoc(cols.ingredientsCol, {...data, createdAt: serverTimestamp()});
            showToast('Ingrédient ajouté !');
        }
        closeModal('ingredient-modal');
    } catch(error) {
        console.error(error);
        showToast("Erreur lors de l'opération.");
    }
};

/**
 * Handler pour les clics dans la liste (edit/delete)
 */
const handleListClick = async (e) => {
    const target = e.target.closest('[data-id]');
    if (!target) return;
    
    const cols = getCollections();
    const id = target.dataset.id;
    
    if (target.classList.contains('delete-ingredient-btn')) {
        if(confirm('Voulez-vous vraiment supprimer cet ingrédient ?')) {
            await deleteDoc(doc(cols.ingredientsCol, id));
            showToast('Ingrédient supprimé.');
        }
    } else if (target.classList.contains('edit-ingredient-btn')) {
        const docSnap = await getDoc(doc(cols.ingredientsCol, id));
        const data = docSnap.data();
        document.getElementById('ingredient-modal-title').textContent = 'Modifier un ingrédient';
        document.getElementById('ingredient-id').value = docSnap.id;
        document.getElementById('ingredient-name').value = data.name;
        document.getElementById('ingredient-quantity').value = data.quantity;
        document.getElementById('ingredient-unit').value = data.unit;
        document.getElementById('ingredient-cost').value = data.cost || '';
        openModal('ingredient-modal');
    }
};

/**
 * Callback pour la mise à jour des ingrédients depuis Firestore
 */
export const onIngredientsUpdate = (ingredients) => {
    setAllIngredients(ingredients);
    renderIngredients(ingredients);
};

/**
 * Peuple les selects d'ingrédients pour les autres modules
 */
export const populateIngredientSelects = () => {
    const ingredients = getAllIngredients();
    const recipeSelect = document.getElementById('recipe-ingredient-select');
    const linkedSelect = document.getElementById('linked-ingredient-select');
    const poSelect = document.getElementById('po-ingredient-select');
    const lossIngredientSelect = document.getElementById('loss-ingredient-select');
    
    const options = ingredients.map(ing => `<option value="${ing.id}">${ing.name} (${ing.unit})</option>`).join('');
    
    recipeSelect.innerHTML = `<option value="">Choisir...</option>${options}`;
    linkedSelect.innerHTML = `<option value="">Choisir...</option>${options}`;
    poSelect.innerHTML = `<option value="">Choisir...</option>${options}`;
    lossIngredientSelect.innerHTML = `<option value="">Choisir...</option>${options}`;
};

