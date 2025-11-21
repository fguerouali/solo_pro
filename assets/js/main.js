/**
 * Main Entry Point for Solo Napoletana Dashboard
 * This file initializes the application and sets up all event listeners
 */

// Import Firebase initialization
import { initializeFirebase } from './config/firebase.js';

// Import navigation
import { setupNavigationEventListeners } from './modules/navigation.js';

// Import feature modules
import { setupDashboardEventListeners, updateAndRenderKPIs } from './modules/dashboard.js';
import { setupIngredientsEventListeners } from './modules/ingredients.js';
import { setupProductsEventListeners, populateIngredientSelects, populateProductSelects } from './modules/products.js';
import { setupPurchasesEventListeners, populateSupplierSelects } from './modules/purchases.js';
import { setupOrdersEventListeners } from './modules/orders.js';
import { setupLossesEventListeners } from './modules/losses.js';
import { setupChargesEventListeners } from './modules/charges.js';
import { setupRHEventListeners } from './modules/rh.js';
import { setupFinanceEventListeners } from './modules/finance.js';

// Import importers
import { setupCSVImporterEventListeners } from './importers/csv-importer.js';
import { setupAPIImporterEventListeners } from './importers/api-importer.js';

/**
 * Initialize the application
 */
function initializeApp() {
    console.log('🚀 Initializing Solo Napoletana Dashboard...');
    
    // Initialize Firebase and start listening to collections
    initializeFirebase();
    
    // Setup navigation (tab switching)
    setupNavigationEventListeners();
    
    // Setup all feature modules
    setupDashboardEventListeners();
    setupIngredientsEventListeners();
    setupProductsEventListeners();
    setupPurchasesEventListeners();
    setupOrdersEventListeners();
    setupLossesEventListeners();
    setupChargesEventListeners();
    setupRHEventListeners();
    setupFinanceEventListeners();
    
    // Setup importers
    setupCSVImporterEventListeners();
    setupAPIImporterEventListeners();
    
    // Initial render of KPIs (will be updated by Firebase listeners)
    updateAndRenderKPIs();
    
    console.log('✅ Solo Napoletana Dashboard initialized successfully!');
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM is already ready
    initializeApp();
}

// Export for debugging purposes
export { initializeApp };

