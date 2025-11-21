/**
 * UI - Additional Renderers
 * Fonctions de rendu supplémentaires (Purchase Orders, Salary, Finance, etc.)
 */

import { formatDateToDDMMYYYY, toDate } from '../core/helpers.js';
import { getAllSuppliers } from '../core/state.js';

/**
 * Rend la liste des commandes fournisseurs
 */
export const renderPurchaseOrders = (purchaseOrders, allSuppliers) => {
    const container = document.getElementById('purchase-orders-list');
    const placeholder = document.getElementById('purchase-orders-placeholder');
    container.innerHTML = '';
    
    if (purchaseOrders.length === 0) {
        container.innerHTML = '';
        container.appendChild(placeholder);
    } else {
        purchaseOrders.forEach(po => {
            const supplier = allSuppliers.find(s => s.id === po.supplierId);
            const div = document.createElement('div');
            const isReceived = po.status === 'received';
            const isPaid = po.paymentStatus === 'paid';
            div.className = `bg-white p-3 rounded-lg shadow-sm`;
            
            const itemsHtml = po.items.map(i => 
                `<li>${i.quantity} ${i.unit} - ${i.name} (${(i.price || 0).toFixed(2)} Mad/unité)</li>`
            ).join('');
            const totalDisplay = `<p class="font-bold text-lg text-gray-800">${(po.totalCost || 0).toFixed(2)} Mad</p>`;
            
            const actionsHtml = `
                <div class="flex justify-between items-center mt-3 pt-3 border-t">
                    <div>
                        <button data-id="${po.id}" class="reorder-po-btn text-blue-500 hover:text-blue-800 text-sm font-medium mr-3">
                            <i class="fas fa-redo mr-1"></i> Relancer
                        </button>
                        <button data-id="${po.id}" class="edit-po-btn text-gray-500 hover:text-gray-800 text-sm font-medium mr-3">
                            <i class="fas fa-edit mr-1"></i> Modifier
                        </button>
                        ${!isReceived ? `<button data-id="${po.id}" class="delete-po-btn text-red-500 hover:text-red-800 text-sm font-medium">
                            <i class="fas fa-trash mr-1"></i> Supprimer
                        </button>` : ''}
                    </div>
                    <div class="flex gap-2">
                        ${!isPaid ? `<button data-id="${po.id}" class="pay-po-btn btn-secondary bg-green-100 hover:bg-green-200 text-green-800 text-sm py-1 px-3">
                            <i class="fas fa-check mr-1"></i> Marquer Payé
                        </button>` : ''}
                        ${!isReceived ? `<button data-id="${po.id}" class="receive-po-btn btn-primary text-sm py-1 px-3">Réceptionner</button>` : ''}
                    </div>
                </div>
            `;
            
            const paymentTag = `<span class="text-xs font-bold py-1 px-2 rounded-full ${isPaid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                ${isPaid ? 'Payé' : 'Non Payé'}
            </span>`;
            
            div.innerHTML = `
                <div class="p-3">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-semibold text-gray-800">${supplier ? supplier.name : 'Fournisseur inconnu'}</p>
                            <p class="text-xs text-gray-500">${formatDateToDDMMYYYY(po.createdAt)}</p>
                            <ul class="text-sm mt-2 list-disc list-inside">${itemsHtml}</ul>
                        </div>
                        <div class="text-right">
                            <div class="flex flex-col items-end gap-1">
                                <span class="text-xs font-bold py-1 px-2 rounded-full ${isReceived ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                                    ${isReceived ? 'Reçue' : 'En attente'}
                                </span>
                                ${paymentTag}
                            </div>
                            ${isReceived ? `<p class="text-xs text-gray-500 mt-1">Reçue le ${formatDateToDDMMYYYY(po.receivedAt)}</p>` : ''}
                            ${totalDisplay}
                            ${po.invoiceUrl ? `<a href="${po.invoiceUrl}" target="_blank" class="block text-sm text-gray-600 hover:text-gray-900 mt-2">
                                <i class="fas fa-file-invoice"></i> Facture
                            </a>` : ''}
                        </div>
                    </div>
                </div>
                ${actionsHtml}
            `;
            container.appendChild(div);
        });
    }
};

/**
 * Rend l'historique des paiements de salaires
 */
