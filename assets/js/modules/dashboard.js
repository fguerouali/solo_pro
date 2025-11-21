/**
 * Dashboard Module
 * Module principal - KPIs et alertes
 */

import { LOW_STOCK_THRESHOLD } from '../core/constants.js';
import { toDate, calculateProductCost } from '../core/helpers.js';
import { renderTopProducts } from '../ui/renderers-extended.js';
import { getAllIngredients, getAllProducts, getOrderHistory, getAllPurchaseOrders, getAllLosses, getAllCharges } from '../core/state.js';

/**
 * Calcule et affiche tous les KPIs
 */
export const updateAndRenderKPIs = (startDate, endDate, label = "Période : Tout le temps") => {
    // Update filter label
    document.getElementById('kpi-filter-label').textContent = label;
    
    const orderHistory = getOrderHistory();
    const allPurchaseOrders = getAllPurchaseOrders();
    const allLosses = getAllLosses();
    const allCharges = getAllCharges();
    const allProducts = getAllProducts();
    const allIngredients = getAllIngredients();
    
    // Filter data based on date range if provided
    const filteredOrders = !startDate ? orderHistory : orderHistory.filter(o => {
        const orderDate = toDate(o.saleDate || o.createdAt);
        return orderDate && orderDate >= startDate && orderDate <= endDate;
    });
    
    const filteredPurchases = !startDate ? allPurchaseOrders.filter(p => p.status === 'received') : allPurchaseOrders.filter(p => {
        const receivedDate = toDate(p.receivedAt);
        return p.status === 'received' && receivedDate && receivedDate >= startDate && receivedDate <= endDate;
    });
    
    const filteredUnpaidPurchases = !startDate
        ? allPurchaseOrders.filter(p => p.status === 'received' && p.paymentStatus !== 'paid')
        : allPurchaseOrders.filter(p => {
            const receivedDate = toDate(p.receivedAt);
            return p.status === 'received' &&
                   p.paymentStatus !== 'paid' &&
                   receivedDate &&
                   receivedDate >= startDate &&
                   receivedDate <= endDate;
        });
    
    const filteredLosses = !startDate ? allLosses : allLosses.filter(l => {
        const lossDate = toDate(l.createdAt);
        return lossDate && lossDate >= startDate && lossDate <= endDate;
    });
    
    const filteredCharges = !startDate ? allCharges : allCharges.filter(c => {
        const chargeDate = toDate(c.date || c.createdAt);
        return chargeDate && chargeDate >= startDate && chargeDate <= endDate;
    });
    
    // --- KPI Calculations ---
    const totalSales = filteredOrders.reduce((sum, order) => sum + order.totalPrice, 0);
    const totalPurchases = filteredPurchases.reduce((sum, po) => sum + (po.totalCost || 0), 0);
    const totalUnpaidPurchases = filteredUnpaidPurchases.reduce((sum, po) => sum + (po.totalCost || 0), 0);
    const totalOrders = filteredOrders.length;
    
    const totalLossesValue = filteredLosses.reduce((sum, loss) => {
        let lossCost = 0;
        if (loss.type === 'product') {
            const product = allProducts.find(p => p.id === loss.itemId);
            if (product) lossCost = calculateProductCost(product, allIngredients) * loss.quantity;
        } else {
            const ingredient = allIngredients.find(i => i.id === loss.itemId);
            if (ingredient) lossCost = (ingredient.cost || 0) * loss.quantity;
        }
        return sum + lossCost;
    }, 0);
    
    let totalCogs = 0; // Cost of Goods Sold
    filteredOrders.forEach(order => {
        order.items.forEach(item => {
            const product = allProducts.find(p => p.id === item.id);
            if (product) {
                const productCost = calculateProductCost(product, allIngredients);
                totalCogs += productCost * item.quantity;
            }
        });
    });
    
    const totalPizzasSold = filteredOrders.reduce((pizzaCount, order) => {
        order.items.forEach(item => {
            const product = allProducts.find(p => p.id === item.id);
            if (product && product.type === 'Pizza') {
                pizzaCount += item.quantity;
            }
        });
        return pizzaCount;
    }, 0);
    
    // Calculated metrics
    const grossMargin = totalSales - totalCogs;
    const grossMarginRate = totalSales > 0 ? (grossMargin / totalSales) * 100 : 0;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const lossRate = totalSales > 0 ? (totalLossesValue / totalSales) * 100 : 0;
    const totalCharges = filteredCharges.reduce((sum, charge) => sum + charge.amount, 0);
    const netProfit = grossMargin - totalCharges;
    
    // --- Update KPI DOM ---
    document.getElementById('kpi-total-sales').textContent = `${totalSales.toFixed(2)} Mad`;
    document.getElementById('kpi-total-purchases').textContent = `${totalPurchases.toFixed(2)} Mad`;
    document.getElementById('kpi-unpaid-purchases').textContent = `${totalUnpaidPurchases.toFixed(2)} Mad`;
    document.getElementById('kpi-total-losses').textContent = `${totalLossesValue.toFixed(2)} Mad`;
    document.getElementById('kpi-total-orders').textContent = totalOrders;
    document.getElementById('kpi-total-pizzas').textContent = totalPizzasSold;
    document.getElementById('kpi-avg-order-value').textContent = `${avgOrderValue.toFixed(2)} Mad`;
    document.getElementById('kpi-loss-rate').textContent = `${lossRate.toFixed(1)} %`;
    document.getElementById('kpi-gross-margin').textContent = `${grossMargin.toFixed(2)} Mad`;
    document.getElementById('kpi-gross-margin-rate').textContent = `${grossMarginRate.toFixed(1)} %`;
    document.getElementById('kpi-total-charges').textContent = `${totalCharges.toFixed(2)} Mad`;
    document.getElementById('kpi-net-profit').textContent = `${netProfit.toFixed(2)} Mad`;
    
    // --- TOP 5 PIZZAS ET BOISSONS ---
    const topPizzas = calculateTop5(filteredOrders, 'Pizza', allProducts);
    const topDrinks = calculateTop5(filteredOrders, 'Boisson', allProducts);
    
    renderTopProducts(topPizzas, 'top-pizzas-list', 'Aucune pizza vendue dans cette période');
    renderTopProducts(topDrinks, 'top-drinks-list', 'Aucune boisson vendue dans cette période');
    
    // --- Low Stock Alerts (unfiltered) ---
    const container = document.getElementById('low-stock-alerts');
    const placeholder = document.getElementById('low-stock-placeholder');
    container.innerHTML = '';
    const lowStockItems = allIngredients.filter(ing => ing.quantity < LOW_STOCK_THRESHOLD);
    if (lowStockItems.length === 0) {
        container.innerHTML = '';
        container.appendChild(placeholder);
    } else {
        lowStockItems.forEach(item => {
            const alertDiv = document.createElement('div');
            alertDiv.className = 'bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow';
            alertDiv.innerHTML = `<p class="font-bold">${item.name}</p><p>Stock restant: ${item.quantity} ${item.unit}</p>`;
            container.appendChild(alertDiv);
        });
    }
};

