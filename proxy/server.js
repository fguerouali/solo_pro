const express = require('express');
const fetch = require('node-fetch'); // Using node-fetch v2 for require syntax
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000; // Render sets the PORT environment variable

// --- Configuration ---
// Utilise les variables d'environnement de Render
const API_USERNAME = process.env.POS_USERNAME; 
const API_PASSWORD = process.env.POS_PASSWORD;
// URL d'authentification (Corrigée)
const API_AUTH_URL = "https://iam.scpos.com/auth/login"; 
const API_SALES_URL_BASE = "https://iam.scpos.com/service/api/report/order_goods";
// Email spécifique requis pour l'API des ventes (selon votre URL d'exemple)
const API_SALES_EMAIL = "f.guerouali@gmail.com"; 
const FRONTEND_URL = process.env.FRONTEND_URL || "https://solo-pro.onrender.com"; // Fallback

// Vérification au démarrage si les variables d'environnement sont définies
if (!API_USERNAME || !API_PASSWORD) {
    console.error("ERREUR: Les variables d'environnement POS_USERNAME et POS_PASSWORD sont requises !");
}
if (!FRONTEND_URL) {
     console.warn("ATTENTION: La variable d'environnement FRONTEND_URL n'est pas définie.");
}


// --- Middleware ---
// Activer CORS pour autoriser les requêtes depuis votre frontend spécifique
app.use(cors({ origin: FRONTEND_URL })); 
app.use(express.json()); // Pour parser le corps des requêtes POST en JSON

// --- Routes du Proxy ---

// 1. Route d'authentification (appelée par le frontend)
app.post('/api/login', async (req, res) => {
    console.log("Proxy received login request to /api/login");
    if (!API_USERNAME || !API_PASSWORD) {
         return res.status(500).json({ message: "Identifiants POS non configurés sur le serveur proxy." });
    }
    try {
        // Définition des en-têtes pour imiter la requête du navigateur
        const headers = {
            'Content-Type': 'application/json;charset=UTF-8',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://iampos.net', // Important : L'API s'attend à cette origine
            'Referer': 'https://iampos.net/', // Important : L'API s'attend à ce referer
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
            'isToken': 'false',
            'language': 'fr'
        };

        const authResponse = await fetch(API_AUTH_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                username: API_USERNAME, 
                password: API_PASSWORD
            })
        });

        const responseBody = await authResponse.text(); // Lire en texte d'abord pour débogage
         console.log(`Auth API status: ${authResponse.status}, body: ${responseBody.substring(0, 200)}...`); // Log status et début body

        if (!authResponse.ok) {
            // Tenter de parser comme JSON si possible pour plus de détails
            let errorDetails = responseBody;
            try { errorDetails = JSON.parse(responseBody); } catch (e) { /* Ignore parsing error */ }
            console.error("Authentication failed:", errorDetails);
            return res.status(authResponse.status).json({ 
                message: `Échec d'authentification externe: ${authResponse.statusText}`, 
                details: errorDetails 
            });
        }

        const authData = JSON.parse(responseBody); // Parser maintenant qu'on sait que c'est ok
        // --- Adaptez ceci selon la structure RÉELLE de la réponse d'authentification ---
        const token = authData?.data?.token || authData?.token || authData?.access_token; 

        if (!token) {
            console.error("Token not found in auth response:", authData);
            return res.status(500).json({ message: "Jeton d'authentification non trouvé dans la réponse de l'API externe." });
        }

        console.log("Authentication successful, returning token.");
        res.json({ token: token }); // Renvoyer uniquement le jeton au frontend

    } catch (error) {
        console.error("Error in /api/login proxy:", error);
        res.status(500).json({ message: `Erreur interne du proxy lors de l'authentification: ${error.message}` });
    }
});

// 2. Route pour récupérer les ventes (appelée par le frontend avec le token obtenu)
app.get('/api/sales', async (req, res) => {
    console.log("Proxy received sales request to /api/sales");
    const { startDate, endDate, pageNum = 1, pageSize = 100, token } = req.query; // Récupère les paramètres et le token

    if (!token) {
        return res.status(401).json({ message: "Jeton d'authentification manquant." });
    }
    if (!startDate || !endDate) {
        return res.status(400).json({ message: "Dates de début et de fin requises." });
    }
     if (!API_SALES_EMAIL) { // Vérifie si l'email pour l'URL des ventes est disponible
         return res.status(500).json({ message: "Email pour l'API des ventes non configuré sur le serveur proxy." });
    }


    const startDateFormatted = `${startDate} 00:00:00`;
    const endDateFormatted = `${endDate} 23:59:59`;
    
    // CORRECTION : Utiliser API_SALES_EMAIL au lieu de API_USERNAME dans l'URL
    const externalApiUrl = `${API_SALES_URL_BASE}?pageNum=${pageNum}&pageSize=${pageSize}&startDate=${encodeURIComponent(startDateFormatted)}&endDate=${encodeURIComponent(endDateFormatted)}&email=${encodeURIComponent(API_SALES_EMAIL)}`;

    console.log(`Proxying request to: ${externalApiUrl}`);

    try {
         // Définition des en-têtes pour la requête des ventes
         const headers = {
            'Authorization': `Bearer ${token}`, // Utilise le jeton fourni par le frontend
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://iampos.net', // Ajouté par sécurité
            'Referer': 'https://iampos.net/', // Ajouté par sécurité
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
            'language': 'fr'
        };

        const salesResponse = await fetch(externalApiUrl, {
            method: 'GET',
            headers: headers
        });
        
        const responseBody = await salesResponse.text();
         console.log(`Sales API status: ${salesResponse.status}, body: ${responseBody.substring(0, 200)}...`);

        if (!salesResponse.ok) {
            let errorDetails = responseBody;
            try { errorDetails = JSON.parse(responseBody); } catch (e) { /* Ignore */ }
            console.error("Sales API request failed:", errorDetails);
            return res.status(salesResponse.status).json({ 
                message: `Erreur API Ventes externe: ${salesResponse.statusText}`, 
                details: errorDetails 
            });
        }

        const salesData = JSON.parse(responseBody);
        
        // Renvoyer les données brutes de l'API externe au frontend
        res.json(salesData); 

    } catch (error) {
        console.error("Error in /api/sales proxy:", error);
        res.status(500).json({ message: `Erreur interne du proxy lors de la récupération des ventes: ${error.message}` });
    }
});


// --- Démarrage du serveur ---
app.listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
    console.log(`Allowing requests from: ${FRONTEND_URL}`);
     // Ne pas logger les identifiants
     console.log(`Using POS Username: ${API_USERNAME ? 'Configured' : 'NOT CONFIGURED!'}`); 
});

