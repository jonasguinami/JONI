// ============================================================================
// --- ESTADO & CONFIGURAÇÕES GLOBAIS ---
// ============================================================================
let collections = JSON.parse(localStorage.getItem('memoryApp_collections')) || [];
let performanceHistory = JSON.parse(localStorage.getItem('memoryApp_performance')) || [];
let activeCollectionId = null;
let studyState = { deck: [], currentIndex: 0, correct: [], wrong: [], mode: 'seq' };
let isTransitioning = false; // Trava de segurança para impedir duplo clique/bugs de tela

// ============================================================================
// --- CACHE DE ELEMENTOS DA DOM ---
// ============================================================================
const DOM = {
    body: document.body,
    progressBar: document.getElementById('progress-container'),
    progressFill: document.getElementById('progress-fill'),
    btnExportAll: document.getElementById('btn-export-all'),
    
    // Modais
    modalCreate: document.getElementById('modal-create'),
    modalDelete: document.getElementById('modal-delete'),
    modalEditCard: document.getElementById('modal-edit-card'),
    modalEditCollection: document.getElementById('modal-edit-collection'),
    modalPerfDetails: document.getElementById('modal-performance-details'),
    modalTimer: document.getElementById('modal-timer'),
    
    // Inputs
    inputCollectionName: document.getElementById('input-collection-name'),
    inputEditCollectionName: document.getElementById('input-edit-collection-name'),
    editInputFront: document.getElementById('edit-input-front'),
    editInputBack: document.getElementById('edit-input-back'),
    inputSearchCards: document.getElementById('input-search-cards'),
    
    // Grids e Listas
    collectionsGrid: document.getElementById('collections-grid'),
    cardsList: document.getElementById('cards-list'),
    performanceList: document.getElementById('performance-list'),
    
    // Elementos de Estudo
    studyFront: document.getElementById('study-front'),
    studyBack: document.getElementById('study-back'),
    studyDivider: document.getElementById('study-divider'),
    btnReveal: document.getElementById('btn-reveal'),
    judgementButtons: document.getElementById('judgement-buttons'),
    cardTimerBar: document.getElementById('card-timer-bar'),
    timerSlider: document.getElementById('timer-slider'),
    timerDisplay: document.getElementById('timer-display'),
    
    // Views
    views: ['dashboard', 'performance', 'manager', 'study', 'results']
};

// Variaveis Auxiliares de Modais
let collectionToDeleteId = null;
let collectionToEditId = null;
let cardToEditId = null;
let currentPerfIdForModal = null;

// Temporizadores
let cardTimerSeconds = 0; // 0 = Desativado
let studyTimerInterval = null;

// ============================================================================
// --- UTILITÁRIOS & HELPERS ---
// ============================================================================

/**
 * Gera IDs únicos utilizando Crypto API com fallback para Data/Random (Blindado)
 */
function generateId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Função de Debounce para otimizar pesquisas em tempo real
 */
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Clonagem profunda (Deep Clone) otimizada
 */
function deepClone(obj) {
    return typeof structuredClone === 'function' 
        ? structuredClone(obj) 
        : JSON.parse(JSON.stringify(obj));
}

/**
 * Salva os dados no localStorage de forma centralizada
 */
function saveData() { 
    localStorage.setItem('memoryApp_collections', JSON.stringify(collections)); 
    localStorage.setItem('memoryApp_performance', JSON.stringify(performanceHistory));
}

// ============================================================================
// --- TEMA E INICIALIZAÇÃO ---
// ============================================================================
DOM.body.setAttribute('data-theme', localStorage.getItem('memoryApp_theme') || 'light');

document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const newTheme = DOM.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    DOM.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('memoryApp_theme', newTheme);
});

