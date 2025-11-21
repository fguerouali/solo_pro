import { db, ordersCol, ingredientsCol } from '../config/firebase.js';
import { PROXY_URL } from '../core/constants.js';
import { showToast, getTodayDateString, calculateProductCost } from '../core/helpers.js';
import { openModal, closeModal } from '../ui/modals.js';
import { allProducts, allIngredients } from '../core/state.js';
import { doc, collection, writeBatch, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const setupAPIImporterEventListeners = () => {
    // Set default dates
    document.getElementById('api-start-date').value = getTodayDateString();
    document.getElementById('api-end-date').value = getTodayDateString();

    document.getElementById('import-api-sales-btn').addEventListener('click', () => {
        document.getElementById('api-start-date').value = getTodayDateString();
        document.getElementById('api-end-date').value = getTodayDateString();
        openModal('api-import-modal');
    });

    document.getElementById('cancel-api-import').addEventListener('click', () => closeModal('api-import-modal'));

    document.getElementById('api-import-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const startDate = document.getElementById('api-start-date').value;
        const endDate = document.getElementById('api-end-date').value;
        const loader = document.getElementById('api-import-loader');
        const statusText = document.getElementById('api-import-status');
        const submitButton = document.getElementById('process-api-import-btn');

        if (!startDate || !endDate) {
            showToast("Veuillez sélectionner les dates de début et de fin.");
            return;
        }
        
        if (!PROXY_URL || PROXY_URL === "https://solo-proxy.onrender.com") {
            showToast("Erreur: L'URL du PROXY_URL n'est pas configurée dans le script.");
            return;
        }

        loader.classList.remove('hidden');
        statusText.textContent = 'Authentification en cours...';
        submitButton.disabled = true;
        let salesImportedCount = 0;
        let allSalesData = [];

        try {
            // Step 1: Authenticate via Proxy
            console.log("Attempting API authentication via proxy...");
            const authResponse = await fetch(`${PROXY_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const authData = await authResponse.json();

            if (!authResponse.ok) {
                console.error("Proxy Auth failed response:", authData);
                const detailMsg = authData?.details?.message || authData?.details || authData?.message || `Status ${authResponse.status}`;
                throw new Error(`Échec d'authentification via proxy: ${detailMsg}`);
            }

            const token = authData?.token;
            
            if (!token) {
                console.error("Proxy Auth response data (token not found):", authData);
                throw new Error("Jeton non reçu du proxy.");
            }
            
            console.log("Proxy Authentication successful.");
            statusText.textContent = 'Récupération des ventes...';

            // Step 2: Fetch Sales Data via Proxy
            console.log(`Fetching sales from ${startDate} to ${endDate} via proxy...`);

            let currentPage = 1;
            const pageSize = 100;
            let hasMorePages = true;

            while(hasMorePages) {
                const proxySalesUrl = `${PROXY_URL}/api/sales?pageNum=${currentPage}&pageSize=${pageSize}&startDate=${startDate}&endDate=${endDate}&token=${encodeURIComponent(token)}`;

                console.log(`Fetching page ${currentPage} from Proxy: ${proxySalesUrl}`);

                const salesResponse = await fetch(proxySalesUrl, {
                    method: 'GET'
                });
                
                const salesResult = await salesResponse.json();

                if (!salesResponse.ok) {
                    console.error(`Proxy Sales API Error Response (Page ${currentPage}):`, salesResult);
                    const detailMsg = salesResult?.details?.message || salesResult?.details || salesResult?.message || `Status ${salesResponse.status}`;
                    throw new Error(`Erreur Proxy Ventes (Page ${currentPage}): ${detailMsg}`);
                }

                console.log(`Page ${currentPage} response code: ${salesResult.code}, msg: ${salesResult.msg}`);

                if (salesResult.code !== 200 || !salesResult.data) {
                    console.error("Proxy Sales API invalid data structure:", salesResult);
                    throw new Error(`Erreur Proxy Ventes (Page ${currentPage}): ${salesResult.msg || 'Données invalides ou code non 200 renvoyé par le proxy'}`);
                }
                
                allSalesData = allSalesData.concat(salesResult.data);

                if (!salesResult.data || salesResult.data.length < pageSize) {
                    hasMorePages = false;
                } else {
                    currentPage++;
                }
                
                if (currentPage > 50) {
                    console.warn("Stopped fetching after 50 pages.");
                    hasMorePages = false;
                }
            }

            console.log(`Total sales items fetched via proxy: ${allSalesData.length}`);
            statusText.textContent = `Traitement de ${allSalesData.length} articles...`;

            if (allSalesData.length === 0) {
                showToast("Aucune vente trouvée pour la période sélectionnée via API.");
                closeModal('api-import-modal');
                return;
            }

            // Step 3: Process and Save Sales Data
            const groupedSales = allSalesData.reduce((acc, item) => {
                const billNo = item.billNo;
                if (!acc[billNo]) {
                    acc[billNo] = {
                        billNo: billNo,
                        items: [],
                        totalPrice: 0,
                        saleDate: null,
                        hadDiscount: false
                    };

                    if (item.operDate) {
                        const tempDate = new Date(item.operDate.replace(' ', 'T') + 'Z');
                        if (!isNaN(tempDate.getTime())) {
                            acc[billNo].saleDate = tempDate;
                        } else {
                            console.warn(`Invalid operDate '${item.operDate}' for bill ${billNo}. Using current date and time.`);
                        }
                    }
                    
                    if (!acc[billNo].saleDate) {
                        acc[billNo].saleDate = new Date();
                    }
                }
                
                const productNameLower = (item.goodsName || '').trim().toLowerCase();
                const matchedProduct = allProducts.find(p => p.name.trim().toLowerCase() === productNameLower);

                if (matchedProduct) {
                    const quantity = parseFloat(item.numNum);
                    const price = parseFloat(item.numPrice);
                    const priceAdd = parseFloat(item.numPriceAdd) || 0;
                    
                    let discountPercent = parseFloat(item.discount);
                    if (isNaN(discountPercent)) {
                        discountPercent = 100;
                    }
                    if (discountPercent < 100) {
                        acc[billNo].hadDiscount = true;
                    }
                    
                    const discountMultiplier = discountPercent / 100;
                    const numBack = parseFloat(item.numBack) || 0;

                    if (!isNaN(quantity) && quantity > 0 && !isNaN(price)) {
                        acc[billNo].items.push({
                            id: matchedProduct.id,
                            name: matchedProduct.name,
                            quantity: quantity,
                            price: price,
                            returned: numBack
                        });

                        const netQuantity = Math.max(0, quantity - numBack);
                        let itemTotalBeforeDiscount = 0;

                        if (netQuantity > 0) {
                            itemTotalBeforeDiscount = (price * netQuantity) + priceAdd;
                        }
                        
                        acc[billNo].totalPrice += itemTotalBeforeDiscount * discountMultiplier;
                    } else {
                        console.warn(`Produit ${item.goodsName || 'N/A'} ignoré dans la facture ${billNo}: quantité ou prix invalide.`);
                    }
                } else {
                    console.warn(`Produit API "${item.goodsName || 'N/A'}" non trouvé dans la liste des produits Solo. Ignoré pour la facture ${billNo}.`);
                }
                
                return acc;
            }, {});

            const salesToSave = Object.values(groupedSales).filter(sale => sale.items.length > 0);
            console.log(`Sales grouped and filtered: ${salesToSave.length} bills`);
            
            if (salesToSave.length === 0) {
                showToast("Aucune vente valide à importer (produits non trouvés ou données incorrectes).");
                closeModal('api-import-modal');
                return;
            }

            // Step 4: Check Stock and Save Batch
            const batch = writeBatch(db);
            statusText.textContent = `Importation de ${salesToSave.length} commande(s)...`;

            for (const sale of salesToSave) {
                const tempDeductions = new Map();

                for (const saleItem of sale.items) {
                    const product = allProducts.find(p => p.id === saleItem.id);
                    if (!product) continue;

                    if (product.recipe && product.recipe.length > 0) {
                        for (const recipeItem of product.recipe) {
                            const current = tempDeductions.get(recipeItem.id) || 0;
                            tempDeductions.set(recipeItem.id, current + recipeItem.quantity * saleItem.quantity);
                        }
                    } else if (product.linkedIngredientId) {
                        const linkedQtyPerProduct = product.linkedIngredientQuantity || 1;
                        const totalQtyToDeduct = linkedQtyPerProduct * saleItem.quantity;
                        const current = tempDeductions.get(product.linkedIngredientId) || 0;
                        tempDeductions.set(product.linkedIngredientId, current + totalQtyToDeduct);
                    }
                }

                for (const [ingId, qty] of tempDeductions.entries()) {
                    batch.update(doc(ingredientsCol, ingId), { quantity: increment(-qty) });
                }
                
                batch.set(doc(collection(db, ordersCol.path)), {
                    items: sale.items,
                    totalPrice: sale.totalPrice,
                    createdAt: serverTimestamp(),
                    saleDate: sale.saleDate,
                    billNo: sale.billNo,
                    hadDiscount: sale.hadDiscount
                });
                salesImportedCount++;
            }

            // Step 5: Commit Batch
            if (salesImportedCount > 0) {
                statusText.textContent = `Enregistrement de ${salesImportedCount} vente(s)...`;
                await batch.commit();
                showToast(`${salesImportedCount} vente(s) importée(s) avec succès via API.`);
            } else {
                showToast("Aucune vente valide trouvée à importer via API.");
            }

        } catch (error) {
            console.error("Erreur détaillée lors de l'importation API via proxy:", error);
            let userMessage = `Erreur: ${error.message}`;
            
            if (error.message.includes("authentification via proxy")) {
                userMessage = `Échec d'authentification proxy. Vérifiez les logs du proxy.`;
            } else if (error.message.includes("Jeton non reçu du proxy")) {
                userMessage = "Le proxy n'a pas réussi à obtenir un jeton. Vérifiez les logs du proxy.";
            } else if (error.message.includes("Proxy Ventes")) {
                userMessage = "Erreur lors de la récupération des ventes via le proxy.";
            } else if (error instanceof TypeError && error.message.includes('fetch')) {
                userMessage = `Erreur réseau en contactant le proxy (${PROXY_URL}). Est-il déployé et l'URL est-elle correcte ?`;
            }
            showToast(userMessage);
        } finally {
            loader.classList.add('hidden');
            statusText.textContent = '';
            submitButton.disabled = false;
            
            if(salesImportedCount > 0 || allSalesData.length === 0) {
                closeModal('api-import-modal');
            }
        }
    });
};

