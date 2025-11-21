/**
 * UI - Modal Management
 * Gestion des modals et dialogues
 */

import { openModal, closeModal } from '../core/helpers.js';

/**
 * Initialise tous les event listeners pour les modals
 */
export const initializeModals = () => {
    // Cancel buttons
    document.getElementById('cancel-ingredient')?.addEventListener('click', () => closeModal('ingredient-modal'));
    document.getElementById('cancel-product')?.addEventListener('click', () => closeModal('product-modal'));
    document.getElementById('cancel-import')?.addEventListener('click', () => closeModal('import-modal'));
    document.getElementById('cancel-api-import')?.addEventListener('click', () => closeModal('api-import-modal'));
    document.getElementById('cancel-supplier')?.addEventListener('click', () => closeModal('supplier-modal'));
    document.getElementById('cancel-purchase-order')?.addEventListener('click', () => closeModal('purchase-order-modal'));
    document.getElementById('cancel-loss')?.addEventListener('click', () => closeModal('loss-modal'));
    document.getElementById('cancel-employee')?.addEventListener('click', () => closeModal('employee-modal'));
    document.getElementById('cancel-absences')?.addEventListener('click', () => closeModal('absences-modal'));
};

// Export helpers
export { openModal, closeModal };