// ============================================================================
// --- SISTEMA DE NAVEGAÇÃO E ROTAS ---
// ============================================================================
function showView(targetView) {
    DOM.views.forEach(v => document.getElementById(`view-${v}`).classList.add('hidden'));
    document.getElementById(`view-${targetView}`).classList.remove('hidden');
    
    if (targetView === 'study') {
        DOM.progressBar.classList.remove('hidden');
    } else {
        DOM.progressBar.classList.add('hidden');
    }
    
    if (DOM.btnExportAll) {
        DOM.btnExportAll.classList.toggle('hidden', targetView !== 'dashboard');
    }
    
    document.querySelectorAll('.nav-item[data-target]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-target') === `view-${targetView}`);
    });
}

// Eventos de Navegação Lateral
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

// Botões Específicos de Navegação (Back/Concluir)
document.getElementById('btn-back-study').addEventListener('click', () => {
    clearInterval(studyTimerInterval);
    showView('manager');
    openManager(activeCollectionId); // Recarrega para mostrar status "Continuar"
});

document.querySelector('#view-manager .btn-back').addEventListener('click', () => {
    activeCollectionId = null;
    renderDashboard();
    showView('dashboard');
});

document.querySelector('#view-results .btn-back').addEventListener('click', () => {
    showView('manager');
});

// ============================================================================
// --- LÓGICA UNIVERSAL DE MODAIS ---
// ============================================================================
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modal = e.currentTarget.closest('.modal-overlay');
        if (modal) modal.classList.add('hidden');
    });
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) {
            overlay.classList.add('hidden');
        }
    });
});

// NOVO: Função Global para Visualizar o Card (Modo Leitura)
window.openViewCard = function(cardId) {
    const col = collections.find(c => c.id === activeCollectionId);
    if (!col) return;
    
    const card = col.cards.find(c => c.id === cardId);
    if (!card) return;
    
    document.getElementById('view-card-front').textContent = card.front;
    document.getElementById('view-card-back').textContent = card.back;
    document.getElementById('modal-view-card').classList.remove('hidden');
};

// ============================================================================
// --- COLEÇÕES: CRUD MODAIS E RENDERS ---
// ============================================================================

// Modal: Criar Coleção
document.getElementById('btn-new-collection').addEventListener('click', () => {
    DOM.inputCollectionName.value = '';
    DOM.modalCreate.classList.remove('hidden');
    setTimeout(() => DOM.inputCollectionName.focus(), 100);
});

document.getElementById('btn-confirm-create').addEventListener('click', () => {
    const name = DOM.inputCollectionName.value.trim();
    if (name) {
        collections.push({ id: generateId(), name, cards: [] });
        saveData();
        renderDashboard();
        DOM.modalCreate.classList.add('hidden');
    }
});

// Modal: Excluir Coleção
window.deleteCollection = function(id, e) {
    e.stopPropagation();
    collectionToDeleteId = id;
    DOM.modalDelete.classList.remove('hidden');
};

document.getElementById('btn-confirm-delete').addEventListener('click', () => {
    if (collectionToDeleteId) {
        performanceHistory = performanceHistory.filter(p => p.collectionId !== collectionToDeleteId);
        collections = collections.filter(c => c.id !== collectionToDeleteId);
        saveData();
        renderDashboard();
        DOM.modalDelete.classList.add('hidden');
        collectionToDeleteId = null;
    }
});

// Modal: Renomear Coleção
window.openEditCollection = function(id, e) {
    e.stopPropagation(); 
    collectionToEditId = id;
    const col = collections.find(c => c.id === id);
    if (!col) return;

    DOM.inputEditCollectionName.value = col.name;
    DOM.modalEditCollection.classList.remove('hidden');
    setTimeout(() => DOM.inputEditCollectionName.focus(), 100);
};

document.getElementById('btn-confirm-edit-collection').addEventListener('click', () => {
    if (!collectionToEditId) return;
    
    const newName = DOM.inputEditCollectionName.value.trim();
    if (newName) {
        const col = collections.find(c => c.id === collectionToEditId);
        if (col) col.name = newName;
        
        saveData();
        renderDashboard();
        
        if (activeCollectionId === collectionToEditId) {
            document.getElementById('current-collection-title').textContent = newName;
        }
        
        DOM.modalEditCollection.classList.add('hidden');
        collectionToEditId = null;
    }
});

