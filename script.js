// --- ESTADO & CONFIGURAÇÕES ---
let collections = JSON.parse(localStorage.getItem('memoryApp_collections')) || [];
let performanceHistory = JSON.parse(localStorage.getItem('memoryApp_performance')) || [];
let activeCollectionId = null;
let studyState = { deck: [], currentIndex: 0, correct: [], wrong: [], mode: 'seq' };
let isTransitioning = false; // A MÁGICA 1: Trava de segurança para impedir clique duplo/bug de tela

// --- ELEMENTOS DA DOM ---
const body = document.body;
const progressBar = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const btnExportAll = document.getElementById('btn-export-all');

// --- UTILITÁRIO: GERADOR DE ID BLINDADO ---
// A MÁGICA 2: Impede que cards criados muito rápido tenham o mesmo ID e crashem o sistema
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// --- TEMA ---
body.setAttribute('data-theme', localStorage.getItem('memoryApp_theme') || 'light');
document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const newTheme = body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('memoryApp_theme', newTheme);
});

// --- SISTEMA DE NAVEGAÇÃO E ROTAS ---
const views = ['dashboard', 'performance', 'manager', 'study', 'results'];

function showView(targetView) {
    views.forEach(v => document.getElementById(`view-${v}`).classList.add('hidden'));
    document.getElementById(`view-${targetView}`).classList.remove('hidden');
    
    if (targetView === 'study') {
        progressBar.classList.remove('hidden');
    } else {
        progressBar.classList.add('hidden');
    }
    
    if (btnExportAll) {
        if (targetView === 'dashboard') {
            btnExportAll.classList.remove('hidden');
        } else {
            btnExportAll.classList.add('hidden');
        }
    }
    
    document.querySelectorAll('.nav-item[data-target]').forEach(btn => {
        if (btn.getAttribute('data-target') === `view-${targetView}`) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Eventos dos Menus Laterais
document.querySelectorAll('.nav-item[data-target]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-target').replace('view-', '');
        if (target === 'performance') renderPerformance();
        if (target === 'dashboard') {
            activeCollectionId = null;
            renderDashboard();
        }
        showView(target);
    });
});

// Botões Específicos de Voltar/Concluir
document.querySelector('#view-manager .btn-back').addEventListener('click', () => {
    activeCollectionId = null;
    renderDashboard();
    showView('dashboard');
});

document.querySelector('#view-results .btn-back').addEventListener('click', () => {
    showView('manager');
});


// --- LÓGICA DOS MODAIS ---
const modalCreate = document.getElementById('modal-create');
const modalDelete = document.getElementById('modal-delete');
const modalEditCard = document.getElementById('modal-edit-card');

const inputCollectionName = document.getElementById('input-collection-name');
const editInputFront = document.getElementById('edit-input-front');
const editInputBack = document.getElementById('edit-input-back');

let collectionToDeleteId = null;
let cardToEditId = null;

// Fechar todos os modais
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        modalCreate.classList.add('hidden');
        modalDelete.classList.add('hidden');
        modalEditCard.classList.add('hidden');
    });
});

// Modal Criar Coleção
document.getElementById('btn-new-collection').addEventListener('click', () => {
    inputCollectionName.value = '';
    modalCreate.classList.remove('hidden');
    setTimeout(() => inputCollectionName.focus(), 100);
});

document.getElementById('btn-confirm-create').addEventListener('click', () => {
    const name = inputCollectionName.value.trim();
    if (name) {
        collections.push({ id: generateId(), name, cards: [] });
        saveData();
        renderDashboard();
        modalCreate.classList.add('hidden');
    }
});

// Modal Excluir Coleção
window.deleteCollection = function(id, e) {
    e.stopPropagation();
    collectionToDeleteId = id;
    modalDelete.classList.remove('hidden');
};

document.getElementById('btn-confirm-delete').addEventListener('click', () => {
    if (collectionToDeleteId) {
        performanceHistory = performanceHistory.filter(p => p.collectionId !== collectionToDeleteId);
        collections = collections.filter(c => c.id !== collectionToDeleteId);
        saveData();
        renderDashboard();
        modalDelete.classList.add('hidden');
        collectionToDeleteId = null;
    }
});

// Modal Editar Card
window.openEditCard = function(cardId) {
    cardToEditId = cardId;
    const col = collections.find(c => c.id === activeCollectionId);
    const card = col.cards.find(c => c.id === cardId);
    
    editInputFront.value = card.front;
    editInputBack.value = card.back;
    modalEditCard.classList.remove('hidden');
    setTimeout(() => editInputFront.focus(), 100);
};

