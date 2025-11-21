/**
 * Firebase Service - Operations Firestore
 * Service Firebase pour toutes les opérations sur la base de données
 */

import { 
    onSnapshot, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDoc,
    writeBatch,
    serverTimestamp,
    increment,
    collection
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { getFirebaseInstances } from '../config/firebase.js';
import { getCollections } from '../core/state.js';

/**
 * Setup listeners pour toutes les collections
 */
export const setupCollectionListeners = (callbacks) => {
    const cols = getCollections();
    
    // Suppliers
    onSnapshot(cols.suppliersCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (callbacks.onSuppliersUpdate) callbacks.onSuppliersUpdate(data);
    });
    
    // Purchase Orders
    onSnapshot(cols.purchaseOrdersCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        if (callbacks.onPurchaseOrdersUpdate) callbacks.onPurchaseOrdersUpdate(data);
    });
    
    // Ingredients
    onSnapshot(cols.ingredientsCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a,b) => a.name.localeCompare(b.name));
        if (callbacks.onIngredientsUpdate) callbacks.onIngredientsUpdate(data);
    });
    
    // Products
    onSnapshot(cols.productsCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a,b) => a.name.localeCompare(b.name));
        if (callbacks.onProductsUpdate) callbacks.onProductsUpdate(data);
    });
    
    // Orders
    onSnapshot(cols.ordersCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => (b.saleDate?.seconds || b.createdAt?.seconds || 0) - (a.saleDate?.seconds || a.createdAt?.seconds || 0));
        if (callbacks.onOrdersUpdate) callbacks.onOrdersUpdate(data);
    });
    
    // Losses
    onSnapshot(cols.lossesCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        if (callbacks.onLossesUpdate) callbacks.onLossesUpdate(data);
    });
    
    // Charges
    onSnapshot(cols.chargesCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => {
            const dateA = a.date?.seconds ? new Date(a.date.seconds * 1000) : null;
            const dateB = b.date?.seconds ? new Date(b.date.seconds * 1000) : null;
            return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
        });
        if (callbacks.onChargesUpdate) callbacks.onChargesUpdate(data);
    });
    
    // Employees
    onSnapshot(cols.employeesCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => a.name.localeCompare(b.name));
        if (callbacks.onEmployeesUpdate) callbacks.onEmployeesUpdate(data);
    });
    
    // Absences
    onSnapshot(cols.absencesCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (callbacks.onAbsencesUpdate) callbacks.onAbsencesUpdate(data);
    });
    
    // Salary Payments
    onSnapshot(cols.salaryPaymentsCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => {
            const dateA = a.paymentDate?.seconds ? new Date(a.paymentDate.seconds * 1000) : null;
            const dateB = b.paymentDate?.seconds ? new Date(b.paymentDate.seconds * 1000) : null;
            return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
        });
        if (callbacks.onSalaryPaymentsUpdate) callbacks.onSalaryPaymentsUpdate(data);
    });
    
    // Daily Payments
    onSnapshot(cols.dailyPaymentsCol, snapshot => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => {
            const dateA = a.date?.seconds ? new Date(a.date.seconds * 1000) : null;
            const dateB = b.date?.seconds ? new Date(b.date.seconds * 1000) : null;
            return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
        });
        if (callbacks.onDailyPaymentsUpdate) callbacks.onDailyPaymentsUpdate(data);
    });
};

/**
 * Crée un batch writer pour les transactions
 */
export const createBatch = () => {
    const { db } = getFirebaseInstances();
    return writeBatch(db);
};

/**
 * Exporte les fonctions Firestore communes
 */
export {
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
    increment,
    collection
};

