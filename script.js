/* script.js - Dashboard de Consultas (Versão com CRUD de pacientes no Supabase + fallback local)
   - Permite: criar paciente, editar paciente (PATCH), excluir paciente (DELETE)
   - Se Supabase falhar, usa localStorage como fallback
   - Mantém funcionalidades de agendamento já existentes
*/

/* -------------------------
   1) CONFIGURAÇÃO SUPABASE (opcional)
   ------------------------- */
const SUPABASE_URL = 'https://tasoqpfyjzlnnqmphjmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhc29xcGZ5anpsbm5xbXBoam1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzM0NzIsImV4cCI6MjA3NzI0OTQ3Mn0.6mbYEImKggwVXqnS5aWhcisAZLVYt_7QJg1UM0t3URg';
const TABELA_PACIENTES = 'pacientes';

// fallback local/paciente demo inicial (usar se Supabase falhar e também para popular localStorage)
const PACIENTES_INICIAIS = [
  { cpf: "03349906109", nome: "Larissa Silva Ramos", nascimento: "1989-01-16", telefone: "556199900101", email: "larissa.ramos@gmail.com" },
  { cpf: "26317036187", nome: "Larissa Gonçalves Souza", nascimento: "1965-09-15", telefone: "5561998887777", email: "larissa.souza@gmail.com" },
  { cpf: "11122233344", nome: "Ana Beatriz Souza", nascimento: "1985-04-23", telefone: "556199900011", email: "anab.souza@email.com" },
  { cpf: "22233344455", nome: "Bruno Almeida", nascimento: "1992-11-05", telefone: "556199900022", email: "bruno.almeida@exemplo.com" },
  { cpf: "33344455566", nome: "Carla Mendes", nascimento: "1974-06-19", telefone: "556199900033", email: "carlam@uol.com.br" },
  { cpf: "44455566677", nome: "Diego Fonseca", nascimento: "1988-02-10", telefone: "556199900044", email: "diego_f@mail.com" },
  { cpf: "03488265102", nome: "Ailla de Oliveira Motta", nascimento: "1989-10-02", telefone: "559831932970", email: "ailla.motta@exemplo.com" }
];

const NUMERO_CLINICA = "5561998480130";
const MAX_TIME = "18:00";
const TRES_MESES_EM_DIAS = 90;

/* -------------------------
   2) UTILITÁRIOS/COMUNICAÇÃO SUPABASE (tolerante)
   ------------------------- */
async function supabaseFetch(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const baseHeaders = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };
  return fetch(url, {
    mode: 'cors',
    ...options,
    headers: { ...baseHeaders, ...(options.headers || {}) }
  });
}

// Carrega pacientes (GET)
async function loadPatientsFromSupabase() {
  const res = await supabaseFetch(`${TABELA_PACIENTES}?select=*`, { method: 'GET' });
  if (!res.ok) throw new Error(`Supabase READ falhou: ${res.status}`);
  const data = await res.json();
  return data.map(p => ({
    cpf: (p.cpf || '').toString(),
    nome: p.nome,
    nascimento: p.nascimento ? p.nascimento.split('T')[0] : null,
    telefone: p.telefone,
    email: p.email
  }));
}

// Insere novo paciente (POST)
async function insertPatientToSupabase(patientData) {
  try {
    const res = await supabaseFetch(TABELA_PACIENTES, {
      method: 'POST',
      headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify(patientData)
    });
    return res.ok;
  } catch (e) {
    console.warn('insertPatientToSupabase failed', e);
    return false;
  }
}

// Atualiza paciente existente (PATCH) - filtra por cpf
async function updatePatientOnSupabase(originalCpf, patientData) {
  try {
    const endpoint = `${TABELA_PACIENTES}?cpf=eq.${encodeURIComponent(originalCpf)}`;
    const res = await supabaseFetch(endpoint, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(patientData)
    });
    return res.ok;
  } catch (e) {
    console.warn('updatePatientOnSupabase failed', e);
    return false;
  }
}

// Deleta paciente (DELETE) - filtra por cpf
async function deletePatientFromSupabase(cpf) {
  try {
    const endpoint = `${TABELA_PACIENTES}?cpf=eq.${encodeURIComponent(cpf)}`;
    const res = await supabaseFetch(endpoint, { method: 'DELETE' });
    return res.ok;
  } catch (e) {
    console.warn('deletePatientFromSupabase failed', e);
    return false;
  }
}

/* -------------------------
   3) Persistência local de fallback (localStorage)
   ------------------------- */
const KEY_LOCAL_PATIENTS = 'ads_local_patients';
function loadLocalPatients() {
  try {
    const raw = localStorage.getItem(KEY_LOCAL_PATIENTS);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { console.error('Erro ao ler localPatients', e); return []; }
}
function saveLocalPatients(list){
  try { localStorage.setItem(KEY_LOCAL_PATIENTS, JSON.stringify(list)); }
  catch(e){ console.error('Erro ao salvar localPatients', e); }
}

/* -------------------------
   4) Estado da aplicação
   ------------------------- */
let allPatients = []; // combinado
let localPatients = loadLocalPatients();
let supabaseAvailable = false;
let selectedTime = null;
let selectedDate = null;
let selectedDuration = 30;
let appointments = loadAppointments();
let remarqueeId = null;
let foundPatient = null;

// editing state
let editingCpfOriginal = null; // se não-nulo, estamos editando esse CPF

/* -------------------------
   5) DOM queries
   ------------------------- */
const cpfInput = document.getElementById('cpfInput');
const btnSearch = document.getElementById('btnSearch');
const searchMsg = document.getElementById('searchMsg');
const patientPanel = document.getElementById('patientPanel');
const pNome = document.getElementById('pNome');
const pNasc = document.getElementById('pNasc');
const pCPF = document.getElementById('pCPF');
const pTel = document.getElementById('pTel');
const pEmail = document.getElementById('pEmail');
const bookingSection = document.getElementById('bookingSection');
const datePick = document.getElementById('datePick');
const timesDiv = document.getElementById('times');
const obsText = document.getElementById('obsText');
const btnSchedule = document.getElementById('btnSchedule');
const btnClear = document.getElementById('btnClear');
const bookingMsg = document.getElementById('bookingMsg');
const appointmentsTableBody = document.querySelector('#appointmentsTable tbody');
const modal = document.getElementById('modal');
const durationOptions = document.getElementById('duration');
const timelineBody = document.getElementById('timelineBody');
const filterInput = document.getElementById('filterInput');
const remarqueeIdInput = document.getElementById('remarqueeId');
const patientSelectionPanel = document.getElementById('patientSelectionPanel');
const selectionCount = document.getElementById('selectionCount');
const selectionList = document.getElementById('selectionList');
const tabsNav = document.querySelector('.tabs-nav');
const bookingFlowSection = document.getElementById('booking-flow');
const dailyDashboardSection = document.getElementById('daily-dashboard');
const dashboardDatePick = document.getElementById('dashboardDatePick');
const dailyAppointmentsTableBody = document.querySelector('#dailyAppointmentsTable tbody');
const dailyAppointmentsTitle = document.getElementById('dailyAppointmentsTitle');
const dailyTimelineBody = document.getElementById('dailyTimelineBody');
const btnExportCsv = document.getElementById('btnExportCsv');
const registerSection = document.getElementById('patient-register');
const regNome = document.getElementById('regNome');
const regCPF = document.getElementById('regCPF');
const regNascimento = document.getElementById('regNascimento');
const regTelefone = document.getElementById('regTelefone');
const regEmail = document.getElementById('regEmail');
const btnSavePatient = document.getElementById('btnSavePatient');
const registerMsg = document.getElementById('registerMsg');
const registeredPatientsTableBody = document.querySelector('#registeredPatientsTable tbody');
const filterRegInput = document.getElementById('filterRegInput');
const btnClearRegister = document.getElementById('btnClearRegister');
const regPanelTitle = document.getElementById('regPanelTitle');

/* -------------------------
   6) Horários gerados
   ------------------------- */
function generateTimeSlots() {
  const slots = [];
  for (let h = 8; h <= 17; h++) {
    for (let m of [0, 30]) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      slots.push(time);
    }
  }
  return slots;
}
const ALL_TIME_SLOTS = generateTimeSlots();

/* -------------------------
   Helpers adicionais (normalização, limpeza do formulário)
   ------------------------- */
function normalizeString(str = '') {
  // remove acentos, espaços e pontuação básica, deixa em minúsculas
  try {
    // remover acento
    const s = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.toLowerCase().replace(/[\s\.\-\(\)\/\\,]/g, '');
  } catch (e) {
    return (str || '').toString().toLowerCase().replace(/[\s\.\-\(\)\/\\,]/g, '');
  }
}

function clearRegisterFields(){
  if (regNome) regNome.value = '';
  if (regCPF) regCPF.value = '';
  if (regNascimento) regNascimento.value = '';
  if (regTelefone) regTelefone.value = '';
  if (regEmail) regEmail.value = '';
  editingCpfOriginal = null;
  if (regPanelTitle) regPanelTitle.textContent = "Novo Cadastro de Pacientes";
  if (registerMsg) {
    registerMsg.textContent = '';
    registerMsg.style.color = '';
  }
}

/* -------------------------
   7) Inicialização
   ------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  // tenta carregar do Supabase
  try {
    const supa = await loadPatientsFromSupabase();
    supabaseAvailable = true;
    localPatients = loadLocalPatients();
    allPatients = mergePatientLists(supa, localPatients);
    console.info('Pacientes carregados do Supabase. Total:', allPatients.length);
  } catch (e) {
    console.warn('Não foi possível carregar pacientes do Supabase. Usando fallback local.', e);
    supabaseAvailable = false;
    localPatients = loadLocalPatients();
    if (localPatients.length === 0) {
      localPatients = PACIENTES_INICIAIS.slice();
      saveLocalPatients(localPatients);
    }
    allPatients = mergePatientLists([], localPatients);
  }

  // Datas limites
  const hoje = new Date();
  const hojeString = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
  if (datePick) datePick.min = hojeString;
  if (dashboardDatePick) dashboardDatePick.min = hojeString;
  const maxDate = new Date(hoje.getTime() + TRES_MESES_EM_DIAS * 24*60*60*1000);
  const md = `${maxDate.getFullYear()}-${String(maxDate.getMonth()+1).padStart(2,'0')}-${String(maxDate.getDate()).padStart(2,'0')}`;
  if (datePick) datePick.max = md;
  if (dashboardDatePick) dashboardDatePick.max = md;

  // UI inicial
  renderAppointments();
  renderRegisteredPatients();
  if (modal) modal.classList.add('hidden');
  const closeModalBtn = document.getElementById('closeModal');
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModalAction);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModalAction(); });
  const durationDefault = document.querySelector('.duration-btn[data-minutes="30"]');
  if (durationDefault) durationDefault.classList.add('selected');
  updateScheduleButtonText();
  showTab('patient-register');
  const hojeVal = hojeString;
  if (dashboardDatePick) { dashboardDatePick.value = hojeVal; renderDailyDashboard(hojeVal); }
  if (cpfInput) cpfInput.placeholder = "CPF, Nome ou Telefone";
  const searchCardLabel = document.querySelector('.search-card label[for="cpfInput"]');
  if (searchCardLabel) searchCardLabel.textContent = "Busca";
  if (selectionList) {
    selectionList.addEventListener('click', (e) => {
      const selectedCpf = e.target.closest('.selection-item')?.dataset.cpf;
      if (selectedCpf) selectPatientByCpf(selectedCpf);
    });
  }
});

/* -------------------------
   8) Listeners (protegidos)
   ------------------------- */
if (tabsNav) {
  tabsNav.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tab-btn');
    if (tabBtn) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      tabBtn.classList.add('active');
      showTab(tabBtn.dataset.tab);
      if (tabBtn.dataset.tab === 'patient-register') renderRegisteredPatients();
    }
  });
}
if (dashboardDatePick) dashboardDatePick.addEventListener('change', (e) => renderDailyDashboard(e.target.value));
if (btnSearch) btnSearch.addEventListener('click', onSearch);
if (cpfInput) cpfInput.addEventListener('keypress', (e)=> { if(e.key === 'Enter') onSearch(); });
if (datePick) datePick.addEventListener('change', () => { selectedDate = datePick.value || null; renderTimes(); renderTimeline(); });
if (btnSchedule) btnSchedule.addEventListener('click', scheduleSelected);
if (btnClear) btnClear.addEventListener('click', clearAll);
if (document.getElementById('copyBtn')) document.getElementById('copyBtn').addEventListener('click', copyModalText);
if (durationOptions) durationOptions.addEventListener('click', (e) => {
  const btn = e.target.closest('.duration-btn');
  if (btn) {
    document.querySelectorAll('.duration-btn').forEach(x => x.classList.remove('selected'));
    btn.classList.add('selected');
    selectedDuration = parseInt(btn.dataset.minutes, 10);
    selectedTime = null;
    renderTimes();
  }
});
if (filterInput) filterInput.addEventListener('keyup', renderAppointments);
if (btnExportCsv) btnExportCsv.addEventListener('click', () => exportDailyAppointmentsToCSV(dashboardDatePick.value));
if (btnSavePatient) btnSavePatient.addEventListener('click', async () => {
  const success = await savePatientAction();
  if (success) renderRegisteredPatients();
});
if (btnClearRegister) btnClearRegister.addEventListener('click', clearRegisterFields);
if (filterRegInput) filterRegInput.addEventListener('keyup', renderRegisteredPatients);

/* -------------------------
   9) Funções principais
   ------------------------- */

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
  if (tabId === 'booking-flow' && bookingFlowSection) bookingFlowSection.classList.remove('hidden');
  else if (tabId === 'daily-dashboard' && dailyDashboardSection) dailyDashboardSection.classList.remove('hidden');
  else if (tabId === 'patient-register' && registerSection) registerSection.classList.remove('hidden');
}

// Busca estendida
function onSearch(){
  const searchTerm = (cpfInput?.value || '').trim();
  hidePatient();
  if (patientSelectionPanel) patientSelectionPanel.classList.add('hidden');
  if (selectionList) selectionList.innerHTML = '';
  if (!searchTerm) {
    if (searchMsg) {
      searchMsg.textContent = "Insira CPF, Nome ou Telefone para buscar.";
      searchMsg.style.color = "#b45309";
    }
    return;
  }

  const normalized = normalizeString(searchTerm);
  const normalizedDigits = searchTerm.replace(/\D/g,'');

  const matches = allPatients.filter(x => {
    const nomeNorm = normalizeString(x.nome || '');
    const cpfDigits = (x.cpf || '').toString().replace(/\D/g,'');
    const telDigits = (x.telefone || '').toString().replace(/\D/g,'');

    const nomeMatch = nomeNorm.includes(normalized);
    const cpfMatch = cpfDigits.includes(normalizedDigits);
    const telefoneMatch = telDigits.includes(normalizedDigits);

    return nomeMatch || cpfMatch || telefoneMatch;
  });

  if (!matches || matches.length === 0) {
    if (searchMsg) {
      searchMsg.textContent = "Paciente não encontrado. Cadastre-o na aba 'Cadastro de Pacientes'.";
      searchMsg.style.color = "#b91c1c";
    }
    return;
  }
  if (matches.length === 1) {
    selectPatient(matches[0]);
    if (searchMsg) { searchMsg.textContent = "Paciente localizado."; searchMsg.style.color = "#065f46"; }
  } else {
    if (searchMsg) { searchMsg.textContent = "Múltiplos pacientes encontrados. Selecione na lista."; searchMsg.style.color = "#b45309"; }
    renderSelectionList(matches);
  }
}

function renderSelectionList(patients) {
  if (!patientSelectionPanel || !selectionList || !selectionCount) return;
  patientSelectionPanel.classList.remove('hidden');
  selectionCount.textContent = `${patients.length} resultados encontrados.`;
  selectionList.innerHTML = patients.map(p => `
    <div class="selection-item" data-cpf="${p.cpf}">
      <strong>${p.nome}</strong>
      <span class="muted" style="margin-left:10px">CPF: ${maskCPF(p.cpf)} | Nasc: ${p.nascimento ? formatDate(p.nascimento) : '-'}</span>
      <button class="primary" style="margin-left:auto;padding:5px 8px">Selecionar</button>
    </div>
  `).join('');
}

function selectPatientByCpf(cpf) {
  const p = allPatients.find(x => x.cpf === cpf);
  if (p) {
    selectPatient(p);
    if (patientSelectionPanel) patientSelectionPanel.classList.add('hidden');
    if (searchMsg) { searchMsg.textContent = "Paciente localizado."; searchMsg.style.color = "#065f46"; }
  }
}

function selectPatient(p) {
  foundPatient = p;
  showPatient(p);
  if (bookingSection) bookingSection.classList.remove('hidden');
}

function showPatient(p){
  if (!patientPanel) return;
  patientPanel.classList.remove('hidden');
  if (pNome) pNome.textContent = p.nome;
  if (pNasc) pNasc.textContent = formatDate(p.nascimento);
  if (pCPF) pCPF.textContent = maskCPF(p.cpf);
  if (pTel) pTel.textContent = formatPhone(p.telefone);
  if (pEmail) pEmail.textContent = p.email || '-';
}

function hidePatient(){
  foundPatient = null;
  if (patientPanel) patientPanel.classList.add('hidden');
  if (bookingSection) bookingSection.classList.add('hidden');
}

function updateScheduleButtonText(isRemarcar=false){
  if (btnSchedule) btnSchedule.textContent = isRemarcar ? "Remarcar Consulta" : "Agendar";
}

/* -------------------------
   CRUD Pacientes (Salvar / Editar / Deletar)
   - editingCpfOriginal controla o estado de edição
   ------------------------- */

async function savePatientAction(){
  const cpfRaw = (regCPF?.value || '').replace(/\D/g,'');
  const nome = (regNome?.value || '').trim();
  const telefoneRaw = (regTelefone?.value || '').replace(/\D/g,'');
  const email = (regEmail?.value || '').trim();
  const nascimento = regNascimento?.value || null;

  if(!nome || !cpfRaw || !telefoneRaw) {
    if (registerMsg) { registerMsg.textContent = "Nome, CPF e Telefone são obrigatórios."; registerMsg.style.color = "#b91c1c"; }
    return false;
  }
  if(!/^\d{11,12}$/.test(cpfRaw)) {
    if (registerMsg) { registerMsg.textContent = "CPF deve ter 11 ou 12 dígitos numéricos."; registerMsg.style.color = "#b91c1c"; }
    return false;
  }

  const patientData = { nome, cpf: cpfRaw, nascimento, telefone: telefoneRaw, email };

  if (registerMsg) { registerMsg.textContent = editingCpfOriginal ? "Atualizando paciente..." : "Salvando paciente..."; registerMsg.style.color = "#b45309"; }
  if (btnSavePatient) btnSavePatient.disabled = true;

  // Se estamos editando, tentar PATCH -> Supabase ou local
  if (editingCpfOriginal) {
    if (supabaseAvailable) {
      const ok = await updatePatientOnSupabase(editingCpfOriginal, patientData);
      if (ok) {
        // recarrega
        try {
          const supa = await loadPatientsFromSupabase();
          localPatients = loadLocalPatients();
          allPatients = mergePatientLists(supa, localPatients);
        } catch(e) {
          console.warn('Erro recarregar após PATCH; mantendo local.', e);
        }
        if (registerMsg) { registerMsg.textContent = `Paciente ${nome} atualizado (Supabase).`; registerMsg.style.color = "#065f46"; }
        editingCpfOriginal = null;
        if (regPanelTitle) regPanelTitle.textContent = "Novo Cadastro de Pacientes";
        if (btnSavePatient) btnSavePatient.disabled = false;
        clearRegisterFields();
        return true;
      } else {
        // fallback local update
        localPatients = loadLocalPatients();
        localPatients = localPatients.map(p => p.cpf === editingCpfOriginal ? patientData : p);
        saveLocalPatients(localPatients);
        allPatients = mergePatientLists([], localPatients);
        if (registerMsg) { registerMsg.textContent = `Paciente ${nome} atualizado localmente (fallback).`; registerMsg.style.color = "#065f46"; }
        editingCpfOriginal = null;
        if (regPanelTitle) regPanelTitle.textContent = "Novo Cadastro de Pacientes";
        if (btnSavePatient) btnSavePatient.disabled = false;
        clearRegisterFields();
        return true;
      }
    } else {
      // Supabase não disponível -> atualiza local
      localPatients = loadLocalPatients();
      localPatients = localPatients.map(p => p.cpf === editingCpfOriginal ? patientData : p);
      saveLocalPatients(localPatients);
      allPatients = mergePatientLists([], localPatients);
      if (registerMsg) { registerMsg.textContent = `Paciente ${nome} atualizado localmente (offline).`; registerMsg.style.color = "#065f46"; }
      editingCpfOriginal = null;
      if (regPanelTitle) regPanelTitle.textContent = "Novo Cadastro de Pacientes";
      if (btnSavePatient) btnSavePatient.disabled = false;
      clearRegisterFields();
      return true;
    }
  } else {
    // Criação (INSERT)
    if (supabaseAvailable) {
      const ok = await insertPatientToSupabase(patientData);
      if (ok) {
        // reload
        try {
          const supa = await loadPatientsFromSupabase();
          localPatients = loadLocalPatients();
          allPatients = mergePatientLists(supa, localPatients);
        } catch(e) {
          console.warn('Erro recarregar após insert; mantendo local.', e);
        }
        if (registerMsg) { registerMsg.textContent = `Paciente ${nome} cadastrado (Supabase).`; registerMsg.style.color = "#065f46"; }
        if (btnSavePatient) btnSavePatient.disabled = false;
        clearRegisterFields();
        return true;
      } else {
        // fallback local insert
        localPatients = loadLocalPatients();
        const exists = localPatients.find(p => p.cpf === cpfRaw);
        if (!exists) localPatients.push(patientData);
        else localPatients = localPatients.map(p => p.cpf === cpfRaw ? patientData : p);
        saveLocalPatients(localPatients);
        allPatients = mergePatientLists([], localPatients);
        if (registerMsg) { registerMsg.textContent = `Paciente ${nome} salvo localmente (fallback).`; registerMsg.style.color = "#065f46"; }
        if (btnSavePatient) btnSavePatient.disabled = false;
        clearRegisterFields();
        return true;
      }
    } else {
      // Supabase off -> salvar local
      localPatients = loadLocalPatients();
      const exists = localPatients.find(p => p.cpf === cpfRaw);
      if (!exists) localPatients.push(patientData);
      else localPatients = localPatients.map(p => p.cpf === cpfRaw ? patientData : p);
      saveLocalPatients(localPatients);
      allPatients = mergePatientLists([], localPatients);
      if (registerMsg) { registerMsg.textContent = `Paciente ${nome} salvo localmente (offline).`; registerMsg.style.color = "#065f46"; }
      if (btnSavePatient) btnSavePatient.disabled = false;
      clearRegisterFields();
      return true;
    }
  }
}

// Começa edição: preenche o formulário e marca editingCpfOriginal
function startEditPatient(cpf) {
  const p = allPatients.find(x => x.cpf === cpf);
  if (!p) return;
  if (regNome) regNome.value = p.nome || '';
  if (regCPF) regCPF.value = p.cpf || '';
  if (regNascimento) regNascimento.value = p.nascimento || '';
  if (regTelefone) regTelefone.value = p.telefone || '';
  if (regEmail) regEmail.value = p.email || '';
  editingCpfOriginal = p.cpf;
  if (regPanelTitle) regPanelTitle.textContent = `Editar Paciente — ${p.nome}`;
  // switch to cadastro tab
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const tabBtn = document.querySelector('.tab-btn[data-tab="patient-register"]');
  if (tabBtn) tabBtn.classList.add('active');
  showTab('patient-register');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Excluir paciente (Supabase se disponível, senão local)
async function deletePatient(cpf) {
  if (!confirm('Confirma exclusão do paciente (isso também removerá agendamentos relacionados)?')) return;
  // remove agendamentos ligados ao cpf
  appointments = appointments.filter(a => a.cpf !== cpf);
  saveAppointments();
  // tenta deletar do supabase
  if (supabaseAvailable) {
    const ok = await deletePatientFromSupabase(cpf);
    if (ok) {
      // reload pacientes
      try {
        const supa = await loadPatientsFromSupabase();
        localPatients = loadLocalPatients();
        allPatients = mergePatientLists(supa, localPatients);
      } catch(e) { console.warn('Erro recarregar após delete', e); }
      renderRegisteredPatients();
      renderAppointments();
      alert('Paciente removido do Supabase.');
      return;
    } else {
      console.warn('Falha ao deletar no Supabase; removendo localmente.');
    }
  }
  // fallback: remove local
  localPatients = loadLocalPatients();
  localPatients = localPatients.filter(p => p.cpf !== cpf);
  saveLocalPatients(localPatients);
  allPatients = mergePatientLists([], localPatients);
  renderRegisteredPatients();
  renderAppointments();
  alert('Paciente removido localmente (modo offline).');
}

/* -------------------------
   Renderização de pacientes registrados (aba Cadastro)
   - inclui botões: Selecionar, Editar, Excluir
   ------------------------- */
function renderRegisteredPatients(){
  if (!registeredPatientsTableBody) return;
  registeredPatientsTableBody.innerHTML = "";
  const filter = (filterRegInput?.value || '').toLowerCase().replace(/\D/g,'');
  const list = allPatients.filter(p => {
    if(!filter) return true;
    const nameMatch = (p.nome || '').toLowerCase().includes(filter);
    const cpfMatch = (p.cpf || '').includes(filter);
    return nameMatch || cpfMatch;
  }).sort((a,b)=> (a.nome || '').localeCompare(b.nome || ''));

  if(list.length === 0){
    registeredPatientsTableBody.innerHTML = `<tr><td colspan="5" class="muted">Nenhum paciente registrado.</td></tr>`;
    return;
  }
  list.forEach(p => {
    const tr = document.createElement('tr');
    const tdNome = document.createElement('td'); tdNome.textContent = p.nome || '-';
    const tdCPF = document.createElement('td'); tdCPF.textContent = maskCPF(p.cpf || '-');
    const tdNasc = document.createElement('td'); tdNasc.textContent = p.nascimento ? formatDate(p.nascimento) : '-';
    const tdTel = document.createElement('td'); tdTel.textContent = formatPhone(p.telefone || '-');
    const tdActions = document.createElement('td');

    const btnSel = document.createElement('button'); btnSel.textContent = 'Selecionar'; btnSel.className='primary';
    btnSel.style.marginRight = '6px';
    btnSel.addEventListener('click', ()=> selectPatient(p));

    const btnEdit = document.createElement('button'); btnEdit.textContent = 'Editar'; btnEdit.className='secondary';
    btnEdit.style.marginRight = '6px';
    btnEdit.addEventListener('click', ()=> startEditPatient(p.cpf));

    const btnDel = document.createElement('button'); btnDel.textContent = 'Excluir'; btnDel.className='danger';
    btnDel.addEventListener('click', ()=> deletePatient(p.cpf));

    tdActions.appendChild(btnSel); tdActions.appendChild(btnEdit); tdActions.appendChild(btnDel);

    tr.appendChild(tdNome); tr.appendChild(tdCPF); tr.appendChild(tdNasc); tr.appendChild(tdTel); tr.appendChild(tdActions);
    registeredPatientsTableBody.appendChild(tr);
  });
}

/* -------------------------
   Agendamento / restante do app (mantidos)
   ------------------------- */
function saveAppointments(){
  localStorage.setItem('ads_appointments', JSON.stringify(appointments));
}
function loadAppointments(){
  try { const raw = localStorage.getItem('ads_appointments'); return raw ? JSON.parse(raw) : []; }
  catch(e){ console.error('Erro ao carregar appointments', e); return []; }
}

function remarcarAppointment(appId){
  const appt = appointments.find(a => a.id === appId);
  if (!appt) return;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const tabBtn = document.querySelector('.tab-btn[data-tab="booking-flow"]');
  if (tabBtn) tabBtn.classList.add('active');
  showTab('booking-flow');
  remarqueeId = appId; if (remarqueeIdInput) remarqueeIdInput.value = appId;
  if (cpfInput) cpfInput.value = appt.cpf;
  onSearch();
  document.querySelectorAll('.duration-btn').forEach(x => x.classList.remove('selected'));
  const targetBtn = document.querySelector(`.duration-btn[data-minutes="${appt.duration}"]`);
  if (targetBtn) targetBtn.classList.add('selected');
  selectedDuration = appt.duration;
  if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });
}

function clearBookingFields() {
  selectedTime = null; selectedDate = null; if (datePick) datePick.value = ""; if (obsText) obsText.value = ""; if (btnSchedule) btnSchedule.disabled = true;
  document.querySelectorAll('.duration-btn').forEach(x => x.classList.remove('selected'));
  const defaultBtn = document.querySelector('.duration-btn[data-minutes="30"]');
  if (defaultBtn) defaultBtn.classList.add('selected');
  selectedDuration = 30;
  remarqueeId = null; if (remarqueeIdInput) remarqueeIdInput.value = "";
  updateScheduleButtonText(false);
}

/* Agendamento - render de horários */
function renderTimes(){
  if (!timesDiv) return;
  timesDiv.innerHTML = "";
  selectedTime = null;
  if (btnSchedule) btnSchedule.disabled = true;
  if (!selectedDate) return;
  const apptsDoDia = appointments.filter(a => a.date === selectedDate && a.id !== remarqueeId);
  ALL_TIME_SLOTS.forEach(h => {
    const isTaken = isSlotTaken(h, selectedDuration, apptsDoDia);
    const endMins = timeToMinutes(h) + selectedDuration;
    const isLate = endMins > timeToMinutes(MAX_TIME);
    const btn = document.createElement('button');
    btn.textContent = h;
    if (isTaken || isLate) {
      btn.className = 'time-btn taken';
      btn.textContent += " • ocupado";
      btn.disabled = true;
    } else {
      btn.className = 'time-btn';
      btn.addEventListener('click', () => {
        document.querySelectorAll('.time-btn').forEach(x => x.classList.remove('selected'));
        btn.classList.add('selected');
        selectedTime = h;
        if (btnSchedule) btnSchedule.disabled = false;
        if (bookingMsg) { bookingMsg.textContent = `Horário selecionado: ${formatDate(selectedDate)} às ${selectedTime} (${selectedDuration} min)`; bookingMsg.style.color = "#065f46"; }
      });
    }
    timesDiv.appendChild(btn);
  });
}

function isSlotTaken(startH, duration, apptsDoDia) {
  const startMins = timeToMinutes(startH);
  const endMins = startMins + duration;
  return apptsDoDia.some(appt => {
    const apptStart = timeToMinutes(appt.time);
    const apptEnd = apptStart + (appt.duration || 30);
    return (startMins < apptEnd && endMins > apptStart);
  });
}

function scheduleSelected(){
  if(!foundPatient || !selectedDate || !selectedTime || !selectedDuration) {
    if (bookingMsg) { bookingMsg.textContent = "Selecione paciente, duração, data e horário."; bookingMsg.style.color = "#b91c1c"; }
    return;
  }
  const apptsDoDia = appointments.filter(a => a.date === selectedDate && a.id !== remarqueeId);
  if (isSlotTaken(selectedTime, selectedDuration, apptsDoDia)) {
    if (bookingMsg) { bookingMsg.textContent = "Horário já ocupado, escolha outro."; bookingMsg.style.color = "#b91c1c"; }
    renderTimes();
    return;
  }
  const obs = obsText?.value.trim();
  const newApp = {
    id: remarqueeId || cryptoRandomId(),
    cpf: foundPatient.cpf,
    nome: foundPatient.nome,
    telefone: foundPatient.telefone,
    email: foundPatient.email,
    date: selectedDate,
    time: selectedTime,
    duration: selectedDuration,
    observacao: obs,
    createdAt: new Date().toISOString()
  };
  let confirmationMsg = remarqueeId ? "remarcada com sucesso" : "agendada com sucesso";
  if (remarqueeId) appointments = appointments.filter(a => a.id !== remarqueeId);
  appointments.push(newApp);
  saveAppointments();
  renderAppointments();
  renderTimeline();
  if (dashboardDatePick?.value === newApp.date) renderDailyDashboard(newApp.date);
  const humanDate = formatDate(newApp.date);
  let msg = `Olá ${newApp.nome}, sua consulta com a Dra. Kaline Ramos foi ${confirmationMsg} para ${humanDate} às ${newApp.time}. Duração estimada: ${newApp.duration} minutos.`;
  if (newApp.observacao) msg += ` Motivo: ${newApp.observacao}.`;
  msg += ` Por favor, confirme respondendo "Sim".`;
  showModal(NUMERO_CLINICA, msg);
  clearBookingFields();
  if (bookingMsg) bookingMsg.textContent = `Consulta ${confirmationMsg}!`;
}

/* -------------------------
   Render appointments / daily / timeline / CSV
   ------------------------- */
function renderAppointments(){
  if (!appointmentsTableBody) return;
  appointmentsTableBody.innerHTML = "";
  const filterText = (filterInput?.value || '').toLowerCase().trim();
  const filtered = appointments.filter(app => {
    if (!filterText) return true;
    const nomeMatch = (app.nome || '').toLowerCase().includes(filterText);
    const cpfMatch = app.cpf.includes(filterText) || maskCPF(app.cpf).includes(filterText);
    const dateMatch = app.date.includes(filterText) || formatDate(app.date).includes(filterText);
    return nomeMatch || cpfMatch || dateMatch;
  });
  filtered.sort((a,b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (filtered.length === 0) {
    appointmentsTableBody.innerHTML = `<tr><td colspan="8" class="muted">Nenhuma consulta agendada.</td></tr>`;
    return;
  }
  filtered.forEach(app => {
    const tr = document.createElement('tr');
    tr.classList.add(`duration-${app.duration}`);
    const tdNome = document.createElement('td'); tdNome.textContent = app.nome;
    const tdDate = document.createElement('td'); tdDate.textContent = formatDate(app.date);
    const tdTime = document.createElement('td'); tdTime.textContent = app.time;
    const tdDuration = document.createElement('td'); tdDuration.textContent = `${app.duration} min`;
    const tdContact = document.createElement('td');
    const wa = document.createElement('a');
    wa.href = `https://wa.me/${app.telefone}?text=${encodeURIComponent(`Olá ${app.nome}, sua consulta está agendada para ${formatDate(app.date)} às ${app.time}. Duração: ${app.duration} min.`)}`;
    wa.target = "_blank"; wa.textContent = formatPhone(app.telefone);
    tdContact.appendChild(wa);
    const tdEmail = document.createElement('td'); tdEmail.textContent = app.email || '-';
    const tdObs = document.createElement('td'); tdObs.textContent = app.observacao || '-'; tdObs.className = "obs-cell";
    const tdActions = document.createElement('td');
    const btnRemarcar = document.createElement('button'); btnRemarcar.textContent = "Remarcar"; btnRemarcar.className = "primary"; btnRemarcar.style.marginRight='5px';
    btnRemarcar.addEventListener('click', ()=> remarcarAppointment(app.id));
    const btnDel = document.createElement('button'); btnDel.textContent = "Remover"; btnDel.className = "secondary";
    btnDel.addEventListener('click', ()=> {
      if(confirm(`Remover agendamento de ${app.nome} em ${formatDate(app.date)} às ${app.time}?`)){
        appointments = appointments.filter(x => x.id !== app.id);
        saveAppointments();
        renderAppointments();
        renderTimes();
        renderTimeline();
        renderDailyDashboard(dashboardDatePick?.value);
      }
    });
    tdActions.appendChild(btnRemarcar); tdActions.appendChild(btnDel);
    tr.appendChild(tdNome); tr.appendChild(tdDate); tr.appendChild(tdTime); tr.appendChild(tdDuration);
    tr.appendChild(tdContact); tr.appendChild(tdEmail); tr.appendChild(tdObs); tr.appendChild(tdActions);
    appointmentsTableBody.appendChild(tr);
  });
}

function renderDailyDashboard(date) {
  if (!date) return;
  if (dailyAppointmentsTitle) dailyAppointmentsTitle.textContent = `Consultas agendadas para ${formatDate(date)}`;
  const apptsDoDia = appointments.filter(a => a.date === date).sort((a,b) => a.time.localeCompare(b.time));
  if (dailyAppointmentsTableBody) dailyAppointmentsTableBody.innerHTML = "";
  if (apptsDoDia.length === 0) {
    if (dailyAppointmentsTableBody) dailyAppointmentsTableBody.innerHTML = `<tr><td colspan="6" class="muted">Nenhuma consulta agendada para este dia.</td></tr>`;
  } else {
    apptsDoDia.forEach(app => {
      const tr = document.createElement('tr');
      tr.classList.add(`duration-${app.duration}`);
      const tdTime = document.createElement('td'); tdTime.textContent = app.time;
      const tdNome = document.createElement('td'); tdNome.textContent = app.nome;
      const tdDuration = document.createElement('td'); tdDuration.textContent = `${app.duration} min`;
      const tdContact = document.createElement('td'); const wa = document.createElement('a'); wa.href = `https://wa.me/${app.telefone}`; wa.target = "_blank"; wa.textContent = 'WhatsApp'; tdContact.appendChild(wa);
      const tdObs = document.createElement('td'); tdObs.textContent = app.observacao || '-';
      const tdActions = document.createElement('td'); const btnRem = document.createElement('button'); btnRem.textContent='Remarcar'; btnRem.className='primary'; btnRem.style.padding='5px 8px'; btnRem.addEventListener('click', ()=> remarcarAppointment(app.id)); tdActions.appendChild(btnRem);
      tr.appendChild(tdTime); tr.appendChild(tdNome); tr.appendChild(tdDuration); tr.appendChild(tdContact); tr.appendChild(tdObs); tr.appendChild(tdActions);
      if (dailyAppointmentsTableBody) dailyAppointmentsTableBody.appendChild(tr);
    });
  }
  renderTimelineForDashboard(date, dailyTimelineBody);
}

function renderTimelineForDashboard(date, targetElement = timelineBody) {
  if (!targetElement) return;
  targetElement.innerHTML = "";
  if (!date) { targetElement.innerHTML = `<p class="muted">Selecione uma data para ver a linha do tempo.</p>`; return; }
  const apptsDoDia = appointments.filter(a => a.date === date).sort((a,b) => a.time.localeCompare(b.time));
  let current = 0;
  ALL_TIME_SLOTS.forEach(slot => {
    const item = document.createElement('div'); item.className = 'timeline-item';
    let slotBooked = false; let info = null;
    if (current < apptsDoDia.length) {
      const next = apptsDoDia[current];
      if (timeToMinutes(next.time) === timeToMinutes(slot)) {
        slotBooked = true; info = next; current++;
      }
    }
    if (!slotBooked) {
      const ongoing = apptsDoDia.find(appt => {
        const apptStart = timeToMinutes(appt.time); const apptEnd = apptStart + appt.duration;
        const sStart = timeToMinutes(slot);
        return sStart > apptStart && sStart < apptEnd;
      });
      if (!ongoing) item.innerHTML = `<span class="time-slot">${slot}</span> <span class="patient-name">Livre</span>`;
    }
    if (slotBooked && info) {
      item.classList.add(`booked-${info.duration}`);
      const end = minutesToTime(timeToMinutes(info.time)+info.duration);
      let contactInfo = '';
      if (targetElement === dailyTimelineBody) contactInfo = ` - ${formatPhone(info.telefone)}`;
      item.innerHTML = `<span class="time-slot">${info.time}</span><span class="patient-name">${info.nome}${contactInfo}</span><span class="duration-tag">${info.duration} min (até ${end})</span>`;
    }
    if (item.innerHTML) targetElement.appendChild(item);
  });
}

/* Render timeline para o fluxo de agendamento (booking) */
function renderTimeline() {
  // prefer selectedDate (data escolhida no agendamento), se não existir tenta dashboardDatePick
  const date = selectedDate || (dashboardDatePick?.value || null);
  renderTimelineForDashboard(date, timelineBody);
}

function exportDailyAppointmentsToCSV(date) {
  const appts = appointments.filter(a => a.date === date).sort((a,b)=>a.time.localeCompare(b.time));
  if (appts.length === 0) { alert("Nenhuma consulta agendada para exportar neste dia."); return; }
  const header = "Data;Horário;Duração (min);Paciente;Telefone;Email;CPF;Observação";
  const rows = appts.map(app => {
    const safeObs = app.observacao ? `"${app.observacao.replace(/"/g,'"')}"` : '';
    return `${formatDate(app.date)};${app.time};${app.duration};${app.nome};${formatPhone(app.telefone)};${app.email || ''};${maskCPF(app.cpf)};${safeObs}`;
  });
  const csv = [header, ...rows].join('\n');
  const filename = `agenda_dra_kaline_${date}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    alert("Navegador não suporta download automático. Conteúdo copiado para clipboard.");
    navigator.clipboard.writeText(csv);
  }
}

/* -------------------------
   Modal / Utilities
   ------------------------- */
function showModal(telefone_clinica, mensagem) {
  const modalText = document.getElementById('modalText');
  const waLink = document.getElementById('waLink');
  if (modalText) modalText.textContent = mensagem;
  if (waLink) waLink.href = `https://wa.me/${telefone_clinica}?text=${encodeURIComponent(mensagem)}`;
  if (modal) modal.classList.remove('hidden');
  if (modal) modal.setAttribute('aria-hidden','false');
}
function closeModalAction(){ if (modal) modal.classList.add('hidden'); if (modal) modal.setAttribute('aria-hidden','true'); }
function timeToMinutes(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function minutesToTime(m){ const h=Math.floor(m/60); const mm=m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }
function cryptoRandomId(){ return Math.random().toString(36).slice(2,9); }
function formatDate(d){ if(!d) return '-'; const dt = new Date(d+'T00:00:00'); if(isNaN(dt)) return d; return dt.toLocaleDateString('pt-BR'); }
function maskCPF(cpf){ if(/^\d{11}$/.test(cpf)) return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4"); return cpf; }
function formatPhone(tel){ if(!tel) return tel; let num = tel.replace(/\D/g,''); if(num.startsWith('55') && num.length>11) num = num.slice(2); const ddd = num.slice(0,2); const corpo = num.slice(2); if(corpo.length===9) return `(${ddd}) ${corpo.slice(0,5)}-${corpo.slice(5)}`; if(corpo.length===8) return `(${ddd}) ${corpo.slice(0,4)}-${corpo.slice(4)}`; return tel; }
function clearAll(){ if (cpfInput) cpfInput.value = ""; if (searchMsg) searchMsg.textContent = ""; hidePatient(); if (datePick) datePick.value = ""; clearBookingFields(); if (timelineBody) timelineBody.innerHTML = `<p class="muted">Selecione uma data para ver a linha do tempo.</p>`; }
function copyModalText(){ const text = document.getElementById('modalText')?.textContent || ''; navigator.clipboard.writeText(text).then(()=> { const btn = document.getElementById('copyBtn'); if (btn) { btn.textContent = "Copiado!"; setTimeout(()=> btn.textContent = "Copiar mensagem", 1500); } }).catch(()=> { const btn = document.getElementById('copyBtn'); if (btn) btn.textContent = "Erro ao copiar"; }); }

/* -------------------------
   Helpers: merge lista supa + local
   ------------------------- */
function mergePatientLists(supaList = [], localList = []) {
  const map = new Map();
  supaList.forEach(p => { if(p && p.cpf) map.set(p.cpf, p); });
  localList.forEach(p => { if(p && p.cpf && !map.has(p.cpf)) map.set(p.cpf, p); });
  return Array.from(map.values());
}

/* -------------------------
   Fim do arquivo
   ------------------------- */
