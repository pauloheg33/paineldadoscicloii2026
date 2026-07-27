// ===== CONFIGURAÇÃO GLOBAL =====
const FAIXA_COLORS = {
    'Crítico': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    'Atenção': { bg: '#ffedd5', border: '#f97316', text: '#9a3412' },
    'Intermediário': { bg: '#fef9c3', border: '#facc15', text: '#854d0e' },
    'Regular': { bg: '#fef9c3', border: '#facc15', text: '#854d0e' },
    'Adequado': { bg: '#dcfce7', border: '#22c55e', text: '#166534' }
};

let charts = {};
let habData = [];
let desData = [];
let analiseData = null;
let turmasData = [];

Chart.register(ChartDataLabels);
Chart.defaults.plugins.datalabels = { display: false };

// ===== HELPERS DE DADOS =====
function mean(arr) {
    const v = arr.filter(x => x != null && !isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function rd(val, d) {
    if (val == null || isNaN(val)) return 0;
    const f = Math.pow(10, d);
    return Math.round(val * f) / f;
}

function classificarFaixa(pct) {
    if (pct == null || isNaN(pct)) return 'Sem dados';
    if (pct <= 40) return 'Crítico';
    if (pct <= 60) return 'Atenção';
    if (pct <= 80) return 'Intermediário';
    return 'Adequado';
}

function classificarStatusTurma(pct) {
    if (pct == null || isNaN(pct)) return 'Sem dados';
    if (pct <= 40) return 'Crítico';
    if (pct <= 60) return 'Atenção';
    if (pct <= 80) return 'Regular';
    return 'Adequado';
}

function anoSortKey(valor) {
    const m = String(valor || '').match(/(\d+)/);
    return m ? Number(m[1]) : 999;
}

function groupBy(arr, keyFn) {
    const g = {};
    arr.forEach(item => {
        const k = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
        if (!g[k]) g[k] = [];
        g[k].push(item);
    });
    return g;
}

function filtrarHab(escola, ano, componente) {
    let df = habData;
    if (escola && escola !== 'Todas') df = df.filter(r => r.escola === escola);
    if (ano && ano !== 'Todos') df = df.filter(r => r.ano_escolar === ano);
    if (componente && componente !== 'Todos') df = df.filter(r => r.componente === componente);
    return df;
}

// ===== FUNÇÕES DE PROCESSAMENTO (client-side) =====
function getFilterOptions() {
    const escolas = [...new Set(habData.map(r => r.escola).filter(Boolean))].sort();
    const anos = [...new Set(habData.map(r => r.ano_escolar).filter(Boolean))].sort((a, b) => anoSortKey(a) - anoSortKey(b));
    const componentesDisponiveis = new Set(habData.map(r => r.componente).filter(Boolean));
    const componentes = ['Língua Portuguesa', 'Matemática'].filter(c => componentesDisponiveis.has(c));
    return { escolas: ['Todas', ...escolas], anos: ['Todos', ...anos], componentes: ['Todos', ...componentes] };
}

function getIndicadores(escola, ano, componente) {
    const df = filtrarHab(escola, ano, componente);
    if (df.length === 0) {
        return { media_geral: 0, total_habilidades: 0, habilidades_criticas: 0, habilidades_adequadas: 0,
                 melhor_desempenho: 0, pior_desempenho: 0, total_escolas: 0, media_lp: 0, media_mt: 0 };
    }
    const habGroups = groupBy(df, 'habilidade_codigo');
    const habMeans = {};
    for (const [k, rows] of Object.entries(habGroups)) {
        habMeans[k] = mean(rows.map(r => r.acerto_pct));
    }
    const byEH = groupBy(df, r => r.escola + '\x00' + r.habilidade_codigo);
    const criticosSet = new Set(), adequadosSet = new Set();
    for (const [key, rows] of Object.entries(byEH)) {
        const code = key.split('\x00')[1];
        const m = mean(rows.map(r => r.acerto_pct));
        if (m <= 40) criticosSet.add(code);
        if (m > 80) adequadosSet.add(code);
    }
    let dfAll = habData;
    if (escola && escola !== 'Todas') dfAll = dfAll.filter(r => r.escola === escola);
    if (ano && ano !== 'Todos') dfAll = dfAll.filter(r => r.ano_escolar === ano);
    const lpVals = dfAll.filter(r => r.componente === 'Língua Portuguesa').map(r => r.acerto_pct);
    const mtVals = dfAll.filter(r => r.componente === 'Matemática').map(r => r.acerto_pct);
    const vals = Object.values(habMeans);
    return {
        media_geral: rd(mean(df.map(r => r.acerto_pct)), 1),
        total_habilidades: Object.keys(habMeans).length,
        habilidades_criticas: criticosSet.size,
        habilidades_adequadas: adequadosSet.size,
        melhor_desempenho: rd(Math.max(...vals), 1),
        pior_desempenho: rd(Math.min(...vals), 1),
        total_escolas: new Set(df.map(r => r.escola)).size,
        media_lp: rd(mean(lpVals), 1),
        media_mt: rd(mean(mtVals), 1)
    };
}

function getHabilidadesCards(escola, ano, componente) {
    const df = filtrarHab(escola, ano, componente);
    if (df.length === 0) return [];
    const groups = groupBy(df, 'habilidade_codigo');
    const result = [];
    for (const [codigo, rows] of Object.entries(groups)) {
        const m = rd(mean(rows.map(r => r.acerto_pct)), 1);
        result.push({
            habilidade_codigo: codigo,
            habilidade_descricao: rows[0].habilidade_descricao,
            habilidade_pos: rows[0].habilidade_pos,
            acerto_pct: m,
            nivel_dificuldade: rows[0].nivel_dificuldade,
            faixa: classificarFaixa(m)
        });
    }
    result.sort((a, b) => (a.habilidade_pos || '').localeCompare(b.habilidade_pos || ''));
    return result;
}

function getGraficosHabilidades(escola, ano, componente) {
    const df = filtrarHab(escola, ano, componente);
    if (df.length === 0) return { labels: [], values: [], faixas: [] };
    const groups = groupBy(df, 'habilidade_pos');
    const entries = [];
    for (const [pos, rows] of Object.entries(groups)) {
        entries.push({ pos, val: rd(mean(rows.map(r => r.acerto_pct)), 1) });
    }
    entries.sort((a, b) => a.pos.localeCompare(b.pos));
    return { labels: entries.map(e => e.pos), values: entries.map(e => e.val), faixas: entries.map(e => classificarFaixa(e.val)) };
}

function getGraficosEscolas() {
    const des = desData.filter(r => r.escola !== 'Média Geral da Rede');
    const groups = groupBy(des, 'escola');
    const result = [];
    for (const [escola, rows] of Object.entries(groups)) {
        result.push({ escola, lp: rd(mean(rows.map(r => r.lp_pct)), 1), mt: rd(mean(rows.map(r => r.mt_pct)), 1), media: rd(mean(rows.map(r => r.media_geral)), 1) });
    }
    result.sort((a, b) => b.media - a.media);
    return { escolas: result.map(r => r.escola), lp: result.map(r => r.lp), mt: result.map(r => r.mt), media: result.map(r => r.media) };
}

function getDistribuicaoFaixas(escola, ano, componente) {
    const order = ['Crítico', 'Atenção', 'Intermediário', 'Adequado'];
    const df = filtrarHab(escola, ano, componente);
    if (df.length === 0) return { labels: order, values: [0, 0, 0, 0] };
    const groups = groupBy(df, 'habilidade_pos');
    const counts = { 'Crítico': 0, 'Atenção': 0, 'Intermediário': 0, 'Adequado': 0 };
    for (const rows of Object.values(groups)) {
        const faixa = classificarFaixa(mean(rows.map(r => r.acerto_pct)));
        if (counts[faixa] !== undefined) counts[faixa]++;
    }
    return { labels: order, values: order.map(f => counts[f]) };
}

function getRanking(escola, ano, componente, top, order) {
    const df = filtrarHab(escola, ano, componente);
    if (df.length === 0) return { labels: [], values: [], descricoes: [] };
    const groups = groupBy(df, 'habilidade_pos');
    const entries = [];
    for (const [pos, rows] of Object.entries(groups)) {
        entries.push({ codigo: pos, descricao: rows[0].habilidade_descricao, media: rd(mean(rows.map(r => r.acerto_pct)), 1) });
    }
    entries.sort((a, b) => order === 'asc' ? a.media - b.media : b.media - a.media);
    const s = entries.slice(0, top);
    return { labels: s.map(e => e.codigo), values: s.map(e => e.media), descricoes: s.map(e => e.descricao) };
}

function getTabelaDetalhada(escola, ano, componente) {
    const df = filtrarHab(escola, ano, componente);
    const result = df.map(r => ({
        escola: r.escola, ano_escolar: r.ano_escolar, componente: r.componente,
        habilidade_pos: r.habilidade_pos, habilidade_descritor: r.habilidade_descritor,
        habilidade_descricao: r.habilidade_descricao, acerto_pct: r.acerto_pct, faixa: r.faixa
    }));
    result.sort((a, b) =>
        (a.escola || '').localeCompare(b.escola || '') ||
        (a.ano_escolar || '').localeCompare(b.ano_escolar || '') ||
        (a.componente || '').localeCompare(b.componente || '') ||
        (a.habilidade_pos || '').localeCompare(b.habilidade_pos || '')
    );
    return result;
}

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', async () => {
    setupSidebar();
    setupNavigation();
    await loadData();
    loadFilters();
    setupFilterListeners();
    loadCurrentPage();
});

