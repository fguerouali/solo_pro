import { firebase } from '../services/firebase-service.js';
import { showToast } from '../core/helpers.js';
import { openModal, closeModal } from '../ui/modals.js';
import { getAllIngredients, getAllProducts, getCurrentRecipe, setCurrentRecipe } from '../core/state.js';
import { renderCurrentRecipe, updateRecipeCost } from '../ui/renderers-extended.js';

export const setupProductsEventListeners = () => {
    // Populate selects
    populateIngredientSelects();
    populateProductSelects();

    // Add Product Button
    document.getElementById('add-product-btn').addEventListener('click', () => { 
        document.getElementById('product-modal-title').textContent = 'Créer un Produit'; 
        document.getElementById('product-form').reset(); 
        document.getElementById('product-id').value = ''; 
        document.getElementById('product-type').dispatchEvent(new Event('change')); 
        setCurrentRecipe([]);
        renderCurrentRecipe(); 
        // Reset linked quantity field on add
        document.getElementById('linked-ingredient-quantity').value = 1;
        openModal('product-modal'); 
    });

    // Cancel Product Modal
    document.getElementById('cancel-product').addEventListener('click', () => closeModal('product-modal')); 
    
    // Product Type Change (Show/Hide Recipe vs Linked sections)
    document.getElementById('product-type').addEventListener('change', (e) => { 
        const productType = e.target.value;
        const hasRecipe = ['Pizza', 'Dessert', 'Entrée'].includes(productType);
        document.getElementById('recipe-section').style.display = hasRecipe ? 'block' : 'none';
        document.getElementById('linked-ingredient-section').style.display = hasRecipe ? 'none' : 'block';
    }); 
    
    // Add Recipe Ingredient Button
    document.getElementById('add-recipe-ingredient-btn').addEventListener('click', () => { 
        const select = document.getElementById('recipe-ingredient-select'); 
        const ingredientId = select.value; 
        const quantity = parseFloat(document.getElementById('recipe-quantity').value); 
        
        if (!ingredientId || isNaN(quantity) || quantity <= 0) {
            return showToast("Veuillez sélectionner un ingrédient et une quantité valide.");
        }
        
        const allIngredients = getAllIngredients();
        const ingredient = allIngredients.find(ing => ing.id === ingredientId); 
        const recipe = [...getCurrentRecipe(), { 
            id: ingredient.id, 
            name: ingredient.name, 
            quantity: quantity, 
            unit: ingredient.unit 
        }];
        setCurrentRecipe(recipe);
        renderCurrentRecipe(); 
        document.getElementById('recipe-quantity').value = ''; 
        select.value = ''; 
    });
    
    // Remove Recipe Item
    document.getElementById('recipe-ingredients-list').addEventListener('click', e => { 
        const button = e.target.closest('.remove-recipe-item'); 
        if (button) { 
            const recipe = [...currentRecipe];
            recipe.splice(button.dataset.index, 1); 
            setCurrentRecipe(recipe);
            renderCurrentRecipe(); 
        } 
    }); 
    
    // Product Form Submission
    document.getElementById('product-form').addEventListener('submit', async e => { 
        e.preventDefault(); 
        const id = document.getElementById('product-id').value; 
        const type = document.getElementById('product-type').value; 
        const data = { 
            name: document.getElementById('product-name').value, 
            price: parseFloat(document.getElementById('product-price').value), 
            type: type 
        }; 
        
        const hasRecipe = ['Pizza', 'Dessert', 'Entrée'].includes(type);

        if (hasRecipe) {
            if (currentRecipe.length === 0) {
                return showToast("La recette ne peut pas être vide pour ce type de produit.");
            }
            data.recipe = currentRecipe;
            if (data.hasOwnProperty('linkedIngredientId')) {
                delete data.linkedIngredientId;
            }
            if (data.hasOwnProperty('linkedIngredientQuantity')) {
                delete data.linkedIngredientQuantity;
            }
        } else {
            const linkedId = document.getElementById('linked-ingredient-select').value;
            const linkedQty = parseFloat(document.getElementById('linked-ingredient-quantity').value);

            if (!linkedId) return showToast("Veuillez lier ce produit à un article en stock.");
            if (isNaN(linkedQty) || linkedQty <= 0) {
                return showToast("Veuillez entrer une quantité consommée valide (positive).");
            }

            data.linkedIngredientId = linkedId;
            data.linkedIngredientQuantity = linkedQty;
            if (data.hasOwnProperty('recipe')) {
                delete data.recipe;
            }
        }

        try { 
            if (id) {
                await firebase.updateProduct(id, data);
                showToast('Produit mis à jour !');
            } else {
                await firebase.addProduct(data);
                showToast('Produit créé !');
            }
            closeModal('product-modal'); 
        } catch(error) { 
            console.error(error); 
            showToast("Erreur lors de l'opération."); 
        } 
    }); 
    
    // Edit/Delete Product Buttons
    document.getElementById('products-list').addEventListener('click', async e => { 
        const id = e.target.closest('[data-id]')?.dataset.id; 
        if(!id) return; 
        const target = e.target; 
        
        if (target.closest('.delete-product-btn')) { 
            if(confirm('Voulez-vous vraiment supprimer ce produit ?')) { 
                await firebase.deleteProduct(id);
                showToast('Produit supprimé.'); 
            } 
        } else if (target.closest('.edit-product-btn')) { 
            const allProducts = getAllProducts();
            const product = allProducts.find(p => p.id === id); 
            document.getElementById('product-modal-title').textContent = 'Modifier un Produit'; 
            document.getElementById('product-id').value = id; 
            document.getElementById('product-name').value = product.name; 
            document.getElementById('product-price').value = product.price; 
            document.getElementById('product-type').value = product.type; 
            document.getElementById('product-type').dispatchEvent(new Event('change')); 
            
            if (product.recipe && product.recipe.length > 0) { 
                setCurrentRecipe([...product.recipe]);
                renderCurrentRecipe(); 
            } else if (product.linkedIngredientId) { 
                document.getElementById('linked-ingredient-select').value = product.linkedIngredientId; 
                document.getElementById('linked-ingredient-quantity').value = product.linkedIngredientQuantity || 1;
            } 
            openModal('product-modal'); 
        } 
    });

    // Import/Export Buttons
    document.getElementById('import-products-btn').addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('openImport', { detail: { type: 'products' } }));
    });

    document.getElementById('export-products-btn').addEventListener('click', () => {
        const allProducts = getAllProducts();
        const allIngredients = getAllIngredients();
        let csv = "nom,prix,type,details\n"; 
        allProducts.forEach(p => { 
            let d = ''; 
            if (p.type === 'Pizza' || p.type === 'Entrée' || p.type === 'Dessert') { 
                if(p.recipe) d = `"${p.recipe.map(r => `${r.name}:${r.quantity}:${r.unit}`).join(';')}"`; 
            } else {
                const l = allIngredients.find(i => i.id === p.linkedIngredientId); 
                const q = p.linkedIngredientQuantity || 1;
                d = l ? `"${l.name}:${q}"` : '"NON LIÉ:1"'; 
            } 
            csv += `${p.name},${p.price},${p.type},${d}\n`; 
        }); 
        downloadCSV(csv, 'produits.csv');
    });
};