document.getElementById('btn-confirm-edit-card').addEventListener('click', () => {
    if (!cardToEditId) return;
    
    const front = editInputFront.value.trim();
    const back = editInputBack.value.trim();
    
    if (front && back) {
        const col = collections.find(c => c.id === activeCollectionId);
        const card = col.cards.find(c => c.id === cardToEditId);
        card.front = front;
        card.back = back;
        
        saveData();
        renderCardsList();
        modalEditCard.classList.add('hidden');
        cardToEditId = null;
    }
});

// --- Modal Renomear Coleção ---
const modalEditCollection = document.getElementById('modal-edit-collection');
const inputEditCollectionName = document.getElementById('input-edit-collection-name');
let collectionToEditId = null;

// Garante que o botão de fechar genérico também feche esse novo modal
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        if(modalEditCollection) modalEditCollection.classList.add('hidden');
    });
});

window.openEditCollection = function(id, e) {
    e.stopPropagation(); // Impede que o clique no botão abra a coleção inteira
    collectionToEditId = id;
    const col = collections.find(c => c.id === id);
    inputEditCollectionName.value = col.name;
    modalEditCollection.classList.remove('hidden');
    setTimeout(() => inputEditCollectionName.focus(), 100);
};

document.getElementById('btn-confirm-edit-collection').addEventListener('click', () => {
    if (!collectionToEditId) return;
    
    const newName = inputEditCollectionName.value.trim();
    if (newName) {
        const col = collections.find(c => c.id === collectionToEditId);
        col.name = newName;
        
        // Atualiza a interface
        saveData();
        renderDashboard();
        
        // Se a coleção renomeada for a que está aberta no manager, atualiza o título de lá também
        if (activeCollectionId === collectionToEditId) {
            document.getElementById('current-collection-title').textContent = newName;
        }
        
        modalEditCollection.classList.add('hidden');
        collectionToEditId = null;
    }
});

// --- DASHBOARD ---

// --- DASHBOARD ---
function renderDashboard() {
    const grid = document.getElementById('collections-grid');
    grid.innerHTML = '';
    
    // SE NÃO TIVER NENHUMA COLEÇÃO, MOSTRA O AVISO!
    if (collections.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" style="color: var(--accent); opacity: 0.5;">
                    <g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd">
                        <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12m10-8a8 8 0 1 0 0 16a8 8 0 0 0 0-16"/>
                        <path d="M13 7a1 1 0 1 0-2 0v4H7a1 1 0 1 0 0 2h4v4a1 1 0 1 0 2 0v-4h4a1 1 0 1 0 0-2h-4z"/>
                    </g>
                </svg>
                <p>Nenhuma coleção encontrada.<br>Clique em <strong>Criar Coleção</strong> para começar!</p>
            </div>
        `;
        return; // Para a execução da função por aqui
    }
    
    // SE TIVER COLEÇÃO, RENDERIZA NORMALMENTE
    collections.forEach(col => {
        const div = document.createElement('div');
        div.className = 'collection-card panel';
        div.innerHTML = `
            <div class="collection-card-header">
                <h3>${col.name}</h3>
                <button class="btn-kebab" onclick="openEditCollection('${col.id}', event)" title="Renomear Coleção">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                </button>
            </div>
            <p>${col.cards.length} cards estruturados</p>
            <div class="card-actions">
                <button class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;" onclick="exportCollection('${col.id}', event)">Exportar</button>
                <button class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; color: var(--danger); border-color: var(--border);" onclick="deleteCollection('${col.id}', event)">Excluir</button>
            </div>
        `;
        div.addEventListener('click', () => openManager(col.id));
        grid.appendChild(div);
    });
}


// --- GERENCIADOR DE CARDS ---
function openManager(id) {
    activeCollectionId = id;
    const col = collections.find(c => c.id === id);
    document.getElementById('current-collection-title').textContent = col.name;
    renderCardsList();
    showView('manager');
}

document.getElementById('btn-add-card').addEventListener('click', () => {
    const front = document.getElementById('input-front').value.trim();
    const back = document.getElementById('input-back').value.trim();
    
    if (front && back && activeCollectionId) {
        const colIndex = collections.findIndex(c => c.id === activeCollectionId);
        collections[colIndex].cards.push({ id: generateId(), front, back });
        saveData();
        document.getElementById('input-front').value = '';
        document.getElementById('input-back').value = '';
        document.getElementById('input-front').focus();
        renderCardsList();
    }
});

function renderCardsList() {
    const col = collections.find(c => c.id === activeCollectionId);
    const list = document.getElementById('cards-list');
    document.getElementById('card-count').textContent = col.cards.length;
    list.innerHTML = '';
    
    const dragSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
    const editSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    const trashSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    
    col.cards.forEach((card, index) => {
        const li = document.createElement('li');
        li.draggable = true;
        li.dataset.index = index;
        li.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; overflow: hidden;">
                <span class="drag-handle" title="Segure para reordenar">${dragSvg}</span>
                <span class="item-text" style="font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${card.front}">${card.front}</span>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn-icon edit" onclick="openEditCard('${card.id}')" title="Editar Card">${editSvg}</button>
                <button class="btn-icon danger" onclick="deleteCard('${card.id}')" title="Excluir Card">${trashSvg}</button>
            </div>
        `;
        
        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragend', () => li.classList.remove('dragging'));

        list.appendChild(li);
    });
}