async function loadData() {
    const [hab, des, analise, turmas] = await Promise.all([
        fetch('data/habilidades.json').then(r => r.json()).catch(() => []),
        fetch('data/desempenho.json').then(r => r.json()).catch(() => []),
        fetch('data/analise.json').then(r => r.json()).catch(() => null),
        fetch('data/turmas.json').then(r => r.json()).catch(() => [])
    ]);
    habData = hab;
    desData = des;
    analiseData = analise;
    turmasData = turmas;
}

// ===== SIDEBAR =====
function setupSidebar() {
    const btn = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    btn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
}

// ===== NAVEGAÇÃO POR ABAS =====
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const page = item.dataset.page;
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById('page-' + page).classList.add('active');
            loadCurrentPage();
        });
    });
}

function getCurrentPage() {
    const active = document.querySelector('.nav-item.active');
    return active ? active.dataset.page : 'visao-geral';
}

// ===== FILTROS =====
function loadFilters() {
    const data = getFilterOptions();
    populateSelect('filter-escola', data.escolas, 'EEF FRANCISCO MOURÃO LIMA');
    populateSelect('filter-ano', data.anos, '2º Ano');
    populateSelect('filter-componente', data.componentes, 'Língua Portuguesa');
}

function populateSelect(id, options, defaultValue) {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (opt === defaultValue) o.selected = true;
        sel.appendChild(o);
    });
}