/**
 * Calcule le top 5 des produits par type
 */
const calculateTop5 = (orders, productType, allProducts) => {
    const productCounts = {};
    
    orders.forEach(order => {
        order.items.forEach(item => {
            const product = allProducts.find(p => p.id === item.id);
            if (product && product.type === productType) {
                if (!productCounts[item.id]) {
                    productCounts[item.id] = {
                        name: item.name,
                        count: 0,
                        revenue: 0
                    };
                }
                productCounts[item.id].count += item.quantity;
                productCounts[item.id].revenue += item.quantity * item.price;
            }
        });
    });
    
    const sorted = Object.values(productCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    
    return sorted;
};

/**
 * Initialise les filtres KPI
 */
export const initializeKPIFilters = () => {
    document.getElementById('toggle-kpi-filters-btn').addEventListener('click', () => {
        document.getElementById('kpi-filter-container').classList.toggle('hidden');
    });
    
    document.querySelectorAll('.kpi-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.kpi-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('kpi-start-date').value = '';
            document.getElementById('kpi-end-date').value = '';
            
            const filterType = btn.dataset.filter;
            const now = new Date();
            let startDate, endDate = new Date(), label;
            endDate.setHours(23, 59, 59, 999);
            
            if (filterType === 'today') {
                startDate = new Date();
                startDate.setHours(0, 0, 0, 0);
                label = "Période : Aujourd'hui";
            } else if (filterType === 'yesterday') {
                startDate = new Date();
                startDate.setDate(now.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setDate(now.getDate() - 1);
                endDate.setHours(23, 59, 59, 999);
                label = "Période : Hier";
            } else if (filterType === 'week') {
                startDate = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)));
                startDate.setHours(0, 0, 0, 0);
                label = "Période : Cette semaine";
            } else if (filterType === 'month') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                startDate.setHours(0, 0, 0, 0);
                label = "Période : Ce mois";
            }
            updateAndRenderKPIs(startDate, endDate, label);
            document.getElementById('kpi-filter-container').classList.add('hidden');
        });
    });
    
    document.getElementById('kpi-filter-range-btn').addEventListener('click', () => {
        document.querySelectorAll('.kpi-filter-btn').forEach(b => b.classList.remove('active'));
        const startValue = document.getElementById('kpi-start-date').value;
        const endValue = document.getElementById('kpi-end-date').value;
        if (!startValue || !endValue) {
            const { showToast } = require('../core/helpers.js');
            return showToast("Veuillez sélectionner une date de début et de fin.");
        }
        
        const startDate = new Date(startValue);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(endValue);
        endDate.setHours(23, 59, 59, 999);
        
        const { formatDateToDDMMYYYY } = require('../core/helpers.js');
        const label = `Période : du ${formatDateToDDMMYYYY(startDate)} au ${formatDateToDDMMYYYY(endDate)}`;
        updateAndRenderKPIs(startDate, endDate, label);
        document.getElementById('kpi-filter-container').classList.add('hidden');
    });
    
    document.getElementById('kpi-reset-filter-btn').addEventListener('click', () => {
        document.querySelectorAll('.kpi-filter-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('kpi-start-date').value = '';
        document.getElementById('kpi-end-date').value = '';
        updateAndRenderKPIs();
        document.getElementById('kpi-filter-container').classList.add('hidden');
    });
};

