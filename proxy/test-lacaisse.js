const sampleFile = process.env.LACAISSE_SAMPLE_FILE;
if (!sampleFile) {
    console.error('Définissez LACAISSE_SAMPLE_FILE pour lancer ce test.');
    process.exit(1);
}
process.env.LACAISSE_SAMPLE_FILE = sampleFile;

const LaCaissePOSProvider = require('./providers/lacaisseProvider');

(async () => {
    const provider = new LaCaissePOSProvider();
    const page1 = await provider.getIamSalesPage('2026-09-01', '2026-09-01', 1, 10);
    const page2 = await provider.getIamSalesPage('2026-09-01', '2026-09-01', 2, 10);
    console.log('page1', page1.length, page1[0]);
    console.log('page2', page2.length);
    const bills = new Set(page1.map(line => line.billNo));
    console.log('unique bills page1', bills.size);
})().catch(err => {
    console.error(err);
    process.exit(1);
});