function getFilters() {
    return {
        escola: document.getElementById('filter-escola').value,
        ano: document.getElementById('filter-ano').value,
        componente: document.getElementById('filter-componente').value
    };
}

function setupFilterListeners() {
    ['filter-escola', 'filter-ano', 'filter-componente'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => loadCurrentPage());
    });
}

// ===== LOAD CURRENT PAGE =====
function setFiltersDisabled(disabled) {
    ['filter-escola', 'filter-ano', 'filter-componente'].forEach(id => {
        const el = document.getElementById(id);
        el.disabled = disabled;
        el.style.opacity = disabled ? '0.4' : '';
        el.style.cursor = disabled ? 'not-allowed' : '';
        el.closest('.filter-group').style.pointerEvents = disabled ? 'none' : '';
    });
}

function loadCurrentPage() {
    const page = getCurrentPage();
    setFiltersDisabled(page === 'escolas');
    const loaders = {
        'visao-geral': loadVisaoGeral,
        'habilidades': loadHabilidades,
        'escolas': loadEscolas,
        'turmas': loadTurmas,
        'detalhamento': loadDetalhamento
    };
    if (loaders[page]) loaders[page]();
}

function getTurmasAgrupadas(escola, ano, componente) {
    let df = turmasData;
    if (escola && escola !== 'Todas') df = df.filter(r => r.escola === escola);
    if (ano && ano !== 'Todos') df = df.filter(r => r.ano_escolar === ano);
    if (componente && componente !== 'Todos') df = df.filter(r => r.componente === componente);
    if (!df.length) return [];

    const groups = groupBy(df, r => `${r.escola}\x00${r.turma}\x00${r.ano_escolar}`);
    const rows = [];
    for (const [key, records] of Object.entries(groups)) {
        const [escolaNome, turmaNome, anoNome] = key.split('\x00');
        const media = rd(mean(records.map(r => r.media_pct)), 1);
        rows.push({
            escola: escolaNome,
            turma: turmaNome,
            ano_escolar: anoNome,
            componentes: [...new Set(records.map(r => r.componente).filter(Boolean))].sort(),
            media_pct: media,
            alunos_avaliados: Math.max(...records.map(r => Number(r.alunos_avaliados) || 0), 0),
            hab_criticas: records.reduce((acc, r) => acc + (Number(r.hab_criticas) || 0), 0),
            classificacao: records[0].classificacao || classificarStatusTurma(media),
            faixa: classificarFaixa(media)
        });
    }
    rows.sort((a, b) => b.media_pct - a.media_pct);
    return rows;
}

function loadTurmas() {
    destroyChart('chart-turmas-ranking');
    destroyChart('chart-turmas-classificacao');

    const { escola, ano, componente } = getFilters();
    const rows = getTurmasAgrupadas(escola, ano, componente);
    const strip = document.getElementById('tur-kpi-strip');
    const tbody = document.getElementById('tabela-turmas-body');

    if (!rows.length) {
        strip.innerHTML = '<div class="card"><p style="color:#64748b;">Nenhum dado de turma disponível para os filtros selecionados.</p></div>';
        tbody.innerHTML = '';
        return;
    }

    const melhor = rows[0];
    const pior = rows[rows.length - 1];
    const mediaGeral = rd(mean(rows.map(r => r.media_pct)), 1);
    const totalAlunos = rows.reduce((acc, r) => acc + (r.alunos_avaliados || 0), 0);
    const totalCriticas = rows.reduce((acc, r) => acc + (r.hab_criticas || 0), 0);

    strip.innerHTML = '';
    [
        { label: 'Turmas', value: rows.length, cls: '', sub: 'na seleção' },
        { label: 'Média Geral', value: mediaGeral + '%', cls: 'purple', sub: 'das turmas' },
        { label: 'Melhor Turma', value: melhor.media_pct + '%', cls: 'green', sub: truncate(`${melhor.turma} · ${melhor.escola}`, 28) },
        { label: 'Menor Média', value: pior.media_pct + '%', cls: 'red', sub: truncate(`${pior.turma} · ${pior.escola}`, 28) },
        { label: 'Alunos', value: totalAlunos, cls: 'amber', sub: 'avaliados' },
        { label: 'Hab. Críticas', value: totalCriticas, cls: 'red', sub: 'somadas na seleção' }
    ].forEach(k => {
        const div = document.createElement('div');
        div.className = 'kpi-card ' + k.cls;
        div.innerHTML = `<span class="kpi-label">${sanitize(k.label)}</span><span class="kpi-value">${sanitize(String(k.value))}</span><span class="kpi-sub">${sanitize(k.sub)}</span>`;
        strip.appendChild(div);
    });

    const topRows = rows.slice(0, 12);
    renderHorizontalBar(
        'chart-turmas-ranking',
        topRows.map(r => truncate(`${r.turma} · ${r.escola}`, 26)),
        topRows.map(r => r.media_pct),
        topRows.map(r => `${r.ano_escolar} · ${r.classificacao}`),
        false
    );

    const classCounts = { 'Crítico': 0, 'Atenção': 0, 'Regular': 0, 'Adequado': 0 };
    rows.forEach(r => {
        if (classCounts[r.classificacao] !== undefined) classCounts[r.classificacao]++;
    });
    renderDoughnutChart(
        'chart-turmas-classificacao',
        Object.keys(classCounts),
        Object.values(classCounts)
    );

    tbody.innerHTML = '';
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${sanitize(row.escola)}</td>
            <td>${sanitize(row.turma)}</td>
            <td>${sanitize(row.ano_escolar)}</td>
            <td>${sanitize(row.componentes.join(', '))}</td>
            <td><strong>${row.media_pct}%</strong></td>
            <td>${row.alunos_avaliados}</td>
            <td>${row.hab_criticas}</td>
            <td><span class="badge ${badgeClass(row.classificacao)}">${sanitize(row.classificacao)}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ===== VISÃO GERAL =====
function loadVisaoGeral() {
    const { escola, ano, componente } = getFilters();
    const ind = getIndicadores(escola, ano, componente);
    const hab = getGraficosHabilidades(escola, ano, componente);
    const dist = getDistribuicaoFaixas(escola, ano, componente);
    const rkL = getRanking(escola, ano, componente, 8, 'asc');
    const rkH = getRanking(escola, ano, componente, 8, 'desc');
    renderKPIs(ind);
    renderBarChart('chart-hab-geral', hab.labels, hab.values, hab.faixas, 'Acerto %');
    renderDoughnutChart('chart-distribuicao', dist.labels, dist.values);
    renderHorizontalBar('chart-ranking-baixo', rkL.labels, rkL.values, rkL.descricoes, true);
    renderHorizontalBar('chart-ranking-alto', rkH.labels, rkH.values, rkH.descricoes, false);
}

function renderKPIs(ind) {
    const strip = document.getElementById('kpi-strip');
    strip.innerHTML = '';
    const kpis = [
        { label: 'Média Geral', value: ind.media_geral + '%', cls: '', sub: 'da rede/seleção' },
        { label: 'Língua Portuguesa', value: ind.media_lp + '%', cls: 'purple', sub: 'média LP' },
        { label: 'Matemática', value: ind.media_mt + '%', cls: 'purple', sub: 'média MT' },
        { label: 'Habilidades', value: ind.total_habilidades, cls: '', sub: 'avaliadas' },
        { label: 'Críticas', value: ind.habilidades_criticas, cls: 'red', sub: '≤ 40%' },
        { label: 'Adequadas', value: ind.habilidades_adequadas, cls: 'green', sub: '> 80%' },
        { label: 'Melhor', value: ind.melhor_desempenho + '%', cls: 'green', sub: 'habilidade' },
        { label: 'Pior', value: ind.pior_desempenho + '%', cls: 'red', sub: 'habilidade' },
        { label: 'Escolas', value: ind.total_escolas, cls: 'amber', sub: 'analisadas' },
    ];
    kpis.forEach(k => {
        const div = document.createElement('div');
        div.className = 'kpi-card ' + k.cls;
        div.innerHTML = `<span class="kpi-label">${k.label}</span><span class="kpi-value">${k.value}</span><span class="kpi-sub">${k.sub}</span>`;
        strip.appendChild(div);
    });
}

// ===== HABILIDADES =====
function loadHabilidades() {
    const { escola, ano, componente } = getFilters();
    const data = getHabilidadesCards(escola, ano, componente);
    const grid = document.getElementById('hab-grid');
    grid.innerHTML = '';
    data.forEach(h => {
        const card = document.createElement('div');
        const cls = faixaClass(h.faixa);
        card.className = 'hab-card ' + cls;
        const codigoMatriz = h.habilidade_codigo.replace(/H\s?\d+\s*/, '').replace(/[()]/g, '');
        card.innerHTML = `
            <span class="hab-code">${h.habilidade_pos} - (${codigoMatriz})</span>
            <span class="hab-pct">${h.acerto_pct}%</span>
            <span class="hab-faixa">${h.faixa}</span>
        `;
        card.addEventListener('click', () => showModal(h));
        grid.appendChild(card);
    });
    setupModal();
}

function faixaClass(faixa) {
    const map = { 'Crítico': 'faixa-critico', 'Atenção': 'faixa-atencao', 'Intermediário': 'faixa-intermediario', 'Adequado': 'faixa-adequado' };
    return map[faixa] || '';
}

function showModal(h) {
    const modal = document.getElementById('hab-modal');
    document.getElementById('modal-title').textContent = h.habilidade_pos + ' — ' + h.habilidade_codigo;
    document.getElementById('modal-desc').textContent = h.habilidade_descricao;
    let leitura = '';
    if (h.acerto_pct <= 40) leitura = 'Desempenho CRÍTICO. Esta habilidade exige intervenção pedagógica imediata e replanejamento de atividades.';
    else if (h.acerto_pct <= 60) leitura = 'Desempenho em ATENÇÃO. Necessário reforço direcionado e acompanhamento contínuo.';
    else if (h.acerto_pct <= 80) leitura = 'Desempenho INTERMEDIÁRIO. Há espaço para consolidação com atividades de aprofundamento.';
    else leitura = 'Desempenho ADEQUADO. Manter estratégias atuais e utilizar como referência de boas práticas.';
    document.getElementById('modal-details').innerHTML = `
        <div class="detail-row"><span class="detail-label">Percentual de Acerto</span><span>${h.acerto_pct}%</span></div>
        <div class="detail-row"><span class="detail-label">Faixa de Desempenho</span><span>${h.faixa}</span></div>
        <div class="detail-row"><span class="detail-label">Nível de Dificuldade</span><span>${h.nivel_dificuldade}</span></div>
        <div style="margin-top:14px; padding:12px; border-radius:8px; background:#f8fafc;">
            <strong style="color:#0f2b4c;">Leitura Pedagógica:</strong><br/>
            <span style="color:#475569;">${leitura}</span>
        </div>
    `;
    modal.classList.remove('hidden');
}

function setupModal() {
    const modal = document.getElementById('hab-modal');
    document.getElementById('modal-close').onclick = () => modal.classList.add('hidden');
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}

// ===== ESCOLAS — ANÁLISE COMPLETA =====

function escClassColor(cls) {
    const m = { 'Adequado': '#22c55e', 'Regular': '#facc15', 'Atenção': '#f97316', 'Crítico': '#ef4444' };
    return m[cls] || '#94a3b8';
}

function shortEscola(nome) {
    return nome.replace(/^EE[A-Z]*\s+/i, '').substring(0, 22);
}

function loadEscolas() {
    destroyChart('chart-escolas'); // limpa ref antiga se houver
    ['chart-esc-ranking', 'chart-esc-lp-mt', 'chart-esc-etapas', 'chart-esc-criticas'].forEach(destroyChart);

    if (!analiseData) {
        const strip = document.getElementById('esc-kpi-strip');
        if (strip) strip.innerHTML = '<p style="color:#64748b;padding:8px 0;">Carregando dados de análise…</p>';
        return;
    }

    const { escolas, detalhe, rede } = analiseData;

    renderEscolasKPIs(escolas, rede);
    renderEscolasRanking(escolas, rede);
    renderEscolasLpMt(escolas, rede);
    renderEscolasEtapas(detalhe, rede);
    renderEscolasCriticas(escolas);
    renderEscolasHeatmap(detalhe, escolas);
}

function renderEscolasKPIs(escolas, rede) {
    const strip = document.getElementById('esc-kpi-strip');
    if (!strip) return;
    const sorted = [...escolas].sort((a, b) => b.media - a.media);
    const melhor = sorted[0];
    const pior = sorted[sorted.length - 1];
    const acima = escolas.filter(e => e.media >= rede.media).length;
    const totalCriticas = escolas.reduce((s, e) => s + (e.hab_criticas || 0), 0);
    const gapRede = rd(rede.lp - rede.mt, 1);

    const kpis = [
        { label: 'Média da Rede', value: rede.media + '%', cls: '', sub: 'geral municipal' },
        { label: 'LP Rede', value: rede.lp + '%', cls: 'purple', sub: 'Língua Portuguesa' },
        { label: 'MT Rede', value: rede.mt + '%', cls: 'amber', sub: 'Matemática' },
        { label: 'Melhor Escola', value: melhor.media + '%', cls: 'green', sub: shortEscola(melhor.escola) },
        { label: 'Menor Média', value: pior.media + '%', cls: 'red', sub: shortEscola(pior.escola) },
        { label: 'Acima da Rede', value: acima, cls: 'green', sub: 'de ' + escolas.length + ' escolas' },
    ];

    strip.innerHTML = '';
    kpis.forEach(k => {
        const div = document.createElement('div');
        div.className = 'kpi-card ' + k.cls;
        div.innerHTML = `<span class="kpi-label">${sanitize(k.label)}</span><span class="kpi-value">${sanitize(String(k.value))}</span><span class="kpi-sub">${sanitize(k.sub)}</span>`;
        strip.appendChild(div);
    });
}

function renderEscolasRanking(escolas, rede) {
    const el = document.getElementById('chart-esc-ranking');
    if (!el) return;
    const sorted = [...escolas].sort((a, b) => a.media - b.media);
    const labels = sorted.map(e => truncate(e.escola, 24));
    const values = sorted.map(e => e.media);
    const colors = sorted.map(e => escClassColor(e.classificacao));

    charts['chart-esc-ranking'] = new Chart(el.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Média Geral (%)',
                    data: values,
                    backgroundColor: colors.map(c => c + 'bb'),
                    borderColor: colors,
                    borderWidth: 2,
                    borderRadius: 4
                },
                {
                    label: 'Média da Rede (' + rede.media + '%)',
                    data: Array(sorted.length).fill(rede.media),
                    type: 'line',
                    borderColor: '#0f2b4c',
                    borderDash: [8, 4],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 10 }, usePointStyle: true } },
                tooltip: {
                    callbacks: {
                        label: c => c.datasetIndex === 0
                            ? `${c.raw}% — ${sorted[c.dataIndex].classificacao}`
                            : `Rede: ${c.raw}%`
                    }
                },
                datalabels: {
                    display: ctx => ctx.datasetIndex === 0,
                    anchor: 'end', align: 'end', offset: 2,
                    font: { size: 10, weight: '700' },
                    color: '#0f2b4c',
                    textStrokeColor: '#fff', textStrokeWidth: 3,
                    formatter: v => v + '%'
                }
            },
            scales: {
                x: { min: 0, max: 105, ticks: { callback: v => v <= 100 ? v + '%' : '' } },
                y: { ticks: { font: { size: 9 } } }
            }
        }
    });
}

function renderEscolasLpMt(escolas, rede) {
    const el = document.getElementById('chart-esc-lp-mt');
    if (!el) return;
    const sorted = [...escolas].sort((a, b) => b.media - a.media);
    const labels = sorted.map(e => truncate(e.escola, 20));
    const n = sorted.length;

    charts['chart-esc-lp-mt'] = new Chart(el.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'LP', data: sorted.map(e => e.lp), backgroundColor: '#3b82f6aa', borderColor: '#3b82f6', borderWidth: 1.5, borderRadius: 3 },
                { label: 'Matemática', data: sorted.map(e => e.mt), backgroundColor: '#f59e0baa', borderColor: '#f59e0b', borderWidth: 1.5, borderRadius: 3 },
                { label: 'Rede LP (' + rede.lp + '%)', data: Array(n).fill(rede.lp), type: 'line', borderColor: '#1d4ed8', borderDash: [6, 3], borderWidth: 2, pointRadius: 0, fill: false },
                { label: 'Rede MT (' + rede.mt + '%)', data: Array(n).fill(rede.mt), type: 'line', borderColor: '#b45309', borderDash: [6, 3], borderWidth: 2, pointRadius: 0, fill: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 10 }, usePointStyle: true } },
                tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.raw + '%' } },
                datalabels: {
                    display: ctx => ctx.datasetIndex < 2,
                    anchor: 'end', align: 'end', offset: 1,
                    font: { size: 8, weight: '700' },
                    color: '#0f2b4c',
                    textStrokeColor: '#fff', textStrokeWidth: 2,
                    formatter: v => v + '%'
                }
            },
            scales: {
                y: { min: 0, max: 105, ticks: { callback: v => v <= 100 ? v + '%' : '' } },
                x: { ticks: { font: { size: 8 }, maxRotation: 30 } }
            }
        }
    });
}

function renderEscolasEtapas(detalhe, rede) {
    const el = document.getElementById('chart-esc-etapas');
    if (!el) return;
    const present = [...new Set(detalhe.map(r => r.ano_escolar).filter(Boolean))].sort((a, b) => anoSortKey(a) - anoSortKey(b));
    const n = present.length;

    const etapaLp = present.map(e => {
        const rows = detalhe.filter(r => r.ano_escolar === e && r.lp_pct != null);
        return rows.length ? rd(mean(rows.map(r => r.lp_pct)), 1) : null;
    });
    const etapaMt = present.map(e => {
        const rows = detalhe.filter(r => r.ano_escolar === e && r.mt_pct != null);
        return rows.length ? rd(mean(rows.map(r => r.mt_pct)), 1) : null;
    });
    const etapaMedia = present.map(e => {
        const rows = detalhe.filter(r => r.ano_escolar === e && r.media_geral != null);
        return rows.length ? rd(mean(rows.map(r => r.media_geral)), 1) : null;
    });

    charts['chart-esc-etapas'] = new Chart(el.getContext('2d'), {
        type: 'bar',
        data: {
            labels: present,
            datasets: [
                { label: 'LP', data: etapaLp, backgroundColor: '#3b82f6aa', borderColor: '#3b82f6', borderWidth: 1.5, borderRadius: 3 },
                { label: 'Matemática', data: etapaMt, backgroundColor: '#f59e0baa', borderColor: '#f59e0b', borderWidth: 1.5, borderRadius: 3 },
                {
                    label: 'Média p/ Etapa', data: etapaMedia, type: 'line',
                    borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.1)',
                    borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: '#10b981', fill: false, tension: 0.3
                },
                {
                    label: 'Rede (' + rede.media + '%)', data: Array(n).fill(rede.media), type: 'line',
                    borderColor: '#0f2b4c', borderDash: [8, 4], borderWidth: 2, pointRadius: 0, fill: false
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 10 }, usePointStyle: true } },
                tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.raw + '%' } },
                datalabels: {
                    display: ctx => ctx.datasetIndex < 2,
                    anchor: 'end', align: 'end', offset: 1,
                    font: { size: 9, weight: '700' }, color: '#0f2b4c',
                    textStrokeColor: '#fff', textStrokeWidth: 2,
                    formatter: v => v != null ? v + '%' : ''
                }
            },
            scales: {
                y: { min: 0, max: 105, ticks: { callback: v => v <= 100 ? v + '%' : '' } },
                x: { ticks: { font: { size: 11 } } }
            }
        }
    });
}

function renderEscolasCriticas(escolas) {
    const el = document.getElementById('chart-esc-criticas');
    if (!el) return;
    const sorted = [...escolas].sort((a, b) => (b.hab_criticas || 0) - (a.hab_criticas || 0));
    const labels = sorted.map(e => truncate(e.escola, 24));
    const values = sorted.map(e => e.hab_criticas || 0);
    const maxVal = Math.max(...values, 1);

    charts['chart-esc-criticas'] = new Chart(el.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Habilidades Críticas (nº)',
                data: values,
                backgroundColor: values.map(v => {
                    const r = v / maxVal;
                    return r > 0.7 ? '#ef444499' : r > 0.5 ? '#f9731699' : r > 0.3 ? '#facc1599' : '#22c55e99';
                }),
                borderColor: values.map(v => {
                    const r = v / maxVal;
                    return r > 0.7 ? '#ef4444' : r > 0.5 ? '#f97316' : r > 0.3 ? '#facc15' : '#22c55e';
                }),
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => c.raw + ' habilidade(s) crítica(s)' } },
                datalabels: {
                    display: true, anchor: 'end', align: 'end', offset: 2,
                    font: { size: 10, weight: '700' }, color: '#0f2b4c',
                    textStrokeColor: '#fff', textStrokeWidth: 2,
                    formatter: v => v
                }
            },
            scales: {
                x: { min: 0, ticks: { stepSize: 10 } },
                y: { ticks: { font: { size: 9 } } }
            }
        }
    });
}

function renderEscolasHeatmap(detalhe, escolas) {
    const container = document.getElementById('esc-heatmap');
    if (!container) return;

    const present = [...new Set(detalhe.map(r => r.ano_escolar).filter(Boolean))].sort((a, b) => anoSortKey(a) - anoSortKey(b));
    const sortedEsc = [...escolas].sort((a, b) => b.media - a.media);

    const clsBg  = { 'Adequado': '#dcfce7', 'Regular': '#fef9c3', 'Atenção': '#ffedd5', 'Crítico': '#fee2e2' };
    const clsTxt = { 'Adequado': '#166534', 'Regular': '#854d0e', 'Atenção': '#9a3412', 'Crítico': '#991b1b' };

    const cellStyle = 'text-align:center;padding:7px 6px;border-bottom:1px solid #e2e8f0;';
    const thStyle = 'padding:8px 10px;background:#0f2b4c;color:#fff;font-size:11px;font-weight:600;';

    let html = `<table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead><tr>
            <th style="${thStyle}text-align:left;min-width:180px;">Escola</th>
            ${present.map(e => `<th style="${thStyle}min-width:90px;">${e}</th>`).join('')}
            <th style="${thStyle}min-width:90px;">Média</th>
        </tr></thead><tbody>`;

    sortedEsc.forEach((esc, idx) => {
        const rowBg = idx % 2 === 0 ? '#f8fafc' : '#fff';
        html += `<tr style="background:${rowBg};">`;
        html += `<td style="padding:8px 10px;font-weight:600;color:#0f2b4c;border-bottom:1px solid #e2e8f0;">${sanitize(esc.escola)}</td>`;
        present.forEach(etapa => {
            const row = detalhe.find(r => r.escola === esc.escola && r.ano_escolar === etapa);
            if (row) {
                const bg = clsBg[row.classificacao] || '#f1f5f9';
                const tc = clsTxt[row.classificacao] || '#475569';
                html += `<td style="${cellStyle}">
                    <div style="background:${bg};color:${tc};border-radius:6px;padding:4px 6px;font-weight:700;">${row.media_geral}%</div>
                    <div style="font-size:9px;color:${tc};margin-top:2px;">${row.classificacao}</div>
                </td>`;
            } else {
                html += `<td style="${cellStyle}color:#cbd5e1;">—</td>`;
            }
        });
        const bg = clsBg[esc.classificacao] || '#f1f5f9';
        const tc = clsTxt[esc.classificacao] || '#475569';
        html += `<td style="${cellStyle}">
            <div style="background:${bg};color:${tc};border-radius:6px;padding:4px 6px;font-weight:800;">${esc.media}%</div>
            <div style="font-size:9px;color:${tc};margin-top:2px;">${esc.classificacao}</div>
        </td></tr>`;
    });

    // Linha da rede
    html += `<tr style="background:#f0f2f5;font-weight:700;">
        <td style="padding:8px 10px;color:#0f2b4c;border-bottom:1px solid #e2e8f0;">Média da Rede</td>`;
    present.forEach(etapa => {
        const rows = detalhe.filter(r => r.ano_escolar === etapa && r.media_geral != null);
        const avg = rows.length ? rd(mean(rows.map(r => r.media_geral)), 1) : null;
        html += `<td style="${cellStyle}background:#e2e8f0;">${avg != null ? `<span style="font-weight:700;color:#0f2b4c;">${avg}%</span>` : '—'}</td>`;
    });
    html += `<td style="${cellStyle}background:#e2e8f0;"><span style="font-weight:800;color:#0f2b4c;">—</span></td></tr>`;
    html += `</tbody></table>`;

    // Legenda
    html += `<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:11px;">`;
    Object.entries(clsBg).forEach(([cls, bg]) => {
        html += `<span style="display:flex;align-items:center;gap:5px;">
            <span style="width:14px;height:14px;border-radius:3px;background:${bg};border:1px solid ${clsTxt[cls]};display:inline-block;"></span>
            <span style="color:${clsTxt[cls]};font-weight:600;">${cls}</span>
        </span>`;
    });
    html += `</div>`;

    container.innerHTML = html;
}

// ===== DETALHAMENTO =====
function loadDetalhamento() {
    const { escola, ano, componente } = getFilters();
    const data = getTabelaDetalhada(escola, ano, componente);
    const tbody = document.getElementById('tabela-body');
    tbody.innerHTML = '';
    const maxRows = 500;
    data.slice(0, maxRows).forEach(row => {
        const tr = document.createElement('tr');
        const bcls = badgeClass(row.faixa);
        tr.innerHTML = `
            <td>${sanitize(row.escola)}</td>
            <td>${sanitize(row.ano_escolar)}</td>
            <td>${sanitize(row.componente)}</td>
            <td>${sanitize(row.habilidade_pos)}</td>
            <td>${sanitize(row.habilidade_descritor)}</td>
            <td title="${sanitize(row.habilidade_descricao)}">${truncate(row.habilidade_descricao, 60)}</td>
            <td><strong>${row.acerto_pct}%</strong></td>
            <td><span class="badge ${bcls}">${row.faixa}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function badgeClass(faixa) {
    const map = { 'Crítico': 'badge-critico', 'Atenção': 'badge-atencao', 'Intermediário': 'badge-intermediario', 'Regular': 'badge-intermediario', 'Adequado': 'badge-adequado' };
    return map[faixa] || '';
}

// ===== CHART HELPERS =====
function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function getBarColors(values, faixas) {
    if (faixas) return faixas.map(f => FAIXA_COLORS[f]?.border || '#94a3b8');
    return values.map(v => {
        if (v <= 40) return '#ef4444';
        if (v <= 60) return '#f97316';
        if (v <= 80) return '#facc15';
        return '#22c55e';
    });
}

function renderBarChart(id, labels, values, faixas, label) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label, data: values,
                backgroundColor: getBarColors(values, faixas),
                borderRadius: 4, maxBarThickness: 28
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => c.raw + '%' } },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'end',
                    offset: 1,
                    font: { size: 10, weight: '800' },
                    color: '#0f2b4c',
                    textStrokeColor: '#fff',
                    textStrokeWidth: 3,
                    formatter: v => v + '%'
                }
            },
            scales: {
                y: { min: 0, max: 110, ticks: { callback: v => v <= 100 ? v + '%' : '', font: { size: 10 } } },
                x: { ticks: { font: { size: 9 }, maxRotation: 45 } }
            }
        }
    });
}

function renderDoughnutChart(id, labels, values) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext('2d');
    const colors = labels.map(l => FAIXA_COLORS[l]?.border || '#94a3b8');
    charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 16, usePointStyle: true } },
                tooltip: { callbacks: { label: c => c.label + ': ' + c.raw + ' habilidade(s)' } },
                datalabels: {
                    display: true,
                    color: '#fff',
                    font: { weight: 'bold', size: 13 },
                    formatter: (value, ctx) => {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        return total ? Math.round(value / total * 100) + '%' : '';
                    }
                }
            }
        }
    });
}

function renderHorizontalBar(id, labels, values, descricoes, isLow) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext('2d');
    const colors = values.map(v => {
        if (v <= 40) return '#ef4444';
        if (v <= 60) return '#f97316';
        if (v <= 80) return '#facc15';
        return '#22c55e';
    });
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: 'Acerto %', data: values, backgroundColor: colors, borderRadius: 4 }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: (c) => descricoes ? truncate(descricoes[c.dataIndex], 70) : '',
                        label: c => c.raw + '%'
                    }
                },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'end',
                    offset: 2,
                    font: { size: 10, weight: '800' },
                    color: '#0f2b4c',
                    textStrokeColor: '#fff',
                    textStrokeWidth: 3,
                    formatter: v => v + '%'
                }
            },
            scales: {
                x: { min: 0, max: 110, ticks: { callback: v => v <= 100 ? v + '%' : '' } },
                y: { ticks: { font: { size: 11 } } }
            }
        }
    });
}

// ===== UTILS =====
function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '…' : str;
}

function sanitize(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
