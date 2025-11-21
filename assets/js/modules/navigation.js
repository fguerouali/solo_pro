// Tab navigation logic
export const setupNavigationEventListeners = () => {
    document.querySelectorAll('.tab-link').forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Show the corresponding tab content
            document.getElementById(`${tab.dataset.tab}-content`).classList.add('active');
        });
    });
};

