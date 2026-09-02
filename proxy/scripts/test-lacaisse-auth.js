const LaCaisseAuthService = require('../services/lacaisseAuth');

(async () => {
    const auth = new LaCaisseAuthService();
    if (!auth.isConfigured()) {
        console.error('Définissez LACAISSE_LOGIN et LACAISSE_PASSWORD (ou LACAISSE_API_TOKEN).');
        process.exit(1);
    }

    const tokenApi = await auth.getTokenApi();
    console.log('token_api (licence):', tokenApi);
})().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
