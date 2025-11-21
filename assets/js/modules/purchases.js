import { firebase } from '../services/firebase-service.js';
import { db, purchaseOrdersCol, ingredientsCol, storage, appId } from '../config/firebase.js';
import { showToast, getTodayDateString } from '../core/helpers.js';
import { openModal, closeModal } from '../ui/modals.js';
import { allSuppliers, allPurchaseOrders, allIngredients, currentPurchaseOrderItems, setCurrentPurchaseOrderItems } from '../core/state.js';
import { renderCurrentPurchaseOrderItems } from '../ui/renderers-extended.js';
import { doc, updateDoc, getDoc, writeBatch, deleteDoc, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

export const setupPurchasesEventListeners = () => {
    // Populate supplier selects
    populateSupplierSelects();

    // === SUPPLIERS ===
    document.getElementById('add-supplier-btn').addEventListener('click', () => {
        document.getElementById('supplier-modal-title').textContent = 'Ajouter un Fournisseur';
        document.getElementById('supplier-form').reset();
        document.getElementById('supplier-id').value = '';
        openModal('supplier-modal');
    });

    document.getElementById('cancel-supplier').addEventListener('click', () => closeModal('supplier-modal'));

    document.getElementById('supplier-form').addEventListener('submit', async e => {
        e.preventDefault();
        const id = document.getElementById('supplier-id').value;
        const data = {
            name: document.getElementById('supplier-name').value,
            contact: document.getElementById('supplier-contact').value
        };
        try {
            if (id) await firebase.updateSupplier(id, data);
            else await firebase.addSupplier(data);
            showToast(id ? 'Fournisseur mis à jour' : 'Fournisseur ajouté');
            closeModal('supplier-modal');
        } catch(error) {
            showToast('Erreur');
        }
    });

    document.getElementById('suppliers-list').addEventListener('click', async e => {
        const target = e.target.closest('button');
        if (!target) return;
        const id = target.dataset.id;
        
        if (target.classList.contains('delete-supplier-btn')) {
            if (confirm('Supprimer ce fournisseur ?')) {
                await firebase.deleteSupplier(id);
            }
        } else if (target.classList.contains('edit-supplier-btn')) {
            const sup = allSuppliers.find(s => s.id === id);
            document.getElementById('supplier-id').value = id;
            document.getElementById('supplier-name').value = sup.name;
            document.getElementById('supplier-contact').value = sup.contact;
            openModal('supplier-modal');
        }
    });

    // === PURCHASE ORDERS ===
    document.getElementById('add-purchase-order-btn').addEventListener('click', () => {
        document.getElementById('purchase-order-form').reset();
        document.getElementById('po-id').value = '';
        document.getElementById('po-modal-title').textContent = 'Nouvelle Commande Fournisseur';
        document.querySelector('input[name="po-payment-status"][value="unpaid"]').checked = true;
        setCurrentPurchaseOrderItems([]);
        renderCurrentPurchaseOrderItems();
        openModal('purchase-order-modal');
    });

    document.getElementById('cancel-purchase-order').addEventListener('click', () => closeModal('purchase-order-modal'));

    // Add item to purchase order
    document.getElementById('add-po-item-btn').addEventListener('click', () => {
        const select = document.getElementById('po-ingredient-select');
        const ingredientId = select.value;
        const quantityInput = document.getElementById('po-quantity');
        const priceInput = document.getElementById('po-price');
        const quantity = parseFloat(quantityInput.value);
        const pricePerUnit = parseFloat(priceInput.value);
        
        if (!ingredientId || isNaN(quantity) || quantity <= 0 || isNaN(pricePerUnit) || pricePerUnit < 0) {
            return showToast('Veuillez sélectionner un ingrédient et entrer une quantité et un prix par unité valides.');
        }
        
        const ingredient = allIngredients.find(i => i.id === ingredientId);
        const items = [...currentPurchaseOrderItems, {
            id: ingredient.id,
            name: ingredient.name,
            unit: ingredient.unit,
            quantity,
            price: pricePerUnit
        }];
        setCurrentPurchaseOrderItems(items);
        renderCurrentPurchaseOrderItems();
        select.value = '';
        quantityInput.value = '';
        priceInput.value = '';
    });

    // Update item quantity/price in list
    document.getElementById('po-items-list').addEventListener('change', e => {
        const input = e.target;
        if (input.classList.contains('po-item-input')) {
            const index = parseInt(input.dataset.index, 10);
            const field = input.dataset.field;
            const value = parseFloat(input.value);

            if (index >= 0 && index < currentPurchaseOrderItems.length && field && !isNaN(value)) {
                const items = [...currentPurchaseOrderItems];
                items[index][field] = value;
                setCurrentPurchaseOrderItems(items);
                renderCurrentPurchaseOrderItems();
            }
        }
    });

    // Remove item from purchase order
    document.getElementById('po-items-list').addEventListener('click', e => {
        const button = e.target.closest('.remove-po-item-btn');
        if (button) {
            const items = [...currentPurchaseOrderItems];
            items.splice(button.dataset.index, 1);
            setCurrentPurchaseOrderItems(items);
            renderCurrentPurchaseOrderItems();
        }
    });

    // Purchase Order Form Submission
    document.getElementById('purchase-order-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const poId = document.getElementById('po-id').value;
        const supplierId = document.getElementById('po-supplier-select').value;
        const fileInput = document.getElementById('po-invoice-file');
        const file = fileInput.files[0];

        if (!supplierId || currentPurchaseOrderItems.length === 0) {
            showToast('Fournisseur et articles requis.');
            return;
        }

        const totalCost = parseFloat(document.getElementById('po-total-cost-input').value);
        if (isNaN(totalCost) || totalCost < 0) {
            showToast("Le total de la commande est invalide.");
            return;
        }
        
        const paymentStatus = document.querySelector('input[name="po-payment-status"]:checked').value;

        let invoiceUrl = '';
        const existingPo = poId ? allPurchaseOrders.find(po => po.id === poId) : null;

        if (existingPo && existingPo.invoiceUrl && !file) {
            invoiceUrl = existingPo.invoiceUrl;
        }

        const saveOrderData = async (url) => {
            try {
                const data = {
                    supplierId,
                    items: currentPurchaseOrderItems,
                    totalCost: totalCost,
                    invoiceUrl: url,
                    paymentStatus: paymentStatus
                };

                if (poId) {
                    if (existingPo) {
                        data.status = existingPo.status || 'pending';
                        data.createdAt = existingPo.createdAt || serverTimestamp();
                        if (existingPo.receivedAt) {
                            data.receivedAt = existingPo.receivedAt;
                        }
                        if (paymentStatus === 'paid' && !existingPo.paidAt) {
                            data.paidAt = serverTimestamp();
                        } else if (existingPo.paidAt) {
                            data.paidAt = existingPo.paidAt;
                        }
                    }
                    await updateDoc(doc(purchaseOrdersCol, poId), data);
                    showToast('Commande fournisseur mise à jour');
                } else {
                    data.status = 'pending';
                    data.createdAt = serverTimestamp();
                    if (paymentStatus === 'paid') {
                        data.paidAt = serverTimestamp();
                    }
                    await firebase.addPurchaseOrder(data);
                    showToast('Commande fournisseur créée');
                }
                closeModal('purchase-order-modal');
            } catch (dbError) {
                console.error("Error saving purchase order:", dbError);
                showToast(`Erreur lors de l'enregistrement: ${dbError.message}`);
            } finally {
                fileInput.value = '';
            }
        };

        if (file) {
            try {
                const storageRef = ref(storage, `invoices/${appId}/${Date.now()}-${file.name}`);
                const uploadTask = await uploadBytes(storageRef, file);
                invoiceUrl = await getDownloadURL(uploadTask.ref);
                await saveOrderData(invoiceUrl);
            } catch (uploadError) {
                console.error("Error uploading file:", uploadError);
                showToast(`Erreur lors de l'envoi de la facture: ${uploadError.message}`);
                fileInput.value = '';
            }
        } else {
            await saveOrderData(invoiceUrl);
        }
    });

    // Purchase Order Actions (Receive, Delete, Edit, Reorder, Pay)
    document.getElementById('purchase-orders-list').addEventListener('click', async e => {
        const target = e.target.closest('button[data-id]');
        if (!target) return;
        const poId = target.dataset.id;
        
        if (target.classList.contains('receive-po-btn')) {
            const poDoc = await getDoc(doc(purchaseOrdersCol, poId));
            const purchaseOrder = poDoc.data();
            const batch = writeBatch(db);
            
            purchaseOrder.items.forEach(item => {
                const ingRef = doc(ingredientsCol, item.id);
                const quantityToAdd = Number(item.quantity) || 0;
                if (quantityToAdd > 0) {
                    batch.update(ingRef, { quantity: increment(quantityToAdd) });
                } else {
                    console.warn(`Invalid quantity for item ${item.name} in PO ${poId}`);
                }
            });
            
            batch.update(doc(purchaseOrdersCol, poId), { status: 'received', receivedAt: serverTimestamp() });
            await batch.commit();
            showToast('Stock mis à jour !');
            
        } else if (target.classList.contains('delete-po-btn')) {
            const poToDelete = allPurchaseOrders.find(po => po.id === poId);
            if (confirm('Voulez-vous vraiment supprimer cette commande fournisseur ?')) {
                try {
                    if (poToDelete && poToDelete.invoiceUrl) {
                        try {
                            const fileRef = ref(storage, poToDelete.invoiceUrl);
                            await deleteObject(fileRef);
                        } catch (storageError) {
                            console.error("Error deleting invoice:", storageError);
                        }
                    }
                    await firebase.deletePurchaseOrder(poId);
                    showToast('Commande fournisseur supprimée.');
                } catch (error) {
                    console.error("Error deleting purchase order:", error);
                    showToast('Erreur lors de la suppression.');
                }
            }
            
        } else if (target.classList.contains('edit-po-btn')) {
            const purchaseOrder = allPurchaseOrders.find(po => po.id === poId);
            if (!purchaseOrder) return;
            
            const isReceived = purchaseOrder.status === 'received';
            
            document.getElementById('po-modal-title').textContent = isReceived
                ? 'Modifier le Montant (Commande Réceptionnée)'
                : 'Modifier la Commande Fournisseur';
                
            document.getElementById('po-id').value = poId;
            document.getElementById('po-supplier-select').value = purchaseOrder.supplierId;
            
            document.getElementById('po-supplier-select').disabled = isReceived;
            document.getElementById('po-ingredient-select').disabled = isReceived;
            document.getElementById('po-quantity').disabled = isReceived;
            document.getElementById('po-price').disabled = isReceived;
            document.getElementById('add-po-item-btn').disabled = isReceived;
            
            setTimeout(() => {
                const itemInputs = document.querySelectorAll('.po-item-input');
                itemInputs.forEach(input => input.disabled = isReceived);
                const removeButtons = document.querySelectorAll('.remove-po-item-btn');
                removeButtons.forEach(btn => btn.style.display = isReceived ? 'none' : 'block');
            }, 100);
            
            const paymentStatusValue = purchaseOrder.paymentStatus || 'unpaid';
            document.querySelector(`input[name="po-payment-status"][value="${paymentStatusValue}"]`).checked = true;
            
            document.querySelectorAll('input[name="po-payment-status"]').forEach(radio => {
                radio.disabled = isReceived;
            });

            const items = purchaseOrder.items.map(item => ({
                ...item,
                price: Number(item.price) || 0
            }));
            setCurrentPurchaseOrderItems(items);
            renderCurrentPurchaseOrderItems();
            
            const calculatedTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            document.getElementById('po-total-cost-input').value = (purchaseOrder.totalCost || calculatedTotal).toFixed(2);
            document.getElementById('po-total-cost-input').disabled = false;
            
            document.getElementById('po-invoice-file').value = '';
            openModal('purchase-order-modal');

        } else if (target.classList.contains('reorder-po-btn')) {
            const poToReorder = allPurchaseOrders.find(po => po.id === poId);
            if (!poToReorder) return;
            
            document.getElementById('purchase-order-form').reset();
            document.getElementById('po-id').value = '';
            document.getElementById('po-modal-title').textContent = 'Nouvelle Commande Fournisseur (Relance)';
            document.getElementById('po-supplier-select').value = poToReorder.supplierId;
            document.querySelector('input[name="po-payment-status"][value="unpaid"]').checked = true;
            
            const items = poToReorder.items.map(item => ({
                ...item,
                price: Number(item.price) || 0
            }));
            setCurrentPurchaseOrderItems(items);
            renderCurrentPurchaseOrderItems();
            document.getElementById('po-invoice-file').value = '';
            openModal('purchase-order-modal');
            
        } else if (target.classList.contains('pay-po-btn')) {
            if (confirm("Voulez-vous marquer cette commande comme 'Payé' ?")) {
                try {
                    await updateDoc(doc(purchaseOrdersCol, poId), {
                        paymentStatus: 'paid',
                        paidAt: serverTimestamp()
                    });
                    showToast('Commande marquée comme payée !');
                } catch (error) {
                    console.error("Erreur lors de la mise à jour du paiement:", error);
                    showToast('Erreur lors de la mise à jour.');
                }
            }
        }
    });
};

export const populateSupplierSelects = () => {
    const select = document.getElementById('po-supplier-select');
    select.innerHTML = '<option value="">Choisir...</option>';
    allSuppliers.forEach(s => select.innerHTML += `<option value="${s.id}">${s.name}</option>`);
};

