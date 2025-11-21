import { db, ingredientsCol, productsCol, ordersCol } from '../config/firebase.js';
import { showToast } from '../core/helpers.js';
import { openModal, closeModal } from '../ui/modals.js';
import { allIngredients, allProducts, setImportType, importType } from '../core/state.js';
import { doc, collection, writeBatch, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const CSV_INSTRUCTIONS = {
    ingredients: `<p>4 colonnes: <strong>nom,quantite,unite,cout</strong></p><pre>nom,quantite,unite,cout\nTomates,10,kg,2.5\n</pre>`,
    products: `<p>4 colonnes: <strong>nom,prix,type,details</strong></p>
                <p>Pizza/Entrée/Dessert details: "NomIngrédient1:qty1:unit1;NomIngrédient2:qty2:unit2"</p>
                <p>Boisson/Autre details: "NomArticleStock:qtyConsommée"</p>
                <pre>Margherita,8.5,Pizza,"Pâte:1:p;Sauce:0.1:kg"\nCoca,2,Boisson,"Canette Coca:1"</pre>`,
    orders: `<p>3 colonnes: <strong>date,produits,quantites</strong></p><p>Format date: JJ/MM/AAAA</p><pre>21/10/2025,"Margherita;Coca","2;1"</pre>`
};

export const setupCSVImporterEventListeners = () => {
    // Import buttons
    document.getElementById('import-ingredients-btn').addEventListener('click', () => {
        setImportType('ingredients');
        document.getElementById('import-modal-title').textContent = 'Importer des Ingrédients';
        document.getElementById('import-instructions').innerHTML = CSV_INSTRUCTIONS.ingredients;
        openModal('import-modal');
    });

    document.getElementById('import-products-btn').addEventListener('click', () => {
        setImportType('products');
        document.getElementById('import-modal-title').textContent = 'Importer des Produits';
        document.getElementById('import-instructions').innerHTML = CSV_INSTRUCTIONS.products;
        openModal('import-modal');
    });

    document.getElementById('import-orders-btn').addEventListener('click', () => {
        setImportType('orders');
        document.getElementById('import-modal-title').textContent = 'Importer des Ventes (CSV)';
        document.getElementById('import-instructions').innerHTML = CSV_INSTRUCTIONS.orders;
        openModal('import-modal');
    });

    // Listen for custom event from other modules
    window.addEventListener('openImport', (e) => {
        const type = e.detail.type;
        setImportType(type);
        
        if (type === 'products') {
            document.getElementById('import-modal-title').textContent = 'Importer des Produits';
            document.getElementById('import-instructions').innerHTML = CSV_INSTRUCTIONS.products;
        } else if (type === 'orders') {
            document.getElementById('import-modal-title').textContent = 'Importer des Ventes (CSV)';
            document.getElementById('import-instructions').innerHTML = CSV_INSTRUCTIONS.orders;
        }
        openModal('import-modal');
    });

    document.getElementById('cancel-import').addEventListener('click', () => closeModal('import-modal'));

    document.getElementById('csv-file-input').addEventListener('change', () => {
        document.getElementById('process-import-btn').disabled = !document.getElementById('csv-file-input').files.length;
    });

    document.getElementById('process-import-btn').addEventListener('click', async () => {
        const file = document.getElementById('csv-file-input').files[0];
        if (!file) return showToast("Veuillez choisir un fichier.");
        
        document.getElementById('process-import-btn').disabled = true;
        const reader = new FileReader();
        
        reader.onload = async (event) => {
            const lines = event.target.result.split('\n').filter(line => line.trim() !== '');
            if (lines.length <= 1) {
                showToast("Le fichier CSV est vide ou ne contient que l'en-tête.");
                closeModal('import-modal');
                document.getElementById('csv-file-input').value = '';
                document.getElementById('process-import-btn').disabled = false;
                return;
            }
            
            const header = lines.shift();
            try {
                if (importType === 'ingredients') await importIngredients(lines);
                else if (importType === 'products') await importProducts(lines);
                else if (importType === 'orders') await importOrders(lines);
                showToast('Importation terminée !');
            } catch (error) {
                console.error("Import error:", error);
                showToast(`Erreur lors de l'importation: ${error.message}. Vérifiez la ligne correspondante dans votre fichier.`);
            } finally {
                closeModal('import-modal');
                document.getElementById('csv-file-input').value = '';
                document.getElementById('process-import-btn').disabled = false;
            }
        };
        reader.readAsText(file);
    });

    // Export ingredients
    document.getElementById('export-ingredients-btn').addEventListener('click', () => {
        let csv = "nom,quantite,unite,cout\n";
        allIngredients.forEach(i => {
            csv += `${i.name},${i.quantity},${i.unit},${i.cost || 0}\n`;
        });
        downloadCSV(csv, 'ingredients.csv');
    });
};

// Import functions
async function importIngredients(lines) {
    const batch = writeBatch(db);
    lines.forEach((line, index) => {
        try {
            const [name, quantity, unit, cost] = line.trim().split(',');
            if (name && quantity && unit) {
                batch.set(doc(collection(db, ingredientsCol.path)), {
                    name: name.trim(),
                    quantity: parseFloat(quantity),
                    unit: unit.trim(),
                    cost: parseFloat(cost) || 0,
                    createdAt: serverTimestamp()
                });
            } else {
                console.warn(`Ligne ingrédient ignorée (données manquantes): Ligne ${index + 2}`, line);
            }
        } catch(e) {
            throw new Error(`Erreur à la ligne ${index + 2} (ingrédients) : ${e.message}`);
        }
    });
    await batch.commit();
}

async function importProducts(lines) {
    const batch = writeBatch(db);
    lines.forEach((line, index) => {
        try {
            const values = line.trim().split(',');
            const name = values[0], price = values[1], type = values[2], details = values.slice(3).join(',');
            
            if (!name || !price || !type || !details) {
                console.warn(`Ligne produit ignorée (données manquantes): Ligne ${index + 2}`, line);
                return;
            }
            
            const data = {
                name: name.trim(),
                price: parseFloat(price),
                type: type.trim(),
                createdAt: serverTimestamp()
            };
            
            if (['Pizza', 'Entrée', 'Dessert'].includes(data.type)) {
                data.recipe = details.trim().replace(/"/g, '').split(';').map(part => {
                    const [ingName, ingQty, ingUnit] = part.split(':');
                    if(!ingName || !ingQty || !ingUnit) throw new Error(`Format de recette incorrect pour ${name}`);
                    const ing = allIngredients.find(i => i.name.toLowerCase() === ingName.trim().toLowerCase());
                    if (!ing) throw new Error(`Ingrédient introuvable: ${ingName} pour le produit ${name}`);
                    return { id: ing.id, name: ing.name, quantity: parseFloat(ingQty), unit: ingUnit.trim() };
                });
                if (data.recipe.length === 0 || data.recipe.some(r => !r.id)) throw new Error(`Recette invalide ou vide pour ${name}`);
            } else {
                const parts = details.trim().replace(/"/g, '').split(':');
                const ingName = parts[0];
                const ingQty = parseFloat(parts[1]);

                if (!ingName || isNaN(ingQty) || ingQty <= 0) {
                    throw new Error(`Format de lien incorrect pour ${name}. Attendu: "NomArticleStock:Qty"`);
                }

                const linked = allIngredients.find(i => i.name.toLowerCase() === ingName.trim().toLowerCase());
                if (!linked) throw new Error(`Article en stock introuvable: ${ingName} pour le produit ${name}`);
                data.linkedIngredientId = linked.id;
                data.linkedIngredientQuantity = ingQty;
            }
            
            batch.set(doc(collection(db, productsCol.path)), data);
        } catch(e) {
            throw new Error(`Erreur à la ligne ${index + 2} (produits) : ${e.message}`);
        }
    });
    await batch.commit();
}

async function importOrders(lines) {
    const batch = writeBatch(db);
    for(const [index, line] of lines.entries()) {
        try {
            const [dateRaw, pNamesRaw, qtiesRaw] = line.trim().split(',');
            if(!dateRaw || !pNamesRaw || !qtiesRaw) {
                console.warn(`Ligne vente ignorée (données manquantes): Ligne ${index + 2}`, line);
                continue;
            }
            
            const [day, month, year] = dateRaw.trim().split('/');
            if (!day || !month || !year || day.length !== 2 || month.length !== 2 || year.length !== 4) {
                throw new Error(`Format de date invalide (attendu JJ/MM/AAAA) pour ${dateRaw}`);
            }
            const saleDate = new Date(`${year}-${month}-${day}T12:00:00Z`);
            if (isNaN(saleDate.getTime())) {
                throw new Error(`Date invalide: ${dateRaw}`);
            }

            const pNames = pNamesRaw.replace(/"/g, '').split(';');
            const qties = qtiesRaw.replace(/"/g, '').split(';');
            if (pNames.length !== qties.length) throw new Error(`Nombre de produits et quantités incohérent`);
            
            let items = [], total = 0;
            let deductions = new Map();

            for (let i = 0; i < pNames.length; i++) {
                const name = pNames[i].trim();
                const qtyStr = qties[i].trim();
                const qty = parseInt(qtyStr);
                if (isNaN(qty) || qty <= 0) throw new Error(`Quantité invalide: ${qtyStr} pour ${name}`);

                const prod = allProducts.find(p => p.name.toLowerCase() === name.toLowerCase());
                if (!prod) throw new Error(`Produit introuvable: ${name}`);
                items.push({ id: prod.id, name: prod.name, quantity: qty, price: prod.price });
                total += prod.price * qty;

                if (prod.recipe && prod.recipe.length > 0) {
                    for (const rItem of prod.recipe) {
                        const currentDeduction = deductions.get(rItem.id) || 0;
                        deductions.set(rItem.id, currentDeduction + (rItem.quantity * qty));
                    }
                } else if(prod.linkedIngredientId) {
                    const linkedQtyPerProduct = prod.linkedIngredientQuantity || 1;
                    const totalQtyToDeduct = linkedQtyPerProduct * qty;
                    const currentDeduction = deductions.get(prod.linkedIngredientId) || 0;
                    deductions.set(prod.linkedIngredientId, currentDeduction + totalQtyToDeduct);
                }
            }

            for(const [ingId, qtyToDeduct] of deductions.entries()) {
                batch.update(doc(ingredientsCol, ingId), { quantity: increment(-qtyToDeduct) });
            }

            batch.set(doc(collection(db, ordersCol.path)), {
                items,
                totalPrice: total,
                createdAt: serverTimestamp(),
                saleDate
            });
        } catch(e) {
            throw new Error(`Erreur à la ligne ${index + 2} (ventes) : ${e.message}`);
        }
    }
    await batch.commit();
}

// Helper function
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

