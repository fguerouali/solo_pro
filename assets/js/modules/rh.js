import { firebase } from '../services/firebase-service.js';
import { db, employeesCol, absencesCol, salaryPaymentsCol, chargesCol } from '../config/firebase.js';
import { showToast, getTodayDateString, toDate, formatDateToDDMMYYYY } from '../core/helpers.js';
import { openModal, closeModal } from '../ui/modals.js';
import { allEmployees, allAbsences, allSalaryPayments, allCharges, currentSalaryCalculations, setCurrentSalaryCalculations } from '../core/state.js';
import { doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const setupRHEventListeners = () => {
    // Add Employee Button
    document.getElementById('add-employee-btn').addEventListener('click', () => {
        document.getElementById('employee-modal-title').textContent = 'Ajouter un Salarié';
        document.getElementById('employee-form').reset();
        document.getElementById('employee-id').value = '';
        document.getElementById('employee-active').checked = true;
        document.getElementById('employee-start-date').value = getTodayDateString();
        openModal('employee-modal');
    });

    document.getElementById('cancel-employee').addEventListener('click', () => closeModal('employee-modal'));

    // Employee Form Submission
    document.getElementById('employee-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('employee-id').value;
        const data = {
            name: document.getElementById('employee-name').value.trim(),
            monthlySalary: parseFloat(document.getElementById('employee-salary').value),
            startDate: new Date(document.getElementById('employee-start-date').value),
            active: document.getElementById('employee-active').checked
        };

        try {
            if (id) {
                await firebase.updateEmployee(id, data);
                showToast('Salarié mis à jour !');
            } else {
                await firebase.addEmployee(data);
                showToast('Salarié ajouté !');
            }
            closeModal('employee-modal');
        } catch (error) {
            console.error("Erreur salarié:", error);
            showToast("Erreur lors de l'opération.");
        }
    });

    // Employee Actions (Edit, Delete, Manage Absences)
    document.getElementById('employees-list').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-employee-btn');
        const editBtn = e.target.closest('.edit-employee-btn');
        const absencesBtn = e.target.closest('.manage-absences-btn');

        if (deleteBtn) {
            const employeeId = deleteBtn.dataset.id;
            if (confirm('Voulez-vous vraiment supprimer ce salarié ? Toutes ses absences seront également supprimées.')) {
                try {
                    const employeeAbsences = allAbsences.filter(a => a.employeeId === employeeId);
                    for (const absence of employeeAbsences) {
                        await firebase.deleteAbsence(absence.id);
                    }
                    await firebase.deleteEmployee(employeeId);
                    showToast('Salarié supprimé.');
                } catch (error) {
                    console.error("Erreur suppression salarié:", error);
                    showToast("Erreur lors de la suppression.");
                }
            }
        } else if (editBtn) {
            const employeeId = editBtn.dataset.id;
            const employee = allEmployees.find(e => e.id === employeeId);
            if (employee) {
                document.getElementById('employee-modal-title').textContent = 'Modifier le Salarié';
                document.getElementById('employee-id').value = employee.id;
                document.getElementById('employee-name').value = employee.name;
                document.getElementById('employee-salary').value = employee.monthlySalary;
                
                const startDate = toDate(employee.startDate);
                if (startDate) {
                    const year = startDate.getFullYear();
                    const month = String(startDate.getMonth() + 1).padStart(2, '0');
                    const day = String(startDate.getDate()).padStart(2, '0');
                    document.getElementById('employee-start-date').value = `${year}-${month}-${day}`;
                }
                
                document.getElementById('employee-active').checked = employee.active;
                openModal('employee-modal');
            }
        } else if (absencesBtn) {
            const employeeId = absencesBtn.dataset.id;
            const employee = allEmployees.find(e => e.id === employeeId);
            if (employee) {
                document.getElementById('absence-employee-id').value = employee.id;
                document.getElementById('absence-employee-name').textContent = employee.name;
                
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                document.getElementById('absence-month').value = `${year}-${month}`;
                
                renderAbsencesForEmployee(employeeId);
                openModal('absences-modal');
            }
        }
    });

    // Absences Modal
    document.getElementById('cancel-absences').addEventListener('click', () => closeModal('absences-modal'));

    document.getElementById('absence-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const employeeId = document.getElementById('absence-employee-id').value;
        const month = document.getElementById('absence-month').value;
        const days = parseFloat(document.getElementById('absence-days').value);

        if (days < 0 || days > 26) {
            showToast('Le nombre de jours d\'absence doit être entre 0 et 26.');
            return;
        }

        const existingAbsence = allAbsences.find(a => a.employeeId === employeeId && a.month === month);

        try {
            if (existingAbsence) {
                await firebase.updateAbsence(existingAbsence.id, { days });
                showToast('Absence mise à jour !');
            } else {
                await firebase.addAbsence({
                    employeeId,
                    month,
                    days
                });
                showToast('Absence enregistrée !');
            }
            
            document.getElementById('absence-days').value = '';
            renderAbsencesForEmployee(employeeId);
        } catch (error) {
            console.error("Erreur absence:", error);
            showToast("Erreur lors de l'enregistrement de l'absence.");
        }
    });

    // Delete Absence
    document.getElementById('absences-list').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-absence-btn');
        if (deleteBtn) {
            const absenceId = deleteBtn.dataset.id;
            if (confirm('Supprimer cette absence ?')) {
                try {
                    await firebase.deleteAbsence(absenceId);
                    showToast('Absence supprimée.');
                    const employeeId = document.getElementById('absence-employee-id').value;
                    renderAbsencesForEmployee(employeeId);
                } catch (error) {
                    console.error("Erreur suppression absence:", error);
                    showToast("Erreur lors de la suppression.");
                }
            }
        }
    });

    // Calculate Salaries
    document.getElementById('calculate-salaries-btn').addEventListener('click', () => {
        const monthInput = document.getElementById('salary-month').value;
        
        if (!monthInput) {
            showToast('Veuillez sélectionner un mois.');
            return;
        }

        const activeEmployees = allEmployees.filter(e => e.active);
        
        if (activeEmployees.length === 0) {
            showToast('Aucun salarié actif à payer.');
            return;
        }

        const calculations = [];
        let totalAmount = 0;

        activeEmployees.forEach(employee => {
            const monthlySalary = employee.monthlySalary;
            const dailySalary = monthlySalary / 26;
            
            const absence = allAbsences.find(a => a.employeeId === employee.id && a.month === monthInput);
            const absenceDays = absence ? absence.days : 0;
            
            const deduction = dailySalary * absenceDays;
            const finalSalary = monthlySalary - deduction;
            
            calculations.push({
                employeeId: employee.id,
                name: employee.name,
                monthlySalary,
                absenceDays,
                deduction,
                finalSalary
            });
            
            totalAmount += finalSalary;
        });

        const resultsContainer = document.getElementById('salary-results-list');
        resultsContainer.innerHTML = '';
        
        calculations.forEach(calc => {
            const div = document.createElement('div');
            div.className = 'bg-gray-50 p-3 rounded-lg';
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-semibold text-gray-900">${calc.name}</p>
                        <p class="text-xs text-gray-600">Salaire base: ${calc.monthlySalary.toFixed(2)} Mad</p>
                        ${calc.absenceDays > 0 ? `
                            <p class="text-xs text-yellow-600">
                                <i class="fas fa-exclamation-triangle"></i> 
                                ${calc.absenceDays} jour(s) d'absence (-${calc.deduction.toFixed(2)} Mad)
                            </p>
                        ` : '<p class="text-xs text-green-600"><i class="fas fa-check"></i> Aucune absence</p>'}
                    </div>
                    <p class="text-lg font-bold text-gray-900">${calc.finalSalary.toFixed(2)} Mad</p>
                </div>
            `;
            resultsContainer.appendChild(div);
        });
        
        setCurrentSalaryCalculations(calculations);
        document.getElementById('total-salary-amount').textContent = `${totalAmount.toFixed(2)} Mad`;
        document.getElementById('salary-calculations').classList.remove('hidden');
    });

    // Pay All Salaries
    document.getElementById('pay-all-salaries-btn').addEventListener('click', async () => {
        if (currentSalaryCalculations.length === 0) {
            showToast('Aucun salaire à payer.');
            return;
        }

        const monthInput = document.getElementById('salary-month').value;
        
        if (!confirm(`Confirmer le paiement de ${currentSalaryCalculations.length} salaire(s) pour le mois ${monthInput} ?`)) {
            return;
        }

        try {
            const totalAmount = currentSalaryCalculations.reduce((sum, calc) => sum + calc.finalSalary, 0);
            
            await addDoc(salaryPaymentsCol, {
                month: monthInput,
                employees: currentSalaryCalculations,
                totalAmount,
                paymentDate: new Date(),
                createdAt: serverTimestamp()
            });

            await addDoc(chargesCol, {
                name: `Salaires ${monthInput}`,
                amount: totalAmount,
                date: new Date(),
                createdAt: serverTimestamp(),
                type: 'salary'
            });

            showToast(`Paiement de ${totalAmount.toFixed(2)} Mad enregistré !`);
            
            document.getElementById('salary-calculations').classList.add('hidden');
            document.getElementById('salary-month').value = '';
            setCurrentSalaryCalculations([]);
            
        } catch (error) {
            console.error("Erreur paiement salaires:", error);
            showToast("Erreur lors du paiement.");
        }
    });

    // Delete Salary Payment
    document.getElementById('salary-payments-history').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-salary-payment-btn');
        if (deleteBtn) {
            const paymentId = deleteBtn.dataset.id;
            const payment = allSalaryPayments.find(p => p.id === paymentId);
            
            if (!payment) return;
            
            if (confirm(`Voulez-vous vraiment supprimer ce paiement de salaires ?\n\nMontant: ${payment.totalAmount.toFixed(2)} Mad\nMois: ${payment.month}\n\nLa charge associée sera également supprimée.`)) {
                try {
                    await firebase.deleteSalaryPayment(paymentId);
                    
                    const associatedCharge = allCharges.find(charge =>
                        charge.type === 'salary' &&
                        charge.name === `Salaires ${payment.month}` &&
                        Math.abs(charge.amount - payment.totalAmount) < 0.01
                    );
                    
                    if (associatedCharge) {
                        await deleteDoc(doc(chargesCol, associatedCharge.id));
                        showToast(`Paiement supprimé. Charge de ${payment.totalAmount.toFixed(2)} Mad retirée.`);
                    } else {
                        showToast('Paiement supprimé (charge associée non trouvée).');
                    }
                    
                } catch (error) {
                    console.error("Erreur suppression paiement salaire:", error);
                    showToast("Erreur lors de la suppression.");
                }
            }
        }
    });
};

// Helper to render absences for a specific employee
const renderAbsencesForEmployee = (employeeId) => {
    const container = document.getElementById('absences-list');
    const employeeAbsences = allAbsences.filter(a => a.employeeId === employeeId);
    
    container.innerHTML = '';
    
    if (employeeAbsences.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Aucune absence enregistrée.</p>';
    } else {
        employeeAbsences.sort((a, b) => b.month.localeCompare(a.month));
        employeeAbsences.forEach(absence => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center bg-gray-50 p-2 rounded';
            div.innerHTML = `
                <div>
                    <span class="text-sm font-medium">${absence.month}</span>
                    <span class="text-xs text-gray-600 ml-2">${absence.days} jour(s)</span>
                </div>
                <button data-id="${absence.id}" class="delete-absence-btn text-red-500 hover:text-red-700">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.appendChild(div);
        });
    }
};

