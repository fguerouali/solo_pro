/**
 * UI - Renderers
 * Fonctions de rendu pour toutes les vues
 */

import { LOW_STOCK_THRESHOLD } from '../core/constants.js';
import { formatDateToDDMMYYYY, toDate, calculateProductCost } from '../core/helpers.js';
import { getAllIngredients, getAllProducts } from '../core/state.js';

/**
 * Rend la liste des ingrédients
 */
export const renderIngredients = (ingredients) => {
    const list = document.getElementById('ingredients-list');
    const placeholder = document.getElementById('ingredients-placeholder');
    const table = document.getElementById('ingredients-table');
    list.innerHTML = '';
    
    if (ingredients.length === 0) {
        table.style.display = 'none';
        placeholder.style.display = 'block';
    } else {
        table.style.display = '';
        placeholder.style.display = 'none';
        ingredients.forEach(ing => {
            const isLow = ing.quantity < LOW_STOCK_THRESHOLD;
            const row = document.createElement('tr');
            row.className = isLow ? 'low-stock' : '';
            const costDisplay = (ing.cost && ing.cost > 0) ? `${ing.cost.toFixed(2)} Mad` : 'N/A';
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">${ing.name}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="${isLow ? 'low-stock-text' : ''}">${ing.quantity}</span> 
                    <span class="text-gray-500">${ing.unit}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${costDisplay}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button data-id="${ing.id}" class="edit-ingredient-btn text-gray-600 hover:text-gray-900 mr-4">Modifier</button>
                    <button data-id="${ing.id}" class="delete-ingredient-btn text-red-600 hover:text-red-900">Supprimer</button>
                </td>
            `;
            list.appendChild(row);
        });
    }
};

/**
 * Rend la liste des produits
 */
export const renderProducts = (products, allIngredients) => {
    const container = document.getElementById('products-list');
    const placeholder = document.getElementById('products-placeholder');
    container.innerHTML = '';
    
    if (products.length === 0) {
        container.innerHTML = '';
        container.appendChild(placeholder);
    } else {
        products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col justify-between';
            const typeIcon = {
                Entrée: '<i class="fas fa-concierge-bell"></i>',
                Pizza: '<i class="fas fa-pizza-slice"></i>',
                Boisson: '<i class="fas fa-wine-bottle"></i>',
                Dessert: '<i class="fas fa-ice-cream"></i>',
                Autre: '<i class="fas fa-box"></i>'
            };
            
            let contentHtml = '';
            if (product.recipe && product.recipe.length > 0) {
                let recipeHtml = product.recipe.map(r => {
                    const ingredientDetails = allIngredients.find(ing => ing.id === r.id);
                    let costHtml = '';
                    if (ingredientDetails && ingredientDetails.cost > 0) {
                        const itemCost = r.quantity * ingredientDetails.cost;
                        costHtml = `<span class="font-semibold text-gray-600">${itemCost.toFixed(2)} Mad</span>`;
                    }
                    return `<li class="flex justify-between items-center">
                                <span>- ${r.quantity} ${r.unit} ${r.name}</span>
                                ${costHtml}
                            </li>`;
                }).join('');
                
                contentHtml = `<div class="mt-2">
                                    <h4 class="font-semibold text-sm text-gray-600">Recette:</h4>
                                    <ul class="text-gray-500 text-sm space-y-1 mt-1">${recipeHtml}</ul>
                                </div>`;
            } else if (product.linkedIngredientId) {
                const linkedIngredient = allIngredients.find(i => i.id === product.linkedIngredientId);
                contentHtml = `<div class="mt-2">
                                <h4 class="font-semibold text-sm text-gray-600">Article en stock:</h4>
                                <p class="text-gray-500 text-sm">${linkedIngredient ? linkedIngredient.name : 'Non lié'}</p>
                            </div>`;
            }
            
            const productCost = calculateProductCost(product, allIngredients);
            card.innerHTML = `
                <div class="p-6">
                    <div class="flex justify-between items-start">
                        <div>
                            <h3 class="text-xl font-bold text-gray-900">${product.name}</h3>
                            <p class="text-gray-500 text-xs">Coût de revient: ${productCost.toFixed(2)} Mad</p>
                        </div>
                        <span class="text-gray-400 text-xl">${typeIcon[product.type]}</span>
                    </div>
                    <div class="flex-grow">${contentHtml}</div>
                    <p class="text-gray-800 font-bold text-2xl text-right mt-4">${product.price.toFixed(2)} Mad</p>
                </div>
                <div class="bg-gray-50 px-6 py-3 flex justify-end gap-3">
                    <button data-id="${product.id}" class="edit-product-btn text-gray-600 hover:text-gray-900 font-medium">Modifier</button>
                    <button data-id="${product.id}" class="delete-product-btn text-red-600 hover:text-red-900 font-medium">Supprimer</button>
                </div>
            `;
            container.appendChild(card);
        });
    }
};

/**
 * Rend l'historique des ventes
 */
export const renderOrderHistory = (history) => {
    const container = document.getElementById('order-history-list');
    const placeholder = document.getElementById('order-history-placeholder');
    container.innerHTML = '';
    
    if (history.length === 0) {
        container.innerHTML = '';
        container.appendChild(placeholder);
    } else {
        history.forEach(order => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-xl shadow-md';
            const displayDate = formatDateToDDMMYYYY(order.saleDate || order.createdAt);
            
            const itemsHtml = order.items.map(item => {
                const refundTag = (item.returned && item.returned > 0)
                    ? `<span class="text-red-600 font-semibold ml-2">(remb)</span>`
                    : '';
                return `<li>${item.quantity} x ${item.name}${refundTag}</li>`;
            }).join('');
            
            const billNoHtml = order.billNo ? `<p class="text-xs text-gray-500 font-mono">Facture API: ${order.billNo}</p>` : '';
            const discountTagHtml = order.hadDiscount
                ? `<span class="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold ml-2 px-2 py-0.5 rounded-full">Rabais</span>`
                : '';
            
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-gray-700">Vente du ${displayDate}</p>
                        <div class="flex items-center mt-1">
                            ${billNoHtml}
                            ${discountTagHtml}
                        </div>
                        <ul class="list-disc list-inside text-sm text-gray-600 mt-2">${itemsHtml}</ul>
                    </div>
                    <div class="flex items-center gap-4 text-right">
                        <p class="font-bold text-lg text-gray-800">${order.totalPrice.toFixed(2)} Mad</p>
                        <button data-id="${order.id}" class="delete-order-btn text-gray-400 hover:text-red-600 transition-colors">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }
};

/**
 * Rend la liste des fournisseurs
 */
export const renderSuppliers = (suppliers) => {
    const container = document.getElementById('suppliers-list');
    const placeholder = document.getElementById('suppliers-placeholder');
    container.innerHTML = '';
    
    if (suppliers.length === 0) {
        container.innerHTML = '';
        container.appendChild(placeholder);
    } else {
        suppliers.forEach(sup => {
            const div = document.createElement('div');
            div.className = "bg-white p-3 rounded-lg shadow-sm flex justify-between items-center";
            div.innerHTML = `
                <div>
                    <p class="font-semibold">${sup.name}</p>
                    <p class="text-sm text-gray-500">${sup.contact || ''}</p>
                </div>
                <div>
                    <button data-id="${sup.id}" class="edit-supplier-btn text-gray-400 hover:text-gray-800 mr-2">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button data-id="${sup.id}" class="delete-supplier-btn text-gray-400 hover:text-red-600">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    }
};

/**
 * Rend l'historique des pertes
 */
export const renderLossHistory = (losses) => {
    const container = document.getElementById('loss-history-list');
    const placeholder = document.getElementById('loss-history-placeholder');
    container.innerHTML = '';
    
    if (losses.length === 0) {
        container.innerHTML = '';
        container.appendChild(placeholder);
    } else {
        losses.forEach(loss => {
            const card = document.createElement('div');
            card.className = 'bg-yellow-50 p-4 rounded-xl shadow-md border-l-4 border-yellow-400';
            const date = loss.createdAt ? new Date(loss.createdAt.seconds * 1000).toLocaleString('fr-FR') : 'Date inconnue';
            const reasonHtml = loss.reason ? `<p class="text-sm text-gray-500 italic mt-1">"${loss.reason}"</p>` : '';
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-yellow-800">Perte du ${date}</p>
                        <p class="text-gray-700 mt-2">
                            <span class="font-semibold">${loss.quantity} ${loss.unit || ''}</span> de 
                            <span class="font-semibold">${loss.itemName}</span>
                        </p>
                        ${reasonHtml}
                    </div>
                    <div class="flex items-center gap-4 text-right">
                        <button data-id="${loss.id}" class="delete-loss-btn text-gray-400 hover:text-red-600 transition-colors">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }
};

/**
 * Rend la liste des charges
 */
export const renderCharges = (charges) => {
    const container = document.getElementById('charges-list');
    const placeholder = document.getElementById('charges-placeholder');
    container.innerHTML = '';
    
    if (charges.length === 0) {
        container.appendChild(placeholder);
    } else {
        charges.forEach(charge => {
            const card = document.createElement('div');
            card.className = 'bg-white p-3 rounded-lg shadow-sm flex justify-between items-center';
            
            const d = toDate(charge.date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const displayDate = `${day}/${month}/${year}`;
            
            card.innerHTML = `
                <div>
                    <p class="font-semibold text-gray-800">${charge.name}</p>
                    <p class="text-sm text-gray-500">${displayDate}</p>
                </div>
                <div class="flex items-center gap-4">
                    <p class="font-bold text-lg text-red-600">${charge.amount.toFixed(2)} Mad</p>
                    <button data-id="${charge.id}" class="delete-charge-btn text-gray-400 hover:text-red-600 transition-colors">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    }
};

/**
 * Rend la liste des salariés
 */
export const renderEmployees = (employees) => {
    const container = document.getElementById('employees-list');
    const placeholder = document.getElementById('employees-placeholder');
    container.innerHTML = '';
    
    if (employees.length === 0) {
        container.appendChild(placeholder);
    } else {
        employees.forEach(employee => {
            const card = document.createElement('div');
            card.className = `bg-white p-4 rounded-lg shadow-sm ${!employee.active ? 'opacity-60' : ''}`;
            
            const startDate = toDate(employee.startDate);
            const formattedStartDate = startDate 
                ? `${startDate.getDate().toString().padStart(2, '0')}/${(startDate.getMonth() + 1).toString().padStart(2, '0')}/${startDate.getFullYear()}` 
                : 'N/A';
            
            const statusBadge = employee.active
                ? '<span class="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Actif</span>'
                : '<span class="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">Inactif</span>';
            
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex-grow">
                        <div class="flex items-center gap-2 mb-1">
                            <h3 class="font-semibold text-gray-900">${employee.name}</h3>
                            ${statusBadge}
                        </div>
                        <p class="text-sm text-gray-600">Salaire: <span class="font-semibold">${employee.monthlySalary.toFixed(2)} Mad/mois</span></p>
                        <p class="text-xs text-gray-500">Embauché le: ${formattedStartDate}</p>
                    </div>
                    <div class="flex gap-2">
                        <button data-id="${employee.id}" class="manage-absences-btn text-yellow-600 hover:text-yellow-800" title="Gérer absences">
                            <i class="fas fa-calendar-times"></i>
                        </button>
                        <button data-id="${employee.id}" class="edit-employee-btn text-gray-600 hover:text-gray-900" title="Modifier">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button data-id="${employee.id}" class="delete-employee-btn text-red-600 hover:text-red-900" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }
};

