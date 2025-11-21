/**
 * Charges Module
 * Module de gestion des charges (dépenses)
 */

import { showToast, getTodayDateString } from '../core/helpers.js';
import { getAllCharges, setAllCharges, getCollections } from '../core/state.js';
import { addDoc, deleteDoc, doc, serverTimestamp } from '../services/firebase-service.js';
import { renderCharges } from '../ui/renderers.js';

/**
 * Initialise le module charges
 */
export const initializeCharges = () => {
    document.getElementById('charge-form').addEventListener('submit', handleChargeSubmit);
    document.getElementById('charges-list').addEventListener('click', handleChargesListClick);
    
    // Définir la date du jour par défaut
    document.getElementById('charge-date').value = getTodayDateString();
};

/**
 * Handler pour la soumission du formulaire de charge
 */
const handleChargeSubmit = async (e) => {
    e.preventDefault();
    const cols = getCollections();
    
    const name = document.getElementById('charge-name').value;
    const amount = parseFloat(document.getElementById('charge-amount').value);
    const dateValue = document.getElementById('charge-date').value;
    
    if (!name || isNaN(amount) || amount <= 0 || !dateValue) {
        showToast("Veuillez remplir tous les champs avec des valeurs valides.");
        return;
    }
    
    const chargeDate = new Date(dateValue);
    chargeDate.setHours(12, 0, 0, 0);
    
    try {
        await addDoc(cols.chargesCol, {
            name: name,
            amount: amount,
            date: chargeDate,
            createdAt: serverTimestamp()
        });
        
        showToast('Charge enregistrée !');
        document.getElementById('charge-form').reset();
        document.getElementById('charge-date').value = getTodayDateString();
    } catch (error) {
        console.error("Erreur ajout charge: ", error);
        showToast("Erreur lors de l'enregistrement de la charge.");
    }
};

/**
 * Handler pour les clics dans la liste (delete)
 */
const handleChargesListClick = async (e) => {
    const deleteBtn = e.target.closest('.delete-charge-btn');
    if (deleteBtn) {
        const cols = getCollections();
        const chargeId = deleteBtn.dataset.id;
        if (confirm("Voulez-vous vraiment supprimer cette charge ?")) {
            try {
                await deleteDoc(doc(cols.chargesCol, chargeId));
                showToast("Charge supprimée.");
            } catch (error) {
                console.error("Erreur suppression charge: ", error);
                showToast("Erreur lors de la suppression.");
            }
        }
    }
};

/**
 * Callback pour la mise à jour des charges depuis Firestore
 */
export const onChargesUpdate = (charges) => {
    setAllCharges(charges);
    renderCharges(charges);
};

