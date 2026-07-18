/**
 * SiK Radio Tools - Main application entry
 */
import { renderApp } from './ui/app.js';
document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('app');
    if (!root)
        return;
    renderApp(root);
});
//# sourceMappingURL=app.js.map