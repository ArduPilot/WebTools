/**
 * Toast notification component
 */
const CONTAINER_ID = 'toast-container';
function getContainer() {
    let el = document.getElementById(CONTAINER_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = CONTAINER_ID;
        el.className = 'toast-container';
        document.body.appendChild(el);
    }
    return el;
}
export function showToast(type, text, duration = 4000) {
    const container = getContainer();
    const id = crypto.randomUUID();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = text;
    el.dataset.id = id;
    container.appendChild(el);
    const remove = () => {
        el.style.animation = 'slideIn 0.2s ease reverse';
        setTimeout(() => el.remove(), 200);
    };
    const t = setTimeout(remove, duration);
    el.addEventListener('click', () => {
        clearTimeout(t);
        remove();
    });
}
//# sourceMappingURL=toast.js.map