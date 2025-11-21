import { firebase } from '../services/firebase-service.js';
import { db, ordersCol, ingredientsCol } from '../config/firebase.js';
import { showToast, getTodayDateString, formatDateToDDMMYYYY, toDate } from '../core/helpers.js';
import { getAllProducts, getAllIngredients, getOrderHistory, getCurrentOrder, setCurrentOrder } from '../core/state.js';
import { renderCurrentOrder } from '../ui/renderers-extended.js';
import { renderOrderHistory } from '../ui/renderers.js';
import { doc, writeBatch, serverTimestamp, increment, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const setupOrdersEventListeners = () => {
    // Set default sale date
    document.getElementById('sale-date').value = getTodayDateString();

    // Add to Order Form
    document.getElementById('add-to-order-form').addEventListener('submit', e => {
        e.preventDefault();
        const productId = document.getElementById('order-product-select').value;
        const quantity = parseInt(document.getElementById('order-product-quantity').value);
        const product = allProducts.find(p => p.id === productId);
        
        if (!product || isNaN(quantity) || quantity <= 0) return;
        
        const order = [...currentOrder];
        const existingItem = order.find(item => item.id === productId);
        
        if(existingItem) {
            existingItem.quantity += quantity;
        } else {
            order.push({
                id: product.id,
                name: product.name,
                quantity: quantity,
                price: product.price
            });
        }
        
        setCurrentOrder(order);
        renderCurrentOrder();
    });
    
    // Remove Item from Current Order
    document.getElementById('current-order-list').addEventListener('click', e => {
        const button = e.target.closest('.remove-order-item');
        if (button) {
            const order = [...currentOrder];
            order.splice(button.dataset.index, 1);
            setCurrentOrder(order);
            renderCurrentOrder();
        }
    });
    
    // Process Order Button
    document.getElementById('process-order-btn').addEventListener('click', async () => {
        if (currentOrder.length === 0) return;
        
        const totalPriceInput = document.getElementById('current-order-total-input');
        const totalPrice = parseFloat(totalPriceInput.value);

        if (isNaN(totalPrice) || totalPrice < 0) {
            showToast("Le montant total de la vente est invalide.");
            return;
        }
        
        const batch = writeBatch(db);
        const tempDeductions = new Map();

        for (const orderItem of currentOrder) {
            const product = allProducts.find(p => p.id === orderItem.id);
            if (!product) {
                showToast(`Produit non trouvé : ${orderItem.name}`);
                return;
            }
            
            if (product.recipe && product.recipe.length > 0) {
                for (const recipeItem of product.recipe) {
                    const current = tempDeductions.get(recipeItem.id) || 0;
                    tempDeductions.set(recipeItem.id, current + recipeItem.quantity * orderItem.quantity);
                }
            } else if (product.linkedIngredientId) {
                const linkedQtyPerProduct = product.linkedIngredientQuantity || 1;
                const totalQtyToDeduct = linkedQtyPerProduct * orderItem.quantity;
                const current = tempDeductions.get(product.linkedIngredientId) || 0;
                tempDeductions.set(product.linkedIngredientId, current + totalQtyToDeduct);
            }
        }
        
        for (const [ingId, qty] of tempDeductions.entries()) {
            const ing = allIngredients.find(i => i.id === ingId);
            if (!ing) {
                showToast(`Ingrédient inconnu détecté`);
                return;
            }
            batch.update(doc(ingredientsCol, ingId), { quantity: increment(-qty) });
        }
        
        const saleDateInput = document.getElementById('sale-date').value;
        const saleDate = saleDateInput ? new Date(saleDateInput) : new Date();
        saleDate.setHours(12, 0, 0, 0);

        batch.set(doc(ordersCol), {
            items: currentOrder,
            totalPrice: totalPrice,
            createdAt: serverTimestamp(),
            saleDate: saleDate
        });
        
        try {
            await batch.commit();
            showToast('Vente validée, stock mis à jour !');
            setCurrentOrder([]);
            renderCurrentOrder();
            totalPriceInput.value = '0.00';
        } catch (error) {
            console.error("Batch commit failed: ", error);
            showToast(`Erreur: ${error.message}`);
        }
    });
    
    // Delete Order
    document.getElementById('order-history-list').addEventListener('click', async e => {
        const deleteBtn = e.target.closest('.delete-order-btn');
        if (deleteBtn) {
            const orderId = deleteBtn.dataset.id;
            const order = orderHistory.find(o => o.id === orderId);
            if (!order) return;
            
            if (confirm("Voulez-vous vraiment supprimer cette vente ?\n\nLe stock utilisé sera automatiquement restauré.")) {
                const batch = writeBatch(db);
                
                for (const item of order.items) {
                    const prod = allProducts.find(p => p.id === item.id);
                    if (!prod) continue;
                    
                    if (prod.recipe && prod.recipe.length > 0) {
                        for (const recipeItem of prod.recipe) {
                            batch.update(doc(ingredientsCol, recipeItem.id), {
                                quantity: increment(recipeItem.quantity * item.quantity)
                            });
                        }
                    } else if (prod.linkedIngredientId) {
                        const linkedQtyPerProduct = prod.linkedIngredientQuantity || 1;
                        const totalQtyToRestore = linkedQtyPerProduct * item.quantity;
                        batch.update(doc(ingredientsCol, prod.linkedIngredientId), {
                            quantity: increment(totalQtyToRestore)
                        });
                    }
                }
                
                batch.delete(doc(ordersCol, orderId));
                
                try {
                    await batch.commit();
                    showToast("Vente supprimée et stock restauré.");
                } catch (error) {
                    console.error("Error restoring stock:", error);
                    showToast("Erreur lors de la suppression.");
                }
            }
        }
    });

    // Date Filter for History
    const handleDateFilter = () => {
        const filterValue = document.getElementById('history-date-filter').value;
        if (!filterValue) {
            renderOrderHistory(orderHistory);
            return;
        }

        const filterDate = new Date(filterValue);
        filterDate.setUTCHours(0, 0, 0, 0);
        const filterTime = filterDate.getTime();

        const filtered = orderHistory.filter(order => {
            const orderDateSource = order.saleDate || order.createdAt;
            if (!orderDateSource) return false;

            const orderDate = orderDateSource.seconds ? new Date(orderDateSource.seconds * 1000) : orderDateSource;
            orderDate.setUTCHours(0, 0, 0, 0);
            
            return orderDate.getTime() === filterTime;
        });
        renderOrderHistory(filtered);
    };

    document.getElementById('history-date-filter').addEventListener('input', handleDateFilter);

    // Import/Export Buttons
    document.getElementById('import-orders-btn').addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('openImport', { detail: { type: 'orders' } }));
    });

    document.getElementById('export-orders-btn').addEventListener('click', () => {
        let csv = "date,produits,quantites,prix_total\n";
        orderHistory.forEach(o => {
            const date = formatDateToDDMMYYYY(o.saleDate || o.createdAt);
            const p = o.items.map(i => i.name).join(';');
            const q = o.items.map(i => i.quantity).join(';');
            csv += `${date},"${p}","${q}",${o.totalPrice.toFixed(2)}\n`;
        });
        downloadCSV(csv, 'historique_ventes.csv');
    });
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

