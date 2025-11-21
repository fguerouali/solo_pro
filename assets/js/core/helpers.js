/**
 * Helper Functions
 * Fonctions utilitaires
 */

/**
 * Affiche une notification toast
 */
export const showToast = (message) => {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
};

/**
 * Ouvre un modal
 */
export const openModal = (id) => {
    document.getElementById(id).classList.add('flex');
};

/**
 * Ferme un modal
 */
export const closeModal = (id) => {
    document.getElementById(id).classList.remove('flex');
};

/**
 * Retourne la date du jour au format YYYY-MM-DD
 */
export const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Formate une date au format DD/MM/YYYY à HHhMM
 */
export const formatDateToDDMMYYYY = (date) => {
    if (!date) return 'Date inconnue';
    const d = date.seconds ? new Date(date.seconds * 1000) : date;
    if (isNaN(d.getTime())) return 'Date invalide';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} à ${hours}h${minutes}`;
};

/**
 * Convertit un timestamp Firebase en Date
 */
export const toDate = (timestamp) => {
    if (!timestamp) return null;
    return timestamp.seconds ? new Date(timestamp.seconds * 1000) : timestamp;
};

/**
 * Calcule le coût de revient d'un produit
 */
export const calculateProductCost = (product, allIngredients) => {
    if (!product) return 0;
    if (product.recipe && product.recipe.length > 0) {
        return product.recipe.reduce((total, recipeItem) => {
            const ingredient = allIngredients.find(ing => ing.id === recipeItem.id);
            const ingredientCost = ingredient ? (ingredient.cost || 0) : 0;
            return total + (ingredientCost * recipeItem.quantity);
        }, 0);
    } else if (product.linkedIngredientId) {
        const linkedIngredient = allIngredients.find(i => i.id === product.linkedIngredientId);
        return linkedIngredient ? (linkedIngredient.cost || 0) : 0;
    }
    return 0;
};

/**
 * Télécharge un fichier CSV
 */
export const downloadCSV = (content, filename) => {
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