// Helper functions for populating selects
export const populateIngredientSelects = () => {
    const allIngredients = getAllIngredients();
    const recipeSelect = document.getElementById('recipe-ingredient-select');
    const linkedSelect = document.getElementById('linked-ingredient-select');
    const poSelect = document.getElementById('po-ingredient-select');
    const lossIngredientSelect = document.getElementById('loss-ingredient-select');
    
    const options = allIngredients.map(ing => `<option value="${ing.id}">${ing.name} (${ing.unit})</option>`).join('');
    recipeSelect.innerHTML = `<option value="">Choisir...</option>${options}`;
    linkedSelect.innerHTML = `<option value="">Choisir...</option>${options}`;
    poSelect.innerHTML = `<option value="">Choisir...</option>${options}`;
    lossIngredientSelect.innerHTML = `<option value="">Choisir...</option>${options}`;
};

export const populateProductSelects = () => {
    const allProducts = getAllProducts();
    const orderSelect = document.getElementById('order-product-select');
    const lossSelect = document.getElementById('loss-product-select');
    const options = allProducts.map(product => `<option value="${product.id}">${product.name}</option>`).join('');
    orderSelect.innerHTML = options;
    lossSelect.innerHTML = options;
};

// CSV download helper
const downloadCSV = (content, filename) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

