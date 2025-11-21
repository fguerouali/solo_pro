import { firebase } from '../services/firebase-service.js';
import { db, lossesCol, ingredientsCol } from '../config/firebase.js';
import { showToast, calculateProductCost } from '../core/helpers.js';
import { openModal, closeModal } from '../ui/modals.js';
import { getAllProducts, getAllIngredients, getAllLosses } from '../core/state.js';
import { doc, writeBatch, serverTimestamp, increment, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const setupLossesEventListeners = () => {
    // Declare Loss Button
    document.getElementById('declare-loss-btn').addEventListener('click', () => {
        document.getElementById('loss-form').reset();
        document.querySelector('input[name="loss-type"][value="product"]').checked = true;
        document.getElementById('loss-product-section').classList.remove('hidden');
        document.getElementById('loss-ingredient-section').classList.add('hidden');
        document.getElementById('loss-product-select').required = true;
        document.getElementById('loss-ingredient-select').required = false;
        openModal('loss-modal');
    });

    // Cancel Loss Modal
    document.getElementById('cancel-loss').addEventListener('click', () => closeModal('loss-modal'));

    // Loss Type Radio Change
    document.querySelectorAll('input[name="loss-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isProduct = e.target.value === 'product';
            document.getElementById('loss-product-section').classList.toggle('hidden', !isProduct);
            document.getElementById('loss-ingredient-section').classList.toggle('hidden', isProduct);
            document.getElementById('loss-product-select').required = isProduct;
            document.getElementById('loss-ingredient-select').required = !isProduct;
        });
    });
    
    // Loss Form Submission
    document.getElementById('loss-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.querySelector('input[name="loss-type"]:checked').value;
        const quantity = parseFloat(document.getElementById('loss-quantity').value);
        const reason = document.getElementById('loss-reason').value;
        
        if (isNaN(quantity) || quantity <= 0) {
            return showToast("La quantité doit être un nombre positif.");
        }
        
        const batch = writeBatch(db);
        let lossData = { reason, createdAt: serverTimestamp(), quantity };
        let success = true;

        if (type === 'product') {
            const productId = document.getElementById('loss-product-select').value;
            const product = allProducts.find(p => p.id === productId);
            if (!product) return showToast("Produit non trouvé.");

            lossData.itemId = productId;
            lossData.itemName = product.name;
            lossData.type = 'product';
            
            const tempDeductions = new Map();
            if (product.recipe && product.recipe.length > 0) {
                for (const recipeItem of product.recipe) {
                    const current = tempDeductions.get(recipeItem.id) || 0;
                    tempDeductions.set(recipeItem.id, current + recipeItem.quantity * quantity);
                }
            } else if (product.linkedIngredientId) {
                const linkedQtyPerProduct = product.linkedIngredientQuantity || 1;
                const totalQtyToDeduct = linkedQtyPerProduct * quantity;
                const current = tempDeductions.get(product.linkedIngredientId) || 0;
                tempDeductions.set(product.linkedIngredientId, current + totalQtyToDeduct);
            }

            for (const [ingId, qtyToDeduct] of tempDeductions.entries()) {
                const ing = allIngredients.find(i => i.id === ingId);
                if (!ing) {
                    showToast(`Ingrédient inconnu détecté`);
                    success = false;
                    break;
                }
                batch.update(doc(ingredientsCol, ingId), { quantity: increment(-qtyToDeduct) });
            }
        } else {
            const ingredientId = document.getElementById('loss-ingredient-select').value;
            const ingredient = allIngredients.find(i => i.id === ingredientId);
            if (!ingredient) return showToast("Ingrédient non trouvé.");
            
            lossData.itemId = ingredientId;
            lossData.itemName = ingredient.name;
            lossData.unit = ingredient.unit;
            lossData.type = 'ingredient';
            batch.update(doc(ingredientsCol, ingredientId), { quantity: increment(-quantity) });
        }

        if (success) {
            batch.set(doc(lossesCol), lossData);
            try {
                await batch.commit();
                showToast('Perte enregistrée et stock mis à jour !');
                closeModal('loss-modal');
            } catch (error) {
                console.error("Loss commit failed: ", error);
                showToast(`Erreur: ${error.message}`);
            }
        }
    });
    
    // Delete Loss
    document.getElementById('loss-history-list').addEventListener('click', async e => {
        const deleteBtn = e.target.closest('.delete-loss-btn');
        if (deleteBtn) {
            const lossId = deleteBtn.dataset.id;
            const loss = allLosses.find(l => l.id === lossId);
            if (!loss) return;
            
            if (confirm("Voulez-vous vraiment annuler cette perte ?\n\nLe stock sera restauré.")) {
                const batch = writeBatch(db);
                
                if (loss.type === 'product') {
                    const product = allProducts.find(p => p.id === loss.itemId);
                    if (product) {
                        if (product.recipe && product.recipe.length > 0) {
                            for (const recipeItem of product.recipe) {
                                batch.update(doc(ingredientsCol, recipeItem.id), {
                                    quantity: increment(recipeItem.quantity * loss.quantity)
                                });
                            }
                        } else if (product.linkedIngredientId) {
                            const linkedQtyPerProduct = product.linkedIngredientQuantity || 1;
                            const totalQtyToRestore = linkedQtyPerProduct * loss.quantity;
                            batch.update(doc(ingredientsCol, product.linkedIngredientId), {
                                quantity: increment(totalQtyToRestore)
                            });
                        }
                    }
                } else {
                    batch.update(doc(ingredientsCol, loss.itemId), {
                        quantity: increment(loss.quantity)
                    });
                }
                
                batch.delete(doc(lossesCol, lossId));
                
                try {
                    await batch.commit();
                    showToast("Perte annulée et stock restauré.");
                } catch (error) {
                    console.error("Error restoring stock from loss:", error);
                    showToast("Erreur lors de l'annulation de la perte.");
                }
            }
        }
    });
};

