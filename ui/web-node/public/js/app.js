document.addEventListener('DOMContentLoaded', () => {
    // 1. Колапс сайдбарів
    const setupSidebar = (btnId, sidebarId, cls = 'collapsed') => {
        const btn = document.getElementById(btnId);
        const sidebar = document.getElementById(sidebarId);
        if (btn && sidebar) {
            btn.addEventListener('click', () => {
                sidebar.classList.toggle(cls);
                // Перемальовуємо лінії після анімації
                setTimeout(drawLines, 310);
            });
        }
    };

    setupSidebar('btnLeftCollapse', 'sidebarLeft');
    setupSidebar('btnRightCollapse', 'sidebarRight');

    // 2. Повноекранний режим
    const fsBtn = document.getElementById('fsToggle');
    const schema = document.getElementById('mainSchema');
    if (fsBtn && schema) {
        fsBtn.addEventListener('click', () => {
            schema.classList.toggle('fullscreen');
            drawLines();
        });
    }

    // 3. Годинник з мілісекундами
    const clock = document.getElementById('clock');
    const updateClock = () => {
        const now = new Date();
        const time = now.toTimeString().split(' ')[0];
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        clock.textContent = `${time}.${ms}`;
        requestAnimationFrame(updateClock);
    };
    updateClock();

    // 4. Малювання SVG ліній
    const svg = document.getElementById('svgConnections');
    const viewport = document.getElementById('viewport');
    
    const drawLines = () => {
        if (!svg || !viewport) return;
        svg.innerHTML = '';
        
        const nodes = [
            { from: 'node1', to: 'node2' },
            { from: 'node2', to: 'node3' }
        ];

        const viewRect = viewport.getBoundingClientRect();

        nodes.forEach(conn => {
            const elStart = document.getElementById(conn.from);
            const elEnd = document.getElementById(conn.to);
            if (!elStart || !elEnd) return;

            const r1 = elStart.getBoundingClientRect();
            const r2 = elEnd.getBoundingClientRect();

            const x1 = r1.left - viewRect.left + r1.width / 2;
            const y1 = r1.top - viewRect.top + r1.height / 2;
            const x2 = r2.left - viewRect.left + r2.width / 2;
            const y2 = r2.top - viewRect.top + r2.height / 2;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', 'rgba(59, 130, 246, 0.5)');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-dasharray', '5,5');
            svg.appendChild(line);
        });
    };

    window.addEventListener('resize', drawLines);
    drawLines();
});