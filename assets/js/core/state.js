/**
 * State Management
 * Gestion de l'état global de l'application
 */

// État global de l'application
const state = {
    // Collections Firebase
    collections: {
        ingredientsCol: null,
        productsCol: null,
        ordersCol: null,
        suppliersCol: null,
        purchaseOrdersCol: null,
        lossesCol: null,
        chargesCol: null,
        employeesCol: null,
        absencesCol: null,
        salaryPaymentsCol: null,
        dailyPaymentsCol: null
    },
    
    // Données
    data: {
        allIngredients: [],
        allProducts: [],
        orderHistory: [],
        allSuppliers: [],
        allLosses: [],
        allPurchaseOrders: [],
        allCharges: [],
        allEmployees: [],
        allAbsences: [],
        allSalaryPayments: [],
        allDailyPayments: []
    },
    
    // État temporaire
    temp: {
        currentRecipe: [],
        currentOrder: [],
        currentPurchaseOrderItems: [],
        currentSalaryCalculations: [],
        importType: ''
    }
};

// Getters pour les collections
export const getCollections = () => state.collections;
export const setCollection = (name, value) => { state.collections[name] = value; };

// Getters/Setters pour les données
export const getAllIngredients = () => state.data.allIngredients;
export const setAllIngredients = (value) => { state.data.allIngredients = value; };

export const getAllProducts = () => state.data.allProducts;
export const setAllProducts = (value) => { state.data.allProducts = value; };

export const getOrderHistory = () => state.data.orderHistory;
export const setOrderHistory = (value) => { state.data.orderHistory = value; };

export const getAllSuppliers = () => state.data.allSuppliers;
export const setAllSuppliers = (value) => { state.data.allSuppliers = value; };

export const getAllLosses = () => state.data.allLosses;
export const setAllLosses = (value) => { state.data.allLosses = value; };

export const getAllPurchaseOrders = () => state.data.allPurchaseOrders;
export const setAllPurchaseOrders = (value) => { state.data.allPurchaseOrders = value; };

export const getAllCharges = () => state.data.allCharges;
export const setAllCharges = (value) => { state.data.allCharges = value; };

export const getAllEmployees = () => state.data.allEmployees;
export const setAllEmployees = (value) => { state.data.allEmployees = value; };

export const getAllAbsences = () => state.data.allAbsences;
export const setAllAbsences = (value) => { state.data.allAbsences = value; };

export const getAllSalaryPayments = () => state.data.allSalaryPayments;
export const setAllSalaryPayments = (value) => { state.data.allSalaryPayments = value; };

export const getAllDailyPayments = () => state.data.allDailyPayments;
export const setAllDailyPayments = (value) => { state.data.allDailyPayments = value; };

// Getters/Setters pour l'état temporaire
export const getCurrentRecipe = () => state.temp.currentRecipe;
export const setCurrentRecipe = (value) => { state.temp.currentRecipe = value; };

export const getCurrentOrder = () => state.temp.currentOrder;
export const setCurrentOrder = (value) => { state.temp.currentOrder = value; };

export const getCurrentPurchaseOrderItems = () => state.temp.currentPurchaseOrderItems;
export const setCurrentPurchaseOrderItems = (value) => { state.temp.currentPurchaseOrderItems = value; };

export const getCurrentSalaryCalculations = () => state.temp.currentSalaryCalculations;
export const setCurrentSalaryCalculations = (value) => { state.temp.currentSalaryCalculations = value; };

export const getImportType = () => state.temp.importType;
export const setImportType = (value) => { state.temp.importType = value; };

