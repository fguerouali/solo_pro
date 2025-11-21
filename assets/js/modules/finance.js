import { firebase } from '../services/firebase-service.js';
import { db, dailyPaymentsCol } from '../config/firebase.js';
import { showToast, getTodayDateString, toDate } from '../core/helpers.js';
import { getOrderHistory, getAllDailyPayments } from '../core/state.js';
import { doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const setupFinanceEventListeners = () => {
    // Set default payment date
    document.getElementById('payment-date').value = getTodayDateString();

    // Calculate sales for a specific date
    const calculateSalesForDate = (dateInput) => {
        const selectedDate = new Date(dateInput);
        selectedDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        return orderHistory.filter(order => {
            const orderDate = toDate(order.saleDate || order.createdAt);
            if (!orderDate) return false;
            orderDate.setHours(0, 0, 0, 0);
            return orderDate.getTime() === selectedDate.getTime();
        }).reduce((sum, order) => sum + order.totalPrice, 0);
    };

    // Update daily payment calculations in real-time
    const updateDailyPaymentCalculations = () => {
        const dateValue = document.getElementById('payment-date').value;
        const tpeAmount = parseFloat(document.getElementById('tpe-amount').value) || 0;
        const glovoAmount = parseFloat(document.getElementById('glovo-amount').value) || 0;
        
        if (!dateValue) return;
        
        const totalSales = calculateSalesForDate(dateValue);
        const digitalPayments = tpeAmount + glovoAmount;
        const expectedCash = Math.max(0, totalSales - digitalPayments);
        
        document.getElementById('day-total-sales').textContent = `${totalSales.toFixed(2)} Mad`;
        document.getElementById('day-digital-payments').textContent = `${digitalPayments.toFixed(2)} Mad`;
        document.getElementById('day-expected-cash').textContent = `${expectedCash.toFixed(2)} Mad`;
        document.getElementById('day-expected-cash').className =
            expectedCash < 0 ? 'font-bold text-red-600 text-lg' : 'font-bold text-green-600 text-lg';
    };

    // Event listeners for real-time calculation
    document.getElementById('payment-date').addEventListener('change', updateDailyPaymentCalculations);
    document.getElementById('tpe-amount').addEventListener('input', updateDailyPaymentCalculations);
    document.getElementById('glovo-amount').addEventListener('input', updateDailyPaymentCalculations);
    document.getElementById('glovo-cash-amount').addEventListener('input', updateDailyPaymentCalculations);

    // Submit daily payment form
    document.getElementById('daily-payment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const dateValue = document.getElementById('payment-date').value;
        const tpeAmount = parseFloat(document.getElementById('tpe-amount').value) || 0;
        const glovoAmount = parseFloat(document.getElementById('glovo-amount').value) || 0;
        
        if (!dateValue) {
            showToast("Veuillez sélectionner une date.");
            return;
        }
        
        const totalSales = calculateSalesForDate(dateValue);
        const paymentDate = new Date(dateValue);
        paymentDate.setHours(12, 0, 0, 0);
        
        const existingPayment = allDailyPayments.find(p => {
            const pDate = toDate(p.date);
            return pDate && pDate.toDateString() === paymentDate.toDateString();
        });
        
        try {
            const glovoCashAmount = parseFloat(document.getElementById('glovo-cash-amount').value) || 0;
            
            const data = {
                date: paymentDate,
                tpeAmount,
                glovoAmount,
                glovoCashAmount,
                totalSales,
                expectedCash: totalSales - (tpeAmount + glovoAmount),
                createdAt: serverTimestamp()
            };
            
            if (existingPayment) {
                await updateDoc(doc(dailyPaymentsCol, existingPayment.id), data);
                showToast('Déclaration mise à jour !');
            } else {
                await addDoc(dailyPaymentsCol, data);
                showToast('Déclaration enregistrée !');
            }
            
            document.getElementById('tpe-amount').value = '0';
            document.getElementById('glovo-amount').value = '0';
            document.getElementById('glovo-cash-amount').value = '0';
            updateDailyPaymentCalculations();
            
        } catch (error) {
            console.error("Erreur déclaration:", error);
            showToast("Erreur lors de l'enregistrement.");
        }
    });

    // Delete daily payment
    document.getElementById('daily-payments-list').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-daily-payment-btn');
        if (deleteBtn) {
            const paymentId = deleteBtn.dataset.id;
            if (confirm('Supprimer cette déclaration ?')) {
                try {
                    await deleteDoc(doc(dailyPaymentsCol, paymentId));
                    showToast('Déclaration supprimée.');
                } catch (error) {
                    console.error("Erreur suppression:", error);
                    showToast("Erreur lors de la suppression.");
                }
            }
        }
    });
};