// Renderização: Dashboard Principal
function renderDashboard() {
    DOM.collectionsGrid.innerHTML = '';
    
    if (collections.length === 0) {
        DOM.collectionsGrid.innerHTML = `
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
        return; 
    }
    
    // Performance Otimização: Evitar múltiplos reflows na grid usando DocumentFragment
    const fragment = document.createDocumentFragment();
    
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
        fragment.appendChild(div);
    });
    
    DOM.collectionsGrid.appendChild(fragment);
}

// ============================================================================
// --- CARDS: CRUD E MANAGER ---
// ============================================================================

// Busca Otimizada (Debounce implementado para não gargalar a Main Thread)
DOM.inputSearchCards.addEventListener('input', debounce((e) => {
    const term = e.target.value.toLowerCase();
    const listItems = document.querySelectorAll('#cards-list li');
    
    listItems.forEach(li => {
        const textElement = li.querySelector('.item-text');
        if (textElement && textElement.textContent.toLowerCase().includes(term)) {
            li.style.display = 'flex'; 
        } else {
            li.style.display = 'none'; 
        }
    });
}, 250));

// Adicionar novo Card
document.getElementById('btn-add-card').addEventListener('click', () => {
    const inputFront = document.getElementById('input-front');
    const inputBack = document.getElementById('input-back');
    const front = inputFront.value.trim();
    const back = inputBack.value.trim();
    
    if (front && back && activeCollectionId) {
        const colIndex = collections.findIndex(c => c.id === activeCollectionId);
        collections[colIndex].cards.push({ id: generateId(), front, back });
        saveData();
        
        inputFront.value = '';
        inputBack.value = '';
        inputFront.focus();
        renderCardsList();
    }
});

// Modal: Editar Card
window.openEditCard = function(cardId) {
    cardToEditId = cardId;
    const col = collections.find(c => c.id === activeCollectionId);
    if (!col) return;
    
    const card = col.cards.find(c => c.id === cardId);
    if (!card) return;
    
    DOM.editInputFront.value = card.front;
    DOM.editInputBack.value = card.back;
    DOM.modalEditCard.classList.remove('hidden');
    setTimeout(() => DOM.editInputFront.focus(), 100);
};

document.getElementById('btn-confirm-edit-card').addEventListener('click', () => {
    if (!cardToEditId) return;
    
    const front = DOM.editInputFront.value.trim();
    const back = DOM.editInputBack.value.trim();
    
    if (front && back) {
        const col = collections.find(c => c.id === activeCollectionId);
        const card = col.cards.find(c => c.id === cardToEditId);
        card.front = front;
        card.back = back;
        
        saveData();
        renderCardsList();
        DOM.modalEditCard.classList.add('hidden');
        cardToEditId = null;
    }
});

// Excluir Card (Via Window Global handler para inline onclick)
window.deleteCard = function(cardId) {
    const colIndex = collections.findIndex(c => c.id === activeCollectionId);
    if (colIndex !== -1) {
        collections[colIndex].cards = collections[colIndex].cards.filter(c => c.id !== cardId);
        saveData();
        renderCardsList();
    }
};

// Abre o Visualizador do Manager
function openManager(id) {
    activeCollectionId = id;
    const col = collections.find(c => c.id === id);
    if (!col) return;
    
    document.getElementById('current-collection-title').textContent = col.name;
    renderCardsList();
    
    const savedSession = localStorage.getItem(`memoryApp_session_${id}`);
    const btnStart = document.getElementById('btn-start-study');
    const svgPlay = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6.906 4.537A.6.6 0 0 0 6 5.053v13.894a.6.6 0 0 0 .906.516l11.723-6.947a.6.6 0 0 0 0-1.032z"/></svg>`;
    
    btnStart.innerHTML = savedSession ? `${svgPlay} Continuar` : `${svgPlay} Jogar`;
    showView('manager');
}

// Renderização da Lista de Cards com Status de Sessão e Drag & Drop
function renderCardsList() {
    const col = collections.find(c => c.id === activeCollectionId);
    if (!col) return;
    
    document.getElementById('card-count').textContent = col.cards.length;
    DOM.cardsList.innerHTML = '';
    
    const savedSessionStr = localStorage.getItem(`memoryApp_session_${activeCollectionId}`);
    const savedSession = savedSessionStr ? JSON.parse(savedSessionStr) : null;

    const dragSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
    const editSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    const trashSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    
    const fragment = document.createDocumentFragment();

    col.cards.forEach((card, index) => {
        const li = document.createElement('li');
        li.draggable = true;
        li.dataset.index = index;
        
        let statusClass = '';
        let statusIcon = '';
        
        if (savedSession) {
            const isCorrect = savedSession.correct.some(c => c.id === card.id);
            const isWrong = savedSession.wrong.some(c => c.id === card.id);
            
            if (isCorrect) {
                statusClass = 'status-correct';
                statusIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; flex-shrink: 0;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            } else if (isWrong) {
                statusClass = 'status-wrong';
                statusIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; flex-shrink: 0;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            }
        }
        
        if (statusClass) li.classList.add(statusClass);

        li.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; overflow: hidden;">
                <span class="drag-handle" title="Segure para reordenar">${dragSvg}</span>
                ${statusIcon}
                <div onclick="openViewCard('${card.id}')" style="flex: 1; cursor: pointer; overflow: hidden; display: flex; align-items: center; padding: 4px 0;">
                    <span class="item-text" style="font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${card.front}">${card.front}</span>
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn-icon edit" onclick="openEditCard('${card.id}')" title="Editar Card">${editSvg}</button>
                <button class="btn-icon danger" onclick="deleteCard('${card.id}')" title="Excluir Card">${trashSvg}</button>
            </div>
        `;
        
        // Listeners para Drag and Drop
        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('drop', handleDrop);
        li.addEventListener('dragend', () => li.classList.remove('dragging'));

        fragment.appendChild(li);
    });
    
    DOM.cardsList.appendChild(fragment);
}

// Lógica de Drag and Drop
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
    if (draggedItemIndex === dropIndex || draggedItemIndex === null) return;

    const colIndex = collections.findIndex(c => c.id === activeCollectionId);
    if (colIndex === -1) return;
    
    const cards = collections[colIndex].cards;
    const [draggedCard] = cards.splice(draggedItemIndex, 1);
    cards.splice(dropIndex, 0, draggedCard);
    
    saveData();
    renderCardsList();
    draggedItemIndex = null;
}

// ============================================================================
// --- ENGINE DE ESTUDO & TIMER ---
// ============================================================================

// Controle de Modo (Sequencial x Aleatório)
function setStudyMode(mode, btnElement) {
    studyState.mode = mode;
    document.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
}
document.getElementById('mode-seq').addEventListener('click', (e) => setStudyMode('seq', e.currentTarget));
document.getElementById('mode-rand').addEventListener('click', (e) => setStudyMode('rand', e.currentTarget));

// Gerenciamento de Timer
DOM.timerSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    cardTimerSeconds = val;
    DOM.timerDisplay.textContent = val === 0 ? 'Desativado' : `${val} Segundos`;
    DOM.timerDisplay.style.color = val === 0 ? 'var(--text-muted)' : 'var(--accent)';
});

document.getElementById('btn-timer-setup').addEventListener('click', () => {
    DOM.modalTimer.classList.remove('hidden');
});

function startCardTimer() {
    clearInterval(studyTimerInterval);
    
    if (cardTimerSeconds === 0) {
        DOM.cardTimerBar.style.display = 'none';
        return;
    }
    
    DOM.cardTimerBar.style.display = 'block';
    DOM.cardTimerBar.style.width = '100%';
    DOM.cardTimerBar.style.transition = 'none';
    
    // Força reflow sincronizado para reiniciar CSS Transition
    void DOM.cardTimerBar.offsetWidth;
    
    DOM.cardTimerBar.style.transition = `width ${cardTimerSeconds}s linear`;
    DOM.cardTimerBar.style.width = '0%';
    
    let timeRemaining = cardTimerSeconds;
    studyTimerInterval = setInterval(() => {
        timeRemaining--;
        if (timeRemaining <= 0) {
            clearInterval(studyTimerInterval);
            if (DOM.studyBack.classList.contains('hidden')) {
                DOM.btnReveal.click();
            }
        }
    }, 1000);
}

// Controle do Jogo (Iniciar/Reset/Continuar)
document.getElementById('btn-start-study').addEventListener('click', () => {
    const col = collections.find(c => c.id === activeCollectionId);
    if (!col || col.cards.length === 0) return;
    
    const savedSession = localStorage.getItem(`memoryApp_session_${activeCollectionId}`);
    
    if (savedSession) {
        studyState = JSON.parse(savedSession);
    } else {
        let deckCopy = deepClone(col.cards);
        if (studyState.mode === 'rand') {
            deckCopy.sort(() => Math.random() - 0.5);
        }
        studyState = {
            mode: studyState.mode,
            deck: deckCopy,
            currentIndex: 0,
            correct: [],
            wrong: []
        };
    }
    
    DOM.progressFill.style.width = `${(studyState.currentIndex / studyState.deck.length) * 100}%`;
    isTransitioning = false; 
    
    renderStudyCard();
    showView('study');
});

document.getElementById('btn-reset-study').addEventListener('click', () => {
    clearInterval(studyTimerInterval);
    localStorage.removeItem(`memoryApp_session_${activeCollectionId}`);
    
    const col = collections.find(c => c.id === activeCollectionId);
    if (!col) return;

    let deckCopy = deepClone(col.cards);
    if (studyState.mode === 'rand') {
        deckCopy.sort(() => Math.random() - 0.5);
    }
    
    studyState.deck = deckCopy;
    studyState.currentIndex = 0;
    studyState.correct = [];
    studyState.wrong = [];
    
    DOM.progressFill.style.width = '0%';
    isTransitioning = false;
    
    renderStudyCard();
});

// Mecânica do Card
function renderStudyCard() {
    const card = studyState.deck[studyState.currentIndex];
    if (!card) return; 
    
    DOM.studyFront.textContent = card.front;
    DOM.studyBack.textContent = card.back;
    
    DOM.studyBack.classList.add('hidden');
    DOM.studyDivider.classList.add('hidden');
    DOM.btnReveal.classList.remove('hidden');
    DOM.judgementButtons.classList.add('hidden');
    
    startCardTimer();
}

DOM.btnReveal.addEventListener('click', () => {
    clearInterval(studyTimerInterval); 
    DOM.studyBack.classList.remove('hidden');
    DOM.studyDivider.classList.remove('hidden');
    DOM.btnReveal.classList.add('hidden');
    DOM.judgementButtons.classList.remove('hidden');
});

function handleJudgement(isCorrect) {
    if (isTransitioning || studyState.currentIndex >= studyState.deck.length) return;
    isTransitioning = true; 
    
    const card = studyState.deck[studyState.currentIndex];
    if (card) {
        if (isCorrect) studyState.correct.push(card);
        else studyState.wrong.push(card);
    }
    
    studyState.currentIndex++;
    DOM.progressFill.style.width = `${(studyState.currentIndex / studyState.deck.length) * 100}%`;
    
    localStorage.setItem(`memoryApp_session_${activeCollectionId}`, JSON.stringify(studyState));
    
    if (studyState.currentIndex < studyState.deck.length) {
        renderStudyCard();
        isTransitioning = false; 
    } else {
        setTimeout(() => {
            showResults();
            isTransitioning = false;
        }, 400);
    }
}

document.getElementById('btn-correct').addEventListener('click', () => handleJudgement(true));
document.getElementById('btn-wrong').addEventListener('click', () => handleJudgement(false));

// ============================================================================
// --- PERFORMANCE E RESULTADOS ---
// ============================================================================

function showResults() {
    localStorage.removeItem(`memoryApp_session_${activeCollectionId}`);
    
    const listCorrect = document.getElementById('list-correct');
    const listWrong = document.getElementById('list-wrong');
    
    // Otimização de Performance: Substituição de += iterativo por String Map + Join
    listCorrect.innerHTML = studyState.correct.map(c => `<li>${c.front}</li>`).join('');
    listWrong.innerHTML = studyState.wrong.map(c => `<li>${c.front}</li>`).join('');
    
    const accuracy = Math.round((studyState.correct.length / studyState.deck.length) * 100);
    document.getElementById('score-text').textContent = `${accuracy}% de Acerto`;
    
    const colName = collections.find(c => c.id === activeCollectionId)?.name || 'Coleção Oculta';
    
    performanceHistory.unshift({
        id: generateId(),
        collectionId: activeCollectionId, 
        date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        collection: colName,
        correct: studyState.correct.length,
        total: studyState.deck.length,
        accuracy: accuracy,
        correctCards: deepClone(studyState.correct), 
        wrongCards: deepClone(studyState.wrong)
    });
    
    saveData();
    showView('results');
}

function renderPerformance() {
    DOM.performanceList.innerHTML = '';
    
    if (performanceHistory.length === 0) {
        DOM.performanceList.innerHTML = '<li style="justify-content:center; padding: 20px; color: var(--text-muted); display:flex;">Nenhum treino realizado ainda.</li>';
        return;
    }

    const trashSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    const fragment = document.createDocumentFragment();

    performanceHistory.forEach(perf => {
        let scoreClass = 'score-low';
        if (perf.accuracy >= 80) scoreClass = 'score-high';
        else if (perf.accuracy >= 50) scoreClass = 'score-med';

        const li = document.createElement('li');
        li.innerHTML = `
            <div class="swipe-action" onclick="deletePerformance('${perf.id}')">
                ${trashSvg}
            </div>
            <div class="swipe-content" onclick="openPerformanceDetails('${perf.id}')" style="cursor: pointer;">
                <div class="perf-info">
                    <h4>${perf.collection}</h4>
                    <span>${perf.date} • Acertou ${perf.correct} de ${perf.total}</span>
                </div>
                <div class="perf-score ${scoreClass}">${perf.accuracy}%</div>
            </div>
        `;
        fragment.appendChild(li);
    });

    DOM.performanceList.appendChild(fragment);
    setupSwipeToDelete();
}

// Modal de Detalhes da Performance e Reforço
window.openPerformanceDetails = function(perfId) {
    currentPerfIdForModal = perfId;
    const perf = performanceHistory.find(p => p.id === perfId);
    if (!perf) return;

    const modalListCorrect = document.getElementById('modal-list-correct');
    const modalListWrong = document.getElementById('modal-list-wrong');
    const btnReforco = document.getElementById('btn-create-reinforcement');

    // Mapeamento otimizado de Arrays para a DOM do modal
    modalListCorrect.innerHTML = perf.correctCards && perf.correctCards.length > 0
        ? perf.correctCards.map(c => `<li>${c.front}</li>`).join('')
        : `<li style="background: transparent; border: none; color: var(--text-muted); padding: 0;">${perf.correct > 0 ? 'Detalhes não salvos em versões anteriores.' : 'Nenhum acerto nesta sessão.'}</li>`;

    modalListWrong.innerHTML = perf.wrongCards && perf.wrongCards.length > 0
        ? perf.wrongCards.map(c => `<li>${c.front}</li>`).join('')
        : `<li style="background: transparent; border: none; color: var(--text-muted); padding: 0;">${(perf.total - perf.correct) > 0 && !perf.wrongCards ? 'Detalhes não salvos em versões anteriores.' : 'Nenhum erro. Perfeito!'}</li>`;

    // Controle visual do botão de reforço
    btnReforco.style.display = (perf.wrongCards && perf.wrongCards.length > 0) ? 'inline-flex' : 'none';
    DOM.modalPerfDetails.classList.remove('hidden');
};

document.getElementById('btn-create-reinforcement').addEventListener('click', () => {
    if(!currentPerfIdForModal) return;
    const perf = performanceHistory.find(p => p.id === currentPerfIdForModal);
    if(!perf || !perf.wrongCards || perf.wrongCards.length === 0) return;

    const novaColecao = {
        id: generateId(),
        name: `REFORÇO: ${perf.collection}`,
        cards: deepClone(perf.wrongCards)
    };

    collections.unshift(novaColecao);
    saveData();
    renderDashboard();
    
    DOM.modalPerfDetails.classList.add('hidden');
    showView('dashboard');
    document.querySelector('.nav-item[data-target="view-dashboard"]').click();
});

// Lógica de Deletar Performance
window.deletePerformance = function(id) {
    performanceHistory = performanceHistory.filter(p => p.id !== id);
    saveData();
    renderPerformance();
};

// Lógica Visual do Swipe para Deletar (Touch/Mouse)
function setupSwipeToDelete() {
    const swipeContents = document.querySelectorAll('.swipe-content');
    
    swipeContents.forEach(content => {
        let startX = 0, currentX = 0, isDragging = false;

        const handleStart = (e) => {
            startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
            isDragging = true;
            content.style.transition = 'none';
        };

        const handleMove = (e) => {
            if (!isDragging) return;
            const x = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
            currentX = x - startX;
            content.style.transform = `translateX(${currentX < 0 ? Math.max(currentX, -80) : 0}px)`;
        };

        const handleEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            content.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
            content.style.transform = `translateX(${currentX < -40 ? -80 : 0}px)`;
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

// ============================================================================
// --- I/O: EXPORTAÇÃO E IMPORTAÇÃO DE DADOS (JSON) ---
// ============================================================================

function createDownload(filename, data) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
    const a = document.createElement('a'); 
    a.href = dataStr; 
    a.download = filename;
    DOM.body.appendChild(a); 
    a.click(); 
    a.remove();
}

DOM.btnExportAll.addEventListener('click', () => {
    createDownload('MemoryApp_Backup_Completo.json', collections);
});

window.exportCollection = function(id, e) {
    e.stopPropagation();
    const col = collections.find(c => c.id === id);
    if(col) createDownload(`${col.name.replace(/\s+/g, '_')}.json`, col);
};

// Loader de JSON genérico via FileReader
function handleFileImport(event, onSuccess) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsedData = JSON.parse(e.target.result);
            onSuccess(parsedData);
        } catch (err) {
            console.error("Erro no Parse do JSON", err);
            alert("Arquivo inválido. Certifique-se de ser um arquivo suportado (.json).");
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reseta input
}

// Input: Restaurar Backup Completo
document.getElementById('file-import').addEventListener('change', (e) => {
    handleFileImport(e, (imp) => {
        if (Array.isArray(imp)) {
            collections = imp; 
            saveData();
            renderDashboard();
            showView('dashboard');
            alert('Backup completo restaurado com sucesso!');
        } else if (imp.name && imp.cards) { 
            imp.id = generateId(); 
            collections.push(imp); 
            saveData(); 
            renderDashboard(); 
            showView('dashboard'); 
        } else {
            alert('Formato de coleção não reconhecido.');
        }
    });
});

// Input: Mesclar Cards numa Coleção Ativa
document.getElementById('file-import-append').addEventListener('change', (e) => {
    if (!activeCollectionId) return;
    
    handleFileImport(e, (imp) => {
        let newCards = [];

        if (imp.cards && Array.isArray(imp.cards)) {
            newCards = imp.cards;
        } else if (Array.isArray(imp)) {
            newCards = imp;
        }

        if (newCards.length === 0) {
            alert('Nenhum card válido encontrado neste arquivo.');
            return;
        }

        const colIndex = collections.findIndex(c => c.id === activeCollectionId);
        if(colIndex === -1) return;

        let addedCount = 0;
        newCards.forEach(card => {
            if (card.front && card.back) {
                collections[colIndex].cards.push({
                    id: generateId(),
                    front: card.front,
                    back: card.back
                });
                addedCount++;
            }
        });

        saveData();
        renderCardsList();
        alert(`${addedCount} novos cards foram fundidos na sua coleção com sucesso!`);
    });
});

// ============================================================================
// --- BOOT (MÁQUINA LIGADA) ---
// ============================================================================
renderDashboard();
showView('dashboard');