// patients.js
// Gerencia CRUD de pacientes, UI de cadastro/lista, pesquisa básica.
// Depende de window.SUPA (supabaseConfig.js). Armazena estado em window.APP.

(function () {
  // --- estado global (exposto para outros módulos) ---
  window.APP = window.APP || {};
  const APP = window.APP;

  // Defaults / fallback initial patients
  const PACIENTES_INICIAIS = [
    { cpf: "03349906109", nome: "Larissa Silva Ramos", nascimento: "1989-01-16", telefone: "556199900101", email: "larissa.ramos@gmail.com" },
    { cpf: "26317036187", nome: "Larissa Gonçalves Souza", nascimento: "1965-09-15", telefone: "5561998887777", email: "larissa.souza@gmail.com" },
    { cpf: "11122233344", nome: "Ana Beatriz Souza", nascimento: "1985-04-23", telefone: "556199900011", email: "anab.souza@email.com" }
  ];

  const KEY_LOCAL_PATIENTS = 'ads_local_patients';

  // UI elements
  const regNome = document.getElementById('regNome');
  const regCPF = document.getElementById('regCPF');
  const regNascimento = document.getElementById('regNascimento');
  const regTelefone = document.getElementById('regTelefone');
  const regEmail = document.getElementById('regEmail');
  const btnSavePatient = document.getElementById('btnSavePatient');
  const btnClearRegister = document.getElementById('btnClearRegister');
  const registerMsg = document.getElementById('registerMsg');
  const registeredPatientsTableBody = document.querySelector('#registeredPatientsTable tbody');
  const filterRegInput = document.getElementById('filterRegInput');
  const btnRefreshPatients = document.getElementById('btnRefreshPatients');

  // state
  APP.localPatients = loadLocalPatients();
  APP.allPatients = [];
  APP.supabaseAvailable = false;
  let editingCpfOriginal = null;

  /* ---------- utils ---------- */
  function loadLocalPatients() {
    try {
      const raw = localStorage.getItem(KEY_LOCAL_PATIENTS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { console.error('Erro ao ler localPatients', e); return []; }
  }
  function saveLocalPatients(list) {
    try { localStorage.setItem(KEY_LOCAL_PATIENTS, JSON.stringify(list)); }
    catch (e) { console.error('Erro ao salvar localPatients', e); }
  }
  function normalizeString(str = '') {
    try {
      const s = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return s.toLowerCase().replace(/[\s\.\-\(\)\/\\,]/g, '');
    } catch (e) {
      return (str || '').toString().toLowerCase().replace(/[\s\.\-\(\)\/\\,]/g, '');
    }
  }
  function maskCPF(cpf) { if(/^\d{11}$/.test(cpf)) return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4"); return cpf; }
  function formatDate(d){ if(!d) return '-'; const dt = new Date(d+'T00:00:00'); if(isNaN(dt)) return d; return dt.toLocaleDateString('pt-BR'); }
  function formatPhone(tel){ if(!tel) return tel; let num = tel.replace(/\D/g,''); if(num.startsWith('55') && num.length>11) num = num.slice(2); const ddd = num.slice(0,2); const corpo = num.slice(2); if(corpo.length===9) return `(${ddd}) ${corpo.slice(0,5)}-${corpo.slice(5)}`; if(corpo.length===8) return `(${ddd}) ${corpo.slice(0,4)}-${corpo.slice(4)}`; return tel; }

  /* ---------- merge helper ---------- */
  function mergePatientLists(supaList = [], localList = []) {
    const map = new Map();
    supaList.forEach(p => { if (p && p.cpf) map.set(p.cpf, p); });
    localList.forEach(p => { if (p && p.cpf && !map.has(p.cpf)) map.set(p.cpf, p); });
    return Array.from(map.values());
  }

  /* ---------- load from supabase on startup ---------- */
  async function initPatients() {
    try {
      const supa = await window.SUPA.loadPatientsFromSupabase();
      APP.supabaseAvailable = true;
      APP.localPatients = loadLocalPatients();
      APP.allPatients = mergePatientLists(supa, APP.localPatients);
      console.info('Pacientes carregados do Supabase. Total:', APP.allPatients.length);
    } catch (e) {
      console.warn('Não foi possível carregar pacientes do Supabase. Usando fallback local.', e);
      APP.supabaseAvailable = false;
      APP.localPatients = loadLocalPatients();
      if (APP.localPatients.length === 0) {
        APP.localPatients = PACIENTES_INICIAIS.slice();
        saveLocalPatients(APP.localPatients);
      }
      APP.allPatients = mergePatientLists([], APP.localPatients);
    }
    renderRegisteredPatients();
  }

  /* ---------- UI actions: save / edit / delete ---------- */
  async function savePatientAction() {
    const cpfRaw = (regCPF.value || '').replace(/\D/g,'');
    const nome = (regNome.value || '').trim();
    const telefoneRaw = (regTelefone.value || '').replace(/\D/g,'');
    const email = (regEmail.value || '').trim();
    const nascimento = regNascimento.value || null;

    if (!nome || !cpfRaw || !telefoneRaw) {
      registerMsg.textContent = "Nome, CPF e Telefone são obrigatórios.";
      registerMsg.style.color = "#b91c1c";
      return false;
    }
    if(!/^\d{11,12}$/.test(cpfRaw)) {
      registerMsg.textContent = "CPF deve ter 11 ou 12 dígitos numéricos.";
      registerMsg.style.color = "#b91c1c";
      return false;
    }

    const patientData = { nome, cpf: cpfRaw, nascimento, telefone: telefoneRaw, email };

    registerMsg.textContent = editingCpfOriginal ? "Atualizando paciente..." : "Salvando paciente...";
    registerMsg.style.color = "#b45309";
    btnSavePatient.disabled = true;

    if (editingCpfOriginal) {
      if (APP.supabaseAvailable) {
        const ok = await window.SUPA.updatePatientOnSupabase(editingCpfOriginal, patientData);
        if (ok) {
          try {
            const supa = await window.SUPA.loadPatientsFromSupabase();
            APP.localPatients = loadLocalPatients();
            APP.allPatients = mergePatientLists(supa, APP.localPatients);
          } catch (e) { console.warn('Erro recarregar após PATCH; mantendo local.', e); }
          registerMsg.textContent = `✅ Paciente ${nome} atualizado com sucesso!`;
          registerMsg.style.color = "#065f46";
          editingCpfOriginal = null;
          regPanelTitle.textContent = "Novo Cadastro de Pacientes";
          btnSavePatient.disabled = false;
          clearRegisterFields();
          renderRegisteredPatients();
          return true;
        }
      }
    } else {
      if (APP.supabaseAvailable) {
        const ok = await window.SUPA.insertPatientToSupabase(patientData);
        if (ok) {
          try {
            const supa = await window.SUPA.loadPatientsFromSupabase();
            APP.localPatients = loadLocalPatients();
            APP.allPatients = mergePatientLists(supa, APP.localPatients);
          } catch (e) { console.warn('Erro recarregar após insert; mantendo local.', e); }
          registerMsg.textContent = `✅ Paciente ${nome} cadastrado com sucesso!`;
          registerMsg.style.color = "#065f46";
          btnSavePatient.disabled = false;
          clearRegisterFields();
          renderRegisteredPatients();
          return true;
        }
      }
    }
  }

  function startEditPatient(cpf) {
    const p = APP.allPatients.find(x => x.cpf === cpf);
    if (!p) return;
    regNome.value = p.nome || '';
    regCPF.value = p.cpf || '';
    regNascimento.value = p.nascimento || '';
    regTelefone.value = p.telefone || '';
    regEmail.value = p.email || '';
    editingCpfOriginal = p.cpf;
    regPanelTitle.textContent = `Editar Paciente — ${p.nome}`;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const tabBtn = document.querySelector('.tab-btn[data-tab="patient-register"]');
    if (tabBtn) tabBtn.classList.add('active');
    if (typeof window.showTab === 'function') window.showTab('patient-register');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deletePatient(cpf) {
    if (!confirm('Confirma exclusão do paciente (isso também removerá agendamentos relacionados)?')) return;
    if (Array.isArray(APP.appointments)) {
      APP.appointments = APP.appointments.filter(a => a.cpf !== cpf);
      localStorage.setItem('ads_appointments', JSON.stringify(APP.appointments));
    }
    if (APP.supabaseAvailable) {
      const ok = await window.SUPA.deletePatientFromSupabase(cpf);
      if (ok) {
        try {
          const supa = await window.SUPA.loadPatientsFromSupabase();
          APP.localPatients = loadLocalPatients();
          APP.allPatients = mergePatientLists(supa, APP.localPatients);
        } catch (e) { console.warn('Erro recarregar após delete', e); }
        renderRegisteredPatients();
        if (typeof window.renderAppointments === 'function') window.renderAppointments();
        alert('Paciente removido do Supabase.');
        return;
      } else {
        console.warn('Falha ao deletar no Supabase; removendo localmente.');
      }
    }
    APP.localPatients = loadLocalPatients();
    APP.localPatients = APP.localPatients.filter(p => p.cpf !== cpf);
    saveLocalPatients(APP.localPatients);
    APP.allPatients = mergePatientLists([], APP.localPatients);
    renderRegisteredPatients();
    if (typeof window.renderAppointments === 'function') window.renderAppointments();
    alert('Paciente removido localmente (modo offline).');
  }

  /* ---------- Render list (Cadastro) ---------- */
  function renderRegisteredPatients() {
    if (!registeredPatientsTableBody) return;
    registeredPatientsTableBody.innerHTML = "";

    const filter = normalizeString(filterRegInput?.value || '');
    const list = APP.allPatients.filter(p => {
      if (!filter) return true;
      const nomeNorm = normalizeString(p.nome || '');
      const cpfNorm = (p.cpf || '').toString();
      const telNorm = (p.telefone || '').toString().replace(/\D/g, '');
      return nomeNorm.includes(filter) || cpfNorm.includes(filter) || telNorm.includes(filter);
    }).sort((a,b)=> (a.nome || '').localeCompare(b.nome || ''));

    const feedbackArea = document.getElementById('filterFeedback');
    if (feedbackArea) feedbackArea.remove();
    const msg = document.createElement('div');
    msg.id = 'filterFeedback';
    msg.style.fontSize = '0.9em';
    msg.style.margin = '4px 0 8px';
    msg.style.color = '#2563eb';

    if (filter && list.length > 0) {
      msg.textContent = `🔍 ${list.length} resultado(s) encontrado(s) para "${filterRegInput.value}".`;
    } else if (filter && list.length === 0) {
      msg.textContent = `⚠️ Nenhum paciente encontrado para "${filterRegInput.value}".`;
      msg.style.color = '#b91c1c';
    } else {
      msg.textContent = `🩺 Mostrando todos os pacientes.`;
      msg.style.color = '#065f46';
    }
    registeredPatientsTableBody.parentElement.prepend(msg);

    if (list.length === 0) {
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
      btnSel.addEventListener('click', ()=> {
        const tabBtn = document.querySelector('.tab-btn[data-tab="booking-flow"]');
        if (tabBtn) {
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          tabBtn.classList.add('active');
        }
        if (typeof window.showTab === 'function') window.showTab('booking-flow');
        if (typeof window.selectPatient === 'function') {
          window.selectPatient(p);
        } else {
          APP.pendingSelectCpf = p.cpf;
          const cpfInput = document.getElementById('cpfInput');
          if (cpfInput) {
            cpfInput.value = p.nome;
            const btnSearch = document.getElementById('btnSearch');
            if (btnSearch) btnSearch.click();
          }
        }
      });

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

  /* ---------- UI helpers ---------- */
  function clearRegisterFields() {
    if (regNome) regNome.value = '';
    if (regCPF) regCPF.value = '';
    if (regNascimento) regNascimento.value = '';
    if (regTelefone) regTelefone.value = '';
    if (regEmail) regEmail.value = '';
    editingCpfOriginal = null;
    const regPanelTitle = document.getElementById('regPanelTitle');
    if (regPanelTitle) regPanelTitle.textContent = "Novo Cadastro de Pacientes";
    if (registerMsg) {
      registerMsg.textContent = '';
      registerMsg.style.color = '';
    }
  }

  /* ---------- search helper used by appointments module ---------- */
  function findPatientsByTerm(searchTerm) {
    const term = (searchTerm || '').trim();
    if (!term) return [];
    const digits = term.replace(/\D/g,'');
    const tokens = normalizeString(term).split('').length ? normalizeString(term).split(/\s+/).filter(Boolean) : [];

    return APP.allPatients.filter(p => {
      const cpfDigits = (p.cpf || '').toString().replace(/\D/g,'');
      const telDigits = (p.telefone || '').toString().replace(/\D/g,'');
      if (digits && (cpfDigits.includes(digits) || telDigits.includes(digits))) return true;
      if (tokens.length) {
        const nameNorm = normalizeString(p.nome || '');
        return tokens.every(t => nameNorm.includes(t));
      }
      return false;
    });
  }

  // expose public funcs/state
  APP.findPatientsByTerm = findPatientsByTerm;
  APP.renderRegisteredPatients = renderRegisteredPatients;
  APP.initPatients = initPatients;
  APP.clearRegisterFields = clearRegisterFields;
  APP.savePatientAction = savePatientAction;
  APP.startEditPatient = startEditPatient;
  APP.deletePatient = deletePatient;
  APP.mergePatientLists = mergePatientLists;
  APP.maskCPF = maskCPF;

  /* ---------- Event bindings ---------- */
  if (btnSavePatient) btnSavePatient.addEventListener('click', async () => {
    const ok = await savePatientAction();
    if (ok) {
      renderRegisteredPatients();
      if (typeof window.renderAppointments === 'function') window.renderAppointments();
    }
  });
  if (btnClearRegister) btnClearRegister.addEventListener('click', () => clearRegisterFields());
  if (filterRegInput) {
    filterRegInput.addEventListener('input', () => renderRegisteredPatients());
    filterRegInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        renderRegisteredPatients();
        const fb = document.getElementById('filterFeedback');
        if (fb) {
          fb.style.transition = 'opacity 0.3s';
          fb.style.opacity = '0.3';
          setTimeout(() => { fb.style.opacity = '1'; }, 150);
        }
      }
    });
  }
  if (btnRefreshPatients) btnRefreshPatients.addEventListener('click', async () => {
    registerMsg.textContent = "Atualizando lista...";
    try {
      await initPatients();
      registerMsg.textContent = "Lista atualizada.";
      registerMsg.style.color = "#065f46";
    } catch(e) {
      registerMsg.textContent = "Erro ao atualizar.";
      registerMsg.style.color = "#b91c1c";
    }
    setTimeout(()=> { if (registerMsg) { registerMsg.textContent = ''; } }, 2500);
  });

  document.addEventListener('DOMContentLoaded', () => {
    APP.initPatients();
  });
})();