function deleteCard(cardId) {
    const colIndex = collections.findIndex(c => c.id === activeCollectionId);
    collections[colIndex].cards = collections[colIndex].cards.filter(c => c.id !== cardId);
    saveData();
    renderCardsList();
}


// --- DRAG AND DROP LÓGICA ---
let draggedItemIndex = null;

function handleDragStart(e) {
    draggedItemIndex = +e.currentTarget.dataset.index;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    const targetItem = e.target.closest('li');
    if (!targetItem) return;
    
    const dropIndex = +targetItem.dataset.index;
    if (draggedItemIndex === dropIndex) return;

    const colIndex = collections.findIndex(c => c.id === activeCollectionId);
    const cards = collections[colIndex].cards;
    const [draggedCard] = cards.splice(draggedItemIndex, 1);
    cards.splice(dropIndex, 0, draggedCard);
    
    saveData();
    renderCardsList();
}


// --- MODOS DE TREINO E ESTUDO ---
document.getElementById('mode-seq').addEventListener('click', (e) => setStudyMode('seq', e.currentTarget));
document.getElementById('mode-rand').addEventListener('click', (e) => setStudyMode('rand', e.currentTarget));

function setStudyMode(mode, btnElement) {
    studyState.mode = mode;
    document.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
}

document.getElementById('btn-start-study').addEventListener('click', () => {
    const col = collections.find(c => c.id === activeCollectionId);
    if (!col || col.cards.length === 0) return;
    
    // MÁGICA 3: Deep Clone. Desvincula o array do jogo do array do banco de dados pra não dar conflito!
    let deckCopy = JSON.parse(JSON.stringify(col.cards));
    if (studyState.mode === 'rand') {
        deckCopy.sort(() => Math.random() - 0.5);
    }
    
    studyState.deck = deckCopy;
    studyState.currentIndex = 0;
    studyState.correct = [];
    studyState.wrong = [];
    progressFill.style.width = '0%';
    isTransitioning = false; // Garante que a trava está solta pra começar
    
    renderStudyCard();
    showView('study');
});

function renderStudyCard() {
    const card = studyState.deck[studyState.currentIndex];
    if (!card) return; // Proteção extra pra nunca crashar a tela
    
    document.getElementById('study-front').textContent = card.front;
    document.getElementById('study-back').textContent = card.back;
    
    document.getElementById('study-back').classList.add('hidden');
    document.getElementById('study-divider').classList.add('hidden');
    document.getElementById('btn-reveal').classList.remove('hidden');
    document.getElementById('judgement-buttons').classList.add('hidden');
}

document.getElementById('btn-reveal').addEventListener('click', () => {
    document.getElementById('study-back').classList.remove('hidden');
    document.getElementById('study-divider').classList.remove('hidden');
    document.getElementById('btn-reveal').classList.add('hidden');
    document.getElementById('judgement-buttons').classList.remove('hidden');
});

function handleJudgement(isCorrect) {
    // A MÁGICA 4 (A MAIS IMPORTANTE DE TODAS): 
    // Se estiver carregando o card ou se a partida já acabou, ignora o clique! (Isso impede de TRAVAR)
    if (isTransitioning || studyState.currentIndex >= studyState.deck.length) return;
    
    isTransitioning = true; // Aciona o bloqueio de segurança
    
    const card = studyState.deck[studyState.currentIndex];
    if (card) {
        if (isCorrect) studyState.correct.push(card);
        else studyState.wrong.push(card);
    }
    
    studyState.currentIndex++;
    progressFill.style.width = `${(studyState.currentIndex / studyState.deck.length) * 100}%`;
    
    if (studyState.currentIndex < studyState.deck.length) {
        renderStudyCard();
        isTransitioning = false; // Libera pro próximo card
    } else {
        setTimeout(() => {
            showResults();
            isTransitioning = false; // Libera pra quando for jogar de novo
        }, 400);
    }
}

document.getElementById('btn-correct').addEventListener('click', () => handleJudgement(true));
document.getElementById('btn-wrong').addEventListener('click', () => handleJudgement(false));


