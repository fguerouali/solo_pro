/**
 * Firebase Configuration & Initialization
 * Configuration et initialisation de Firebase
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { FIREBASE_CONFIG_DEFAULT, DEFAULT_APP_ID } from '../core/constants.js';
import { setCollection } from '../core/state.js';

// Variables globales Firebase
let app, auth, db, storage, appId, initialAuthToken;

/**
 * Initialise Firebase avec la configuration fournie
 */
export const initializeFirebase = () => {
    // Récupération de la config (peut être override par des variables globales)
    const firebaseConfig = typeof window.__firebase_config !== 'undefined' 
        ? JSON.parse(window.__firebase_config) 
        : FIREBASE_CONFIG_DEFAULT;
    
    appId = typeof window.__app_id !== 'undefined' ? window.__app_id : DEFAULT_APP_ID;
    initialAuthToken = typeof window.__initial_auth_token !== 'undefined' ? window.__initial_auth_token : undefined;

    // Initialisation
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    return { app, auth, db, storage, appId };
};

/**
 * Configure l'authentification Firebase
 */
export const setupAuth = (onUserAuthenticated) => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Utilisateur connecté
            const statusIndicator = document.getElementById('status-indicator');
            if (statusIndicator) {
                statusIndicator.innerHTML = `<p class="font-semibold text-green-600"><i class="fas fa-check-circle"></i> Connecté à Firebase</p>`;
            }
            
            // Initialiser les références de collections
            initializeCollections();
            
            // Callback personnalisé
            if (onUserAuthenticated) {
                onUserAuthenticated();
            }
        } else {
            // Pas de user, tentative de connexion
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Auth failed:", error);
            }
        }
    });
};

/**
 * Initialise les références de collections Firestore
 */
const initializeCollections = () => {
    setCollection('ingredientsCol', collection(db, `artifacts/${appId}/public/data/ingredients`));
    setCollection('productsCol', collection(db, `artifacts/${appId}/public/data/products`));
    setCollection('ordersCol', collection(db, `artifacts/${appId}/public/data/orders`));
    setCollection('suppliersCol', collection(db, `artifacts/${appId}/public/data/suppliers`));
    setCollection('purchaseOrdersCol', collection(db, `artifacts/${appId}/public/data/purchaseOrders`));
    setCollection('lossesCol', collection(db, `artifacts/${appId}/public/data/losses`));
    setCollection('chargesCol', collection(db, `artifacts/${appId}/public/data/charges`));
    setCollection('employeesCol', collection(db, `artifacts/${appId}/public/data/employees`));
    setCollection('absencesCol', collection(db, `artifacts/${appId}/public/data/absences`));
    setCollection('salaryPaymentsCol', collection(db, `artifacts/${appId}/public/data/salaryPayments`));
    setCollection('dailyPaymentsCol', collection(db, `artifacts/${appId}/public/data/dailyPayments`));
};

/**
 * Retourne les instances Firebase
 */
export const getFirebaseInstances = () => ({ app, auth, db, storage, appId });