export const renderSalaryPaymentsHistory = (payments) => {
    const container = document.getElementById('salary-payments-history');
    const placeholder = document.getElementById('salary-payments-placeholder');
    container.innerHTML = '';
    
    if (payments.length === 0) {
        container.appendChild(placeholder);
    } else {
        payments.forEach(payment => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg shadow-sm';
            
            const paymentDate = toDate(payment.paymentDate);
            const formattedDate = paymentDate ? formatDateToDDMMYYYY(paymentDate) : 'Date inconnue';
            
            const employeesHtml = payment.employees.map(emp =>
                `<li class="flex justify-between text-sm">
                    <span>${emp.name}${emp.absenceDays > 0 ? ` <span class="text-yellow-600">(${emp.absenceDays}j abs.)</span>` : ''}</span>
                    <span class="font-semibold">${emp.finalSalary.toFixed(2)} Mad</span>
                </li>`
            ).join('');
            
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-grow">
                        <h3 class="font-semibold text-gray-900">Paiement du ${formattedDate}</h3>
                        <p class="text-xs text-gray-500">Mois: ${payment.month}</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <p class="text-lg font-bold text-red-600">${payment.totalAmount.toFixed(2)} Mad</p>
                        <button data-id="${payment.id}" class="delete-salary-payment-btn text-gray-400 hover:text-red-600 transition-colors" title="Supprimer ce paiement">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
                <ul class="space-y-1 border-t pt-2 mt-2">
                    ${employeesHtml}
                </ul>
            `;
            container.appendChild(card);
        });
    }
};

/**
 * Rend l'historique des déclarations journalières
 */
export const renderDailyPayments = (payments) => {
    const container = document.getElementById('daily-payments-list');
    const placeholder = document.getElementById('daily-payments-placeholder');
    container.innerHTML = '';
    
    if (payments.length === 0) {
        container.appendChild(placeholder);
    } else {
        payments.forEach(payment => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg shadow-sm';
            
            const date = toDate(payment.date);
            const formattedDate = date 
                ? `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`
                : 'Date inconnue';
            
            const totalDigital = payment.tpeAmount + payment.glovoAmount;
            const glovoCash = payment.glovoCashAmount || 0;
            const expectedCash = payment.totalSales - totalDigital;
            
            card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="font-semibold text-gray-900">${formattedDate}</h3>
                        <p class="text-sm text-gray-600">Total ventes : ${payment.totalSales.toFixed(2)} Mad</p>
                        <p class="text-xs text-orange-600">Glovo Cash : ${glovoCash.toFixed(2)} Mad</p>
                    </div>
                    <button data-id="${payment.id}" class="delete-daily-payment-btn text-gray-400 hover:text-red-600 transition-colors">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
                <div class="grid grid-cols-3 gap-2 text-sm">
                    <div class="bg-blue-50 p-2 rounded">
                        <p class="text-xs text-blue-600">TPE</p>
                        <p class="font-semibold">${payment.tpeAmount.toFixed(2)} Mad</p>
                    </div>
                    <div class="bg-purple-50 p-2 rounded">
                        <p class="text-xs text-purple-600">Glovo</p>
                        <p class="font-semibold">${payment.glovoAmount.toFixed(2)} Mad</p>
                    </div>
                    <div class="bg-green-50 p-2 rounded">
                        <p class="text-xs text-green-600">Espèces</p>
                        <p class="font-semibold">${expectedCash.toFixed(2)} Mad</p>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }
};

/**
 * Rend les absences d'un employé
 */
export const renderAbsencesForEmployee = (employeeId, allAbsences) => {
    const container = document.getElementById('absences-list');
    const employeeAbsences = allAbsences.filter(a => a.employeeId === employeeId);
    
    container.innerHTML = '';
    
    if (employeeAbsences.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Aucune absence enregistrée.</p>';
    } else {
        employeeAbsences.sort((a, b) => b.month.localeCompare(a.month));
        employeeAbsences.forEach(absence => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center bg-gray-50 p-2 rounded';
            div.innerHTML = `
                <div>
                    <span class="text-sm font-medium">${absence.month}</span>
                    <span class="text-xs text-gray-600 ml-2">${absence.days} jour(s)</span>
                </div>
                <button data-id="${absence.id}" class="delete-absence-btn text-red-500 hover:text-red-700">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(div);
        });
    }
};

/**
 * Rend le top 5 des produits (pizzas ou boissons)
 */
export const renderTopProducts = (topProducts, containerId, emptyMessage) => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (topProducts.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500 py-4">${emptyMessage}</p>`;
        return;
    }
    
    topProducts.forEach((product, index) => {
        const rankColors = ['bg-yellow-400', 'bg-gray-300', 'bg-orange-400', 'bg-blue-100', 'bg-blue-100'];
        const rankColor = rankColors[index] || 'bg-gray-100';
        
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors';
        item.innerHTML = `
            <div class="flex items-center gap-3 flex-grow">
                <span class="flex items-center justify-center w-8 h-8 rounded-full ${rankColor} font-bold text-gray-800">
                    ${index + 1}
                </span>
                <div class="flex-grow">
                    <p class="font-semibold text-gray-900">${product.name}</p>
                    <p class="text-sm text-gray-500">${product.revenue.toFixed(2)} Mad</p>
                </div>
            </div>
            <div class="text-right">
                <p class="text-2xl font-bold text-gray-800">${product.count}</p>
                <p class="text-xs text-gray-500">vendus</p>
            </div>
        `;
        container.appendChild(item);
    });
};

// Additional renderers for dynamic lists with input fields
import { getCurrentOrder, getCurrentPurchaseOrderItems, getCurrentRecipe, getAllIngredients } from '../core/state.js';
import { calculateProductCost } from '../core/helpers.js';

export const updateOrderTotal = () => {
    const currentOrder = getCurrentOrder();
    const total = currentOrder.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('current-order-total-input').value = total.toFixed(2);
};

export const renderCurrentOrder = () => {
    const currentOrder = getCurrentOrder();
    const list = document.getElementById('current-order-list');
    const orderListPlaceholder = document.getElementById('order-placeholder');
    const processBtn = document.getElementById('process-order-btn');
    list.innerHTML = '';

    if (currentOrder.length === 0) {
        list.appendChild(orderListPlaceholder);
        processBtn.disabled = true;
    } else {
        currentOrder.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center';
            li.innerHTML = `<span>${item.quantity} x ${item.name}</span><button data-index="${index}" class="remove-order-item text-gray-400 hover:text-red-500"><i class="fas fa-trash-alt"></i></button>`;
            list.appendChild(li);
        });
        processBtn.disabled = false;
    }
    updateOrderTotal();
};

export const updatePurchaseOrderTotal = () => {
    const currentPurchaseOrderItems = getCurrentPurchaseOrderItems();
    const total = currentPurchaseOrderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('po-total-cost-input').value = total.toFixed(2);
};

export const renderCurrentPurchaseOrderItems = () => {
    const currentPurchaseOrderItems = getCurrentPurchaseOrderItems();
    const list = document.getElementById('po-items-list');
    list.innerHTML = '';

    if (currentPurchaseOrderItems.length > 0) {
        list.innerHTML = `
            <div class="flex justify-between items-center text-sm font-medium text-gray-500 mb-1 px-2">
                <div class="flex-grow grid grid-cols-4 gap-2 items-center">
                    <span class="col-span-2">Article</span>
                    <span class="text-right">Quantité</span>
                    <span class="text-right">Prix/Unité</span>
                </div>
                <span class="ml-2 w-6"></span>
            </div>
        `;
    }

    currentPurchaseOrderItems.forEach((item, index) => {
        const li = document.createElement('div');
        li.className = 'flex justify-between items-center bg-gray-100 p-2 rounded';

        li.innerHTML = `
            <div class="flex-grow grid grid-cols-4 gap-2 items-center">
                <span class="col-span-2 text-sm">${item.name} (${item.unit})</span>

                <label class="sr-only" for="po-item-qty-${index}">Quantité ${item.name}</label>
                <input type="number" step="any" min="0" value="${item.quantity}" data-index="${index}" data-field="quantity"
                       id="po-item-qty-${index}"
                       class="po-item-input w-full p-1 border border-gray-300 rounded-lg shadow-sm text-right">

                <label class="sr-only" for="po-item-price-${index}">Prix ${item.name}</label>
                <input type="number" step="any" min="0" value="${(item.price || 0).toFixed(2)}" data-index="${index}" data-field="price"
                       id="po-item-price-${index}"
                       class="po-item-input w-full p-1 border border-gray-300 rounded-lg shadow-sm text-right">
            </div>
            <button type="button" data-index="${index}" class="remove-po-item-btn text-red-500 hover:text-red-700 ml-2 w-6 flex-shrink-0">
                <i class="fas fa-times-circle"></i>
            </button>
        `;
        list.appendChild(li);
    });
    updatePurchaseOrderTotal();
};

export const updateRecipeCost = () => {
    const currentRecipe = getCurrentRecipe();
    const allIngredients = getAllIngredients();
    const cost = currentRecipe.reduce((total, recipeItem) => {
        const ingredient = allIngredients.find(ing => ing.id === recipeItem.id);
        return total + ((ingredient?.cost || 0) * recipeItem.quantity);
    }, 0);
    document.getElementById('current-recipe-cost').textContent = `${cost.toFixed(2)} Mad`;
};

export const renderCurrentRecipe = () => {
    const currentRecipe = getCurrentRecipe();
    const list = document.getElementById('recipe-ingredients-list');
    list.innerHTML = '';
    currentRecipe.forEach((item, index) => {
        const li = document.createElement('div');
        li.className = 'flex justify-between items-center bg-gray-100 p-2 rounded';
        li.innerHTML = `<span>${item.quantity} ${item.unit} de ${item.name}</span><button type="button" data-index="${index}" class="remove-recipe-item text-red-500 hover:text-red-700"><i class="fas fa-times-circle"></i></button>`;
        list.appendChild(li);
    });
    updateRecipeCost();
};

