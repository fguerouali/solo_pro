/**
 * Constants & Configuration
 * Constantes et Configuration
 */

// Seuils
export const LOW_STOCK_THRESHOLD = 10;

// Nombre de tables pour le POS
export const NUMBER_OF_TABLES = 10;

// URL du Proxy API
export const PROXY_URL = "https://solo-proxy.onrender.com";

// Instructions CSV pour l'import
export const CSV_INSTRUCTIONS = {
    ingredients: `<p>4 colonnes: <strong>nom,quantite,unite,cout</strong></p><pre>nom,quantite,unite,cout\nTomates,10,kg,2.5\n</pre>`,
    products: `<p>4 colonnes: <strong>nom,prix,type,details</strong></p>
                <p>Pizza/Entrée/Dessert details: "NomIngrédient1:qty1:unit1;NomIngrédient2:qty2:unit2"</p>
                <p>Boisson/Autre details: "NomArticleStock:qtyConsommée"</p>
                <pre>Margherita,8.5,Pizza,"Pâte:1:p;Sauce:0.1:kg"\nCoca,2,Boisson,"Canette Coca:1"</pre>`,
    orders: `<p>3 colonnes: <strong>date,produits,quantites</strong></p><p>Format date: JJ/MM/AAAA</p><pre>21/10/2025,"Margherita;Coca","2;1"</pre>`
};

// Configuration Firebase par défaut
export const FIREBASE_CONFIG_DEFAULT = {
    apiKey: "AIzaSyCzUX90zSN2zG9O97g7TNyTmTSNte9OT-E",
    authDomain: "solopro-6521a.firebaseapp.com",
    projectId: "solopro-6521a",
    storageBucket: "solopro-6521a.appspot.com",
    messagingSenderId: "126450282941",
    appId: "1:126450282941:web:10e5255e6ee7c75fa8e2d4"
};

export const DEFAULT_APP_ID = 'default-pizzeria-pro';