// --- RESULTADOS E PERFORMANCE ---
function showResults() {
    const listCorrect = document.getElementById('list-correct');
    const listWrong = document.getElementById('list-wrong');
    listCorrect.innerHTML = '';
    listWrong.innerHTML = '';
    
    studyState.correct.forEach(c => listCorrect.innerHTML += `<li>${c.front}</li>`);
    studyState.wrong.forEach(c => listWrong.innerHTML += `<li>${c.front}</li>`);
    
    const accuracy = Math.round((studyState.correct.length / studyState.deck.length) * 100);
    document.getElementById('score-text').textContent = `${accuracy}% de Acerto`;
    
    const colName = collections.find(c => c.id === activeCollectionId).name;
    
    performanceHistory.unshift({
        id: generateId(),
        collectionId: activeCollectionId, 
        date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        collection: colName,
        correct: studyState.correct.length,
        total: studyState.deck.length,
        accuracy: accuracy
    });
    
    saveData();
    showView('results');
}

function renderPerformance() {
    const list = document.getElementById('performance-list');
    list.innerHTML = '';
    
    if (performanceHistory.length === 0) {
        list.innerHTML = '<li style="justify-content:center; padding: 20px; color: var(--text-muted); display:flex;">Nenhum treino realizado ainda.</li>';
        return;
    }

    const trashSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    performanceHistory.forEach(perf => {
        let scoreClass = 'score-low';
        if (perf.accuracy >= 80) scoreClass = 'score-high';
        else if (perf.accuracy >= 50) scoreClass = 'score-med';

        const li = document.createElement('li');
        li.innerHTML = `
            <div class="swipe-action" onclick="deletePerformance('${perf.id}')">
                ${trashSvg}
            </div>
            <div class="swipe-content">
                <div class="perf-info">
                    <h4>${perf.collection}</h4>
                    <span>${perf.date} • Acertou ${perf.correct} de ${perf.total}</span>
                </div>
                <div class="perf-score ${scoreClass}">${perf.accuracy}%</div>
            </div>
        `;
        list.appendChild(li);
    });

    setupSwipeToDelete();
}

function deletePerformance(id) {
    performanceHistory = performanceHistory.filter(p => p.id !== id);
    saveData();
    renderPerformance();
}

function setupSwipeToDelete() {
    const swipeContents = document.querySelectorAll('.swipe-content');
    
    swipeContents.forEach(content => {
        let startX = 0;
        let currentX = 0;
        let isDragging = false;

        const handleStart = (e) => {
            startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
            isDragging = true;
            content.style.transition = 'none';
        };

        const handleMove = (e) => {
            if (!isDragging) return;
            const x = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
            currentX = x - startX;
            
            if (currentX < 0) {
                const translateX = Math.max(currentX, -80);
                content.style.transform = `translateX(${translateX}px)`;
            } else {
                content.style.transform = `translateX(0px)`;
            }
        };

        const handleEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            content.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
            
            if (currentX < -40) {
                content.style.transform = `translateX(-80px)`;
            } else {
                content.style.transform = `translateX(0px)`;
            }
            currentX = 0;
        };

        content.addEventListener('touchstart', handleStart, { passive: true });
        content.addEventListener('touchmove', handleMove, { passive: true });
        content.addEventListener('touchend', handleEnd);
        
        content.addEventListener('mousedown', handleStart);
        content.addEventListener('mousemove', handleMove);
        content.addEventListener('mouseup', handleEnd);
        content.addEventListener('mouseleave', handleEnd);
    });
}

// --- IMPORTAR E EXPORTAR ---
document.getElementById('btn-export-all').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(collections));
    const a = document.createElement('a'); 
    a.href = dataStr; 
    a.download = `MemoryApp_Backup_Completo.json`;
    document.body.appendChild(a); 
    a.click(); 
    a.remove();
});

function saveData() { 
    localStorage.setItem('memoryApp_collections', JSON.stringify(collections)); 
    localStorage.setItem('memoryApp_performance', JSON.stringify(performanceHistory));
}

window.exportCollection = function(id, e) {
    e.stopPropagation();
    const col = collections.find(c => c.id === id);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(col));
    const a = document.createElement('a'); 
    a.href = dataStr; 
    a.download = `${col.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a); 
    a.click(); 
    a.remove();
};

document.getElementById('file-import').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const imp = JSON.parse(e.target.result);
                
                if (Array.isArray(imp)) {
                    collections = imp; 
                    saveData();
                    renderDashboard();
                    showView('dashboard');
                    alert('Backup completo restaurado com sucesso!');
                } 
                else if (imp.name && imp.cards) { 
                    imp.id = generateId(); 
                    collections.push(imp); 
                    saveData(); 
                    renderDashboard(); 
                    showView('dashboard'); 
                }
            } catch (err) {
                console.error("Erro ao importar JSON", err);
                alert("Arquivo de backup inválido.");
            }
        };
        reader.readAsText(file);
    }
    event.target.value = ''; 
});

// --- INICIALIZAÇÃO ---
renderDashboard();
showView('dashboard');