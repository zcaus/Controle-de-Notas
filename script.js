// COLOQUE A URL DO SEU WEB APP DO APPS SCRIPT AQUI!
// Será algo como: https://script.google.com/macros/s/SEU_ID_DE_DEPLOYMENT/exec
const APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzWY3TcFvWXk4kVsak8S5gJDRdH3xNfjXfTCj_ClYOvQ5ZHbbW3NoTYNxyWOL4aLZt8Jw/exec'; // <--- ATUALIZE ESTA URL!

let currentProfile = 'admin';
let data = [];
console.log('1. Script carregado. Variável data inicial:', data);
let filteredData = [];
let currentEditItem = null;
let refreshIntervalId; // Variável para armazenar o ID do intervalo

// Função para mostrar o spinner
function showLoading() {
    document.getElementById('loading-overlay').classList.add('visible');
}

// Função para esconder o spinner
function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('visible');
}

document.addEventListener('DOMContentLoaded', function() {
    setupFilters();
    loadDataFromGoogleSheet(); // Já mostra o loading aqui
    document.getElementById('btn-admin').classList.add('active');

    // Inicia a atualização automática a cada 30 segundos
    startAutoRefresh(30000); // 30000 milissegundos = 30 segundos

    // Adicionar listeners para o card de NFs Únicas (para o tooltip)
    const nfUniqueCard = document.getElementById('nf-unique-card');
    const nfTooltip = document.getElementById('nf-tooltip');

    if (nfUniqueCard && nfTooltip) {
        nfUniqueCard.addEventListener('mouseenter', () => {
            console.log('Tooltip: Mouse Enter no card de NFs Únicas.');
            const uniqueNFs = new Set();
            data.forEach(item => {
                // Certifica-se de que item.nf não é null/undefined antes de adicionar
                if (item.nf) {
                    uniqueNFs.add(item.nf);
                }
            });
            let nfList = Array.from(uniqueNFs).sort((a, b) => {
                const numA = Number(a);
                const numB = Number(b);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                return String(a).localeCompare(String(b));
            }).join('<br>');

            if (nfList === '') {
                nfList = 'Nenhuma NF encontrada.';
            }
            nfTooltip.innerHTML = `<strong>NFs Únicas:</strong><br>${nfList}`;
            nfTooltip.style.visibility = 'visible';
            nfTooltip.style.opacity = '1';
            console.log('Tooltip: NFs coletadas:', Array.from(uniqueNFs));
            console.log('Tooltip: Conteúdo do Tooltip:', nfTooltip.innerHTML);
        });

        nfUniqueCard.addEventListener('mouseleave', () => {
            console.log('Tooltip: Mouse Leave do card de NFs Únicas.');
            nfTooltip.style.visibility = 'hidden';
            nfTooltip.style.opacity = '0';
        });
    } else {
        console.error('Tooltip: Elementos nfUniqueCard ou nfTooltip não encontrados no DOM.');
    }
});

// Função para iniciar a atualização automática
function startAutoRefresh(intervalTime) {
    // Limpa qualquer intervalo existente para evitar múltiplos intervalos
    if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
    }
    refreshIntervalId = setInterval(() => {
        console.log('Auto-refresh: Puxando dados do Google Sheet...');
        loadDataFromGoogleSheet();
    }, intervalTime);
    console.log(`Auto-refresh iniciado a cada ${intervalTime / 1000} segundos.`);
}

function changeProfile(profile) {
    console.log('changeProfile: Alterando para o perfil:', profile);
    currentProfile = profile;

    document.querySelectorAll('.profile-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-${profile}`).classList.add('active');

    const uploadSection = document.getElementById('upload-section');
    uploadSection.style.display = 'none';

    const selectAllActions = document.getElementById('select-all-actions');
    const checkboxHeader = document.getElementById('checkbox-header');
    const filterExpedicaoView = document.getElementById('filter-expedicao-view');

    if (profile === 'expedicao') {
        selectAllActions.classList.remove('hidden');
        checkboxHeader.classList.remove('hidden');
        filterExpedicaoView.classList.remove('hidden');
        document.getElementById('filter-status').value = '';
    } else {
        selectAllActions.classList.add('hidden');
        checkboxHeader.classList.add('hidden');
        document.getElementById('select-all-expedicao').checked = false;
        filterExpedicaoView.classList.add('hidden');
        filterExpedicaoView.value = 'todos';
    }

    updateDisplay();
}

async function loadDataFromGoogleSheet() {
    console.log('2. loadDataFromGoogleSheet() foi chamada. Iniciando requisição GET...');
    showLoading(); // Mostra o spinner antes de carregar
    try {
        const response = await fetch(APPS_SCRIPT_WEB_APP_URL, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro na rede ou no servidor Apps Script: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(`Erro do Apps Script: ${result.error} - ${result.details || ''}`);
        }

        // Mapeia o resultado para adicionar a propriedade 'selected' se não existir
        data = result.map(item => ({
            ...item,
            selected: item.selected || false // Garante que 'selected' exista e seja false por padrão
        }));

        console.log('3. loadDataFromGoogleSheet: Dados recarregados na variável "data". Total de itens:', data.length);

        data.forEach((item, i) => {
            console.log(`Item ${i}: NF=${item.nf}, Qtd=${item.qtdOriginal}, Sep=${item.separado}, currentStage=${item.currentStage}, statusExpedicao=${item.statusExpedicao}, statusFinal=${item.status}`);
        });

        updateDisplay();

    } catch (error) {
        showAlert(`Erro ao carregar dados: ${error.message}`, 'danger');
        console.error('Erro ao carregar dados do Google Sheet:', error);
    } finally {
        hideLoading(); // Esconde o spinner após carregar ou em caso de erro
    }
}

async function updateItemInGoogleSheet(itemOrItemsToUpdate) {
    console.log('4. updateItemInGoogleSheet() foi chamada para salvar. Dados a enviar:', itemOrItemsToUpdate);
    showLoading(); // Mostra o spinner antes de salvar
    try {
        const response = await fetch(APPS_SCRIPT_WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemOrItemsToUpdate)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro na rede ou no servidor Apps Script ao salvar: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(`Erro do Apps Script ao salvar: ${result.error} - ${result.details || ''}`);
        }

        showAlert(result.message || 'Dados salvos com sucesso!', 'success'); // Mantém o alerta para o resultado da operação
        console.log('5. updateItemInGoogleSheet: Salvamento bem-sucedido. Recarregando dados...');
        await loadDataFromGoogleSheet(); // loadDataFromGoogleSheet já lida com o loading
                                        // Não precisa de hideLoading() aqui, pois loadDataFromGoogleSheet fará isso

    } catch (error) {
        showAlert(`Erro ao salvar dados: ${error.message}`, 'danger');
        console.error('Erro ao salvar dados no Google Sheet:', error);
    } finally {
        // hideLoading(); // Não é necessário aqui, pois loadDataFromGoogleSheet já irá escondê-lo.
                        // Se loadDataFromGoogleSheet não fosse chamada, seria necessário.
    }
}

function getStatus(qtdOriginal, separado, currentStage, statusExpedicao) {
    if (currentStage === 'concluido' && statusExpedicao === 'confirmado') return 'concluido';
    if (currentStage === 'expedicao' && statusExpedicao === 'aguardandoConfirmacao') return 'aguardandoConfirmacao';
    if (separado > 0 && separado < qtdOriginal) return 'parcial';
    if (separado === 0) return 'embalagem';
    if (separado === qtdOriginal && currentStage === 'expedicao') return 'expedicao';
    return 'embalagem';
}

function updateDisplay() {
    console.log('6. updateDisplay() foi chamada. Aplicando filtros e renderizando tabela...');
    filterData();
    renderTable();
    updateStats();
    updateNotificationBadges();
    console.log('6.1. Display atualizado. Itens filtrados para exibição:', filteredData.length);
}

function filterData() {
    console.log('7. filterData() - Perfil atual:', currentProfile);
    let filtered = [...data];

    if (currentProfile === 'embalagem') {
        filtered = filtered.filter(item =>
            (item.currentStage === 'embalagem')
        );
    } else if (currentProfile === 'expedicao') {
        const expedicaoViewFilter = document.getElementById('filter-expedicao-view').value;

        filtered = filtered.filter(item =>
            (item.currentStage === 'expedicao' && item.statusExpedicao === 'aguardandoConfirmacao') ||
            (item.currentStage === 'embalagem' && item.statusExpedicao === 'parcialmenteSeparado') ||
            (item.currentStage === 'concluido' && item.statusExpedicao === 'confirmado')
        );

        if (expedicaoViewFilter === 'pendentes') {
            filtered = filtered.filter(item =>
                item.currentStage !== 'concluido' || item.statusExpedicao !== 'confirmado'
            );
        } else if (expedicaoViewFilter === 'concluidos') {
            filtered = filtered.filter(item =>
                item.currentStage === 'concluido' && item.statusExpedicao === 'confirmado'
            );
        }

    } else if (currentProfile === 'admin') {
        // Admin vê todos os itens
    }

    const nfFilter = document.getElementById('filter-nf').value.toLowerCase();
    const pedidoFilter = document.getElementById('filter-pedido').value.toLowerCase();
    const produtoFilter = document.getElementById('filter-produto').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;

    if (nfFilter) {
        filtered = filtered.filter(item =>
            String(item.nf).toLowerCase().includes(nfFilter)
        );
    }

    if (pedidoFilter) {
        filtered = filtered.filter(item =>
            String(item.pedido).toLowerCase().includes(pedidoFilter)
        );
    }

    if (produtoFilter) {
        filtered = filtered.filter(item =>
            String(item.produto).toLowerCase().includes(produtoFilter)
        );
    }

    if (statusFilter) {
        filtered = filtered.filter(item => {
            return item.status === statusFilter;
        });
    }

    filteredData = filtered;
    console.log('7.1. filterData() - Itens após filtragem:', filteredData.length);
    updateSelectAllCheckbox();
}

function updateStats() {
    const totalSystemItems = data.length;
    const totalTableItems = filteredData.length;

    const uniqueNFs = new Set();
    data.forEach(item => {
        uniqueNFs.add(item.nf);
    });
    const totalUniqueNFs = uniqueNFs.size;

    const embalagemItems = data.filter(item => item.currentStage === 'embalagem').length;
    const expedicaoItems = data.filter(item => item.currentStage === 'expedicao' && item.statusExpedicao === 'aguardandoConfirmacao').length;
    const concluidoItems = data.filter(item => item.currentStage === 'concluido' && item.statusExpedicao === 'confirmado').length;

    document.getElementById('total-system-items').textContent = totalSystemItems;
    document.getElementById('total-table-items').textContent = totalTableItems;
    document.getElementById('total-unique-nfs').textContent = totalUniqueNFs;
    document.getElementById('embalagem-items').textContent = embalagemItems;
    document.getElementById('expedicao-items').textContent = expedicaoItems;
    document.getElementById('concluido-items').textContent = concluidoItems;
    console.log('8. updateStats: Total Sistema:', totalSystemItems, 'Itens Tabela:', totalTableItems, 'NFs Únicas:', totalUniqueNFs, 'Embalagem:', embalagemItems, 'Expedição:', expedicaoItems, 'Concluídos:', concluidoItems);
}

function updateNotificationBadges() {
    const embalagemCount = data.filter(item => item.currentStage === 'embalagem').length;
    const expedicaoCount = data.filter(item => item.currentStage === 'expedicao' && item.statusExpedicao === 'aguardandoConfirmacao').length;

    const btnEmbalagem = document.getElementById('btn-embalagem');
    const btnExpedicao = document.getElementById('btn-expedicao');

    updateBadge(btnEmbalagem, embalagemCount);
    updateBadge(btnExpedicao, expedicaoCount);
    console.log('9. updateNotificationBadges: Embalagem:', embalagemCount, 'Expedição:', expedicaoCount);
}

function updateBadge(buttonElement, count) {
    let badge = buttonElement.querySelector('.notification-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'notification-badge';
            buttonElement.appendChild(badge);
        }
        badge.textContent = count;
    } else {
        if (badge) {
            badge.remove();
        }
    }
}

async function confirmDelivery(itemId) {
    console.log('confirmDelivery() chamado para item ID:', itemId);
    const itemToConfirm = data.find(item => item.id === itemId);
    if (itemToConfirm) {
        const updatedItemData = {
            id: itemToConfirm.id,
            _rowIndex: itemToConfirm._rowIndex,
            separado: itemToConfirm.qtdOriginal,
            currentStage: 'concluido',
            statusExpedicao: 'confirmado',
        };
        await updateItemInGoogleSheet(updatedItemData);
        console.log('confirmDelivery: Requisição de atualização enviada para:', updatedItemData);
    } else {
        console.error('Item não encontrado para confirmar entrega:', itemId);
    }
}

function selectItem(itemId, isChecked) {
    const item = data.find(item => item.id === itemId);
    if (item) {
        item.selected = isChecked;
        console.log(`Item ID ${itemId} selecionado: ${isChecked}`);
        updateSelectAllCheckbox();
    }
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('select-all-expedicao');
    const isChecked = selectAllCheckbox.checked;
    console.log('toggleSelectAll: Checagem geral:', isChecked);

    filteredData.forEach(item => {
        if (item.currentStage === 'expedicao' && item.statusExpedicao === 'aguardandoConfirmacao' && item.separado === item.qtdOriginal) {
            item.selected = isChecked;
        }
    });
    renderTable();
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('select-all-expedicao');
    const confirmableItems = filteredData.filter(item =>
        item.currentStage === 'expedicao' &&
        item.statusExpedicao === 'aguardandoConfirmacao' &&
        item.separado === item.qtdOriginal
    );

    const allSelected = confirmableItems.length > 0 && confirmableItems.every(item => item.selected);
    const anySelected = confirmableItems.some(item => item.selected);

    if (confirmableItems.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.disabled = true;
    } else {
        selectAllCheckbox.disabled = false;
        if (allSelected) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (anySelected) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }
    console.log('updateSelectAllCheckbox: Todos selecionados:', allSelected, 'Alguns selecionados:', anySelected, 'Total confirmáveis:', confirmableItems.length);
}

async function confirmSelectedItems() {
    const selectedItems = data.filter(item => item.selected &&
        item.currentStage === 'expedicao' && item.statusExpedicao === 'aguardandoConfirmacao');

    if (selectedItems.length === 0) {
        showAlert('Nenhum item selecionado para confirmar ou itens selecionados não estão prontos para confirmação.', 'info');
        return;
    }

    if (confirm(`Confirmar o recebimento de ${selectedItems.length} item(ns) e movê-los para Concluído?`)) {
        const itemsToUpdate = selectedItems.map(item => ({
            id: item.id,
            _rowIndex: item._rowIndex,
            separado: item.qtdOriginal,
            currentStage: 'concluido',
            statusExpedicao: 'confirmado',
        }));

        await updateItemInGoogleSheet(itemsToUpdate);
        document.getElementById('select-all-expedicao').checked = false;
    }
}

function renderTable() {
    console.log('10. renderTable() - Iniciando renderização.');
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    const checkboxHeader = document.getElementById('checkbox-header');
    if (currentProfile === 'expedicao') {
        checkboxHeader.classList.remove('hidden');
    } else {
        checkboxHeader.classList.add('hidden');
    }

    if (filteredData.length === 0) {
        const noDataRow = document.createElement('tr');
        noDataRow.innerHTML = `<td colspan="10" style="text-align: center; padding: 20px;">Nenhum item encontrado para este perfil ou filtros.</td>`;
        tbody.appendChild(noDataRow);
        console.log('10.1. renderTable: Nenhum dado filtrado para exibição.');
        return;
    }

    filteredData.forEach((item) => {
        let displayStatusClass = item.status;
        let displayStatusLabel = getStatusLabel(item.status);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="${currentProfile === 'expedicao' ? '' : 'hidden'}">
                <input type="checkbox" class="expedicao-checkbox"
                       data-id="${item.id}"
                       ${item.selected ? 'checked' : ''}
                       ${(item.currentStage !== 'expedicao' || item.statusExpedicao !== 'aguardandoConfirmacao' || item.separado !== item.qtdOriginal) ? 'disabled' : ''}
                       onchange="selectItem(${item.id}, this.checked)">
            </td>
            <td>${item.nf}</td>
            <td>${item.pedido}</td>
            <td>${formatDate(item.dataEmissao)}</td>
            <td>${item.modelo}</td>
            <td>${item.produto}</td>
            <td>${item.qtdOriginal}</td>
            <td>${item.separado}</td>
            <td><span class="status-badge status-${displayStatusClass}">${displayStatusLabel}</span></td>
            <td>${getActionButtons(item)}</td>
        `;
        tbody.appendChild(row);
    });
    console.log('10.2. renderTable: Tabela renderizada com', filteredData.length, 'itens.');
}

function getStatusLabel(status) {
    const labels = {
        'embalagem': 'Embalagem',
        'expedicao': 'Expedição',
        'parcial': 'Parcial',
        'concluido': 'Concluído',
        'aguardandoConfirmacao': 'Aguardando Confirmação'
    };
    return labels[status] || status;
}

function getActionButtons(item) {
    let buttons = '';

    if (currentProfile === 'admin') {
        buttons += `<button class="action-btn" onclick="editItem(${item.id})">Editar</button>`;
    } else if (currentProfile === 'embalagem') {
        if (item.currentStage === 'embalagem') {
            buttons += `<button class="action-btn success" onclick="separarItem(${item.id})">Separar</button>`;
        }
    } else if (currentProfile === 'expedicao') {
        if (item.currentStage === 'expedicao' && item.statusExpedicao === 'aguardandoConfirmacao') {
            buttons += `<button class="action-btn success" onclick="confirmarRecebimento(${item.id})">Confirmar</button>`;
        }
    }

    return buttons;
}

function formatDate(dateValue) {
    if (!dateValue) return '';

    if (typeof dateValue === 'number') {
        const date = new Date((dateValue - 25569) * 86400 * 1000);
        return date.toLocaleDateString('pt-BR');
    }

    if (typeof dateValue === 'string') {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('pt-BR');
        }
    }
    return String(dateValue);
}

function editItem(id) {
    const item = data.find(item => item.id === id);
    if (!item) {
        console.error('Item não encontrado para edição:', id);
        return;
    }
    currentEditItem = item;
    document.getElementById('edit-separado').value = item.separado;
    document.getElementById('edit-original').value = item.qtdOriginal;
    document.getElementById('edit-modal').style.display = 'block';
    console.log('editItem: Abrindo modal para item ID:', id, '(_rowIndex:', item._rowIndex + ")");
}

document.getElementById('edit-form').addEventListener('submit', async function(event) {
    event.preventDefault();
    console.log('edit-form: Submit acionado.');

    if (!currentEditItem) {
        showAlert('Erro: Nenhum item selecionado para edição.', 'danger');
        return;
    }

    const newSeparado = parseInt(document.getElementById('edit-separado').value);
    const qtdOriginal = currentEditItem.qtdOriginal;

    if (isNaN(newSeparado) || newSeparado < 0 || newSeparado > qtdOriginal) {
        showAlert(`Quantidade inválida. Deve ser entre 0 e ${qtdOriginal}.`, 'danger');
        return;
    }

    const updatedItem = { ...currentEditItem };
    updatedItem.separado = newSeparado;

    if (updatedItem.separado === qtdOriginal && qtdOriginal > 0) {
        updatedItem.currentStage = 'expedicao';
        updatedItem.statusExpedicao = 'aguardandoConfirmacao';
        showAlert('Item totalmente separado e movido para Expedição (Aguardando Confirmação)!', 'success');
    } else if (updatedItem.separado > 0 && updatedItem.separado < qtdOriginal) {
        updatedItem.currentStage = 'embalagem';
        updatedItem.statusExpedicao = 'parcialmenteSeparado';
        showAlert('Item separado parcialmente!', 'info');
    } else {
        updatedItem.currentStage = 'embalagem';
        updatedItem.statusExpedicao = 'pendente';
        showAlert('Item retornado para Embalagem (pendente)!', 'info');
    }
    updatedItem.status = getStatus(updatedItem.qtdOriginal, updatedItem.separado, updatedItem.currentStage, updatedItem.statusExpedicao);

    await updateItemInGoogleSheet(updatedItem);
    closeModal();
    console.log('edit-form: Edição enviada para o servidor. Item atualizado:', updatedItem);
});

function closeModal() {
    document.getElementById('edit-modal').style.display = 'none';
    currentEditItem = null;
    console.log('closeModal: Modal fechado.');
}

async function separarItem(id) {
    console.log('separarItem() chamado para item ID:', id);
    const item = data.find(item => item.id === id);
    if (!item) {
        console.error('Item não encontrado para separar:', id);
        return;
    }

    if (item.separado === item.qtdOriginal) {
        showAlert('Este item já está totalmente separado.', 'danger');
        return;
    }

    const remaining = item.qtdOriginal - item.separado;
    const qtdSeparadaStr = prompt(`Quantidade a separar (máximo ${remaining} restante):`, remaining);
    if (qtdSeparadaStr === null) {
        console.log('separarItem: Operação cancelada pelo usuário.');
        return;
    }

    const newQtd = parseInt(qtdSeparadaStr);
    if (isNaN(newQtd) || newQtd <= 0 || (item.separado + newQtd) > item.qtdOriginal) {
        showAlert(`Quantidade inválida! Deve ser entre 1 e ${remaining}.`, 'danger');
        console.warn('separarItem: Quantidade inválida fornecida:', newQtd);
        return;
    }

    const updatedSeparado = item.separado + newQtd;

    const updatedItem = { ...item };
    updatedItem.separado = updatedSeparado;

    if (updatedItem.separado === updatedItem.qtdOriginal) {
        updatedItem.currentStage = 'expedicao';
        updatedItem.statusExpedicao = 'aguardandoConfirmacao';
        showAlert('Item totalmente separado e movido para Expedição (Aguardando Confirmação)!', 'success');
    } else {
        updatedItem.currentStage = 'embalagem';
        updatedItem.statusExpedicao = 'parcialmenteSeparado';
        showAlert('Item separado parcialmente!', 'info');
    }
    updatedItem.status = getStatus(updatedItem.qtdOriginal, updatedItem.separado, updatedItem.currentStage, updatedItem.statusExpedicao);

    await updateItemInGoogleSheet(updatedItem);
    console.log('separarItem: Requisição de atualização enviada para:', updatedItem);
}

async function confirmarRecebimento(id) {
    console.log('confirmarRecebimento() chamado para item ID:', id);
    const item = data.find(item => item.id === id);
    if (!item) {
        console.error('Item não encontrado para confirmar recebimento:', id);
        return;
    }

    if (item.currentStage !== 'expedicao' || item.statusExpedicao !== 'aguardandoConfirmacao') {
        showAlert('Este item não está aguardando confirmação na Expedição.', 'danger');
        console.warn('confirmarRecebimento: Item não elegível para confirmação:', item);
        return;
    }

    if (confirm('Confirmar recebimento e mover este item para Concluído?')) {
        const updatedItem = { ...item };
        updatedItem.currentStage = 'concluido';
        updatedItem.statusExpedicao = 'confirmado';
        updatedItem.status = getStatus(updatedItem.qtdOriginal, updatedItem.separado, updatedItem.currentStage, updatedItem.statusExpedicao);

        await updateItemInGoogleSheet(updatedItem);
        console.log('confirmarRecebimento: Requisição de atualização enviada para:', updatedItem);
    } else {
        console.log('confirmarRecebimento: Operação cancelada pelo usuário.');
    }
}

function setupFilters() {
    document.getElementById('filter-nf').addEventListener('input', updateDisplay);
    document.getElementById('filter-pedido').addEventListener('input', updateDisplay);
    document.getElementById('filter-produto').addEventListener('input', updateDisplay);
    document.getElementById('filter-status').addEventListener('change', updateDisplay);
    document.getElementById('filter-expedicao-view').addEventListener('change', updateDisplay);
    console.log('Filtros configurados.');
}

let currentAlertTimeout;
function showAlert(message, type) {
    const alertContainer = document.getElementById('alert-container');
    alertContainer.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    alertContainer.style.display = 'block';

    if (currentAlertTimeout) {
        clearTimeout(currentAlertTimeout);
    }
    currentAlertTimeout = setTimeout(() => {
        alertContainer.style.display = 'none';
        alertContainer.innerHTML = '';
    }, 5000);
    console.log(`Alerta (${type}): ${message}`);
}