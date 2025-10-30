// appointments.js
// Agendamento, timeline, modal, exibição de appointments.
// Usa window.APP (patients.js) e window.SUPA (supabaseConfig.js)

(function () {
  const APP = window.APP || (window.APP = {});
  APP.appointments = JSON.parse(localStorage.getItem('ads_appointments') || '[]');

  // Configs
  const NUMERO_CLINICA = "5561998480130";
  const MAX_TIME = "18:00";
  const TRES_MESES_EM_DIAS = 90;

  // DOM
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
  const appointmentsListSection = document.getElementById('appointments-list-section');
  const appointmentsCard = document.getElementById('appointmentsCard');

  // state
  APP.selectedTime = null;
  APP.selectedDate = null;
  APP.selectedDuration = 30;
  APP.remarqueeId = null;
  APP.foundPatient = null;

  // time slots
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

  /* ---------- helper utilities ---------- */
  function timeToMinutes(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
  function minutesToTime(m){ const h=Math.floor(m/60); const mm=m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }
  function cryptoRandomId(){ return Math.random().toString(36).slice(2,9); }
  function maskCPF(cpf){ if(/^\d{11}$/.test(cpf)) return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4"); return cpf; }
  function formatDate(d){ if(!d) return '-'; const dt = new Date(d+'T00:00:00'); if(isNaN(dt)) return d; return dt.toLocaleDateString('pt-BR'); }
  function formatPhone(tel){ if(!tel) return tel; let num = tel.replace(/\D/g,''); if(num.startsWith('55') && num.length>11) num = num.slice(2); const ddd = num.slice(0,2); const corpo = num.slice(2); if(corpo.length===9) return `(${ddd}) ${corpo.slice(0,5)}-${corpo.slice(5)}`; if(corpo.length===8) return `(${ddd}) ${corpo.slice(0,4)}-${corpo.slice(4)}`; return tel; }

  /* ---------- show/hide tabs ---------- */
  window.showTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    // show requested
    const el = document.getElementById(tabId);
    if (el) el.classList.remove('hidden');
    // appointments list is shown only when booking tab is active
    if (tabId === 'booking-flow') {
      if (appointmentsListSection) appointmentsListSection.classList.remove('hidden');
    } else {
      if (appointmentsListSection) appointmentsListSection.classList.add('hidden');
    }
  };

/* ---------- search in booking flow ---------- */
function onSearch() {
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

  // 🔹 Usa a função já existente em patients.js
  const matches = (typeof APP.findPatientsByTerm === 'function')
    ? APP.findPatientsByTerm(searchTerm)
    : [];

  if (!matches || matches.length === 0) {
    if (searchMsg) {
      searchMsg.textContent = "Paciente não encontrado. Cadastre-o na aba 'Cadastro de Pacientes'.";
      searchMsg.style.color = "#b91c1c";
    }
    return;
  }

  if (matches.length === 1) {
    selectPatient(matches[0]);
    if (searchMsg) {
      searchMsg.textContent = "Paciente localizado.";
      searchMsg.style.color = "#065f46";
    }
  } else {
    if (searchMsg) {
      searchMsg.textContent = "Múltiplos pacientes encontrados. Selecione na lista.";
      searchMsg.style.color = "#b45309";
    }
    renderSelectionList(matches);
  }
}

/* 🔹 Busca dinâmica enquanto digita no campo CPF/Nome/Telefone */
if (cpfInput) {
  let searchTimeout;
  cpfInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const termo = cpfInput.value.trim();

      if (termo.length === 0) {
        if (searchMsg) {
          searchMsg.textContent = "Insira CPF, Nome ou Telefone para buscar.";
          searchMsg.style.color = "#b45309";
        }
        if (patientSelectionPanel) patientSelectionPanel.classList.add('hidden');
        return;
      }

      onSearch(); // chama a busca normal, mas agora automaticamente
    }, 400); // aguarda 0.4s depois do usuário parar de digitar
  });
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
    const p = APP.allPatients.find(x => x.cpf === cpf);
    if (p) {
      selectPatient(p);
      if (patientSelectionPanel) patientSelectionPanel.classList.add('hidden');
      if (searchMsg) { searchMsg.textContent = "Paciente localizado."; searchMsg.style.color = "#065f46"; }
    }
  }

  // expose selectPatient globally so patients.js can call when clicking "Selecionar" there
  window.selectPatient = function(p){
    APP.foundPatient = p;
    showPatient(p);
    if (bookingSection) bookingSection.classList.remove('hidden');
    // auto open booking section if needed
    if (typeof window.showTab === 'function') window.showTab('booking-flow');
  };

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
    APP.foundPatient = null;
    if (patientPanel) patientPanel.classList.add('hidden');
    if (bookingSection) bookingSection.classList.add('hidden');
  }

  function updateScheduleButtonText(isRemarcar=false){
    if (btnSchedule) btnSchedule.textContent = isRemarcar ? "Remarcar Consulta" : "Agendar";
  }

  /* ---------- appointments persistence ---------- */
  function saveAppointments() {
    localStorage.setItem('ads_appointments', JSON.stringify(APP.appointments));
  }
  function loadAppointments() {
    try { const raw = localStorage.getItem('ads_appointments'); return raw ? JSON.parse(raw) : []; }
    catch(e){ console.error('Erro ao carregar appointments', e); return []; }
  }

  /* ---------- rescheduling ---------- */
  function remarcarAppointment(appId){
    const appt = APP.appointments.find(a => a.id === appId);
    if (!appt) return;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const tabBtn = document.querySelector('.tab-btn[data-tab="booking-flow"]');
    if (tabBtn) tabBtn.classList.add('active');
    if (typeof window.showTab === 'function') window.showTab('booking-flow');
    APP.remarqueeId = appId; if (remarqueeIdInput) remarqueeIdInput.value = appId;
    if (cpfInput) cpfInput.value = appt.cpf;
    onSearch();
    document.querySelectorAll('.duration-btn').forEach(x => x.classList.remove('selected'));
    const targetBtn = document.querySelector(`.duration-btn[data-minutes="${appt.duration}"]`);
    if (targetBtn) targetBtn.classList.add('selected');
    APP.selectedDuration = appt.duration;
    if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });
  }

  function clearBookingFields() {
    APP.selectedTime = null; APP.selectedDate = null;
    if (datePick) datePick.value = "";
    if (obsText) obsText.value = "";
    if (btnSchedule) btnSchedule.disabled = true;
    document.querySelectorAll('.duration-btn').forEach(x => x.classList.remove('selected'));
    const defaultBtn = document.querySelector('.duration-btn[data-minutes="30"]');
    if (defaultBtn) defaultBtn.classList.add('selected');
    APP.selectedDuration = 30;
    APP.remarqueeId = null; if (remarqueeIdInput) remarqueeIdInput.value = "";
    updateScheduleButtonText(false);
  }

  /* ---------- render time slots ---------- */
  function isSlotTaken(startH, duration, apptsDoDia) {
    const startMins = timeToMinutes(startH);
    const endMins = startMins + duration;

    // Verifica se o horário novo invade qualquer horário já marcado
    return apptsDoDia.some(appt => {
      const apptStart = timeToMinutes(appt.time);
      const apptEnd = apptStart + (appt.duration || 30);

      // Há conflito se o início de um estiver dentro do outro intervalo
      const overlap = (startMins < apptEnd && endMins > apptStart);
      return overlap;
    });
  }


  function renderTimes(){
    if (!timesDiv) return;
    timesDiv.innerHTML = "";
    APP.selectedTime = null;
    if (btnSchedule) btnSchedule.disabled = true;
    if (!APP.selectedDate && datePick) APP.selectedDate = datePick.value || null;
    if (!APP.selectedDate) return;
    const apptsDoDia = APP.appointments.filter(a => a.date === APP.selectedDate && a.id !== APP.remarqueeId);
    ALL_TIME_SLOTS.forEach(h => {
      const isTaken = isSlotTaken(h, APP.selectedDuration, apptsDoDia);
      const endMins = timeToMinutes(h) + APP.selectedDuration;
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
          APP.selectedTime = h;
          if (btnSchedule) btnSchedule.disabled = false;
          if (bookingMsg) { bookingMsg.textContent = `Horário selecionado: ${formatDate(APP.selectedDate)} às ${APP.selectedTime} (${APP.selectedDuration} min)`; bookingMsg.style.color = "#065f46"; }
        });
      }
      timesDiv.appendChild(btn);
    });
  }

/* ---------- schedule ---------- */
async function scheduleSelected() {
  if (!APP.foundPatient || !APP.selectedDate || !APP.selectedTime || !APP.selectedDuration) {
    if (bookingMsg) {
      bookingMsg.textContent = "Selecione paciente, duração, data e horário.";
      bookingMsg.style.color = "#b91c1c";
    }
    return;
  }

  const apptsDoDia = APP.appointments.filter(
    (a) => a.date === APP.selectedDate && a.id !== APP.remarqueeId
  );

  if (isSlotTaken(APP.selectedTime, APP.selectedDuration, apptsDoDia)) {
    if (bookingMsg) {
      bookingMsg.textContent = "Horário já ocupado, escolha outro.";
      bookingMsg.style.color = "#b91c1c";
    }
    renderTimes();
    return;
  }

  const obs = obsText?.value.trim();
  // id local temporário (substituído pelo remoto após sync)
  const localId = APP.remarqueeId || cryptoRandomId();
  const newApp = {
    id: localId,
    cpf: APP.foundPatient.cpf,
    nome: APP.foundPatient.nome,
    telefone: APP.foundPatient.telefone,
    email: APP.foundPatient.email,
    date: APP.selectedDate,
    time: APP.selectedTime,
    duration: APP.selectedDuration,
    observacao: obs,
    createdAt: new Date().toISOString(),
  };

  const isRemarcar = !!APP.remarqueeId;
  const confirmationMsg = isRemarcar ? "remarcada com sucesso" : "agendada com sucesso";

  // Remove item antigo se for remarcação local
  if (isRemarcar) {
    APP.appointments = APP.appointments.filter((a) => a.id !== APP.remarqueeId);
  }
  // adiciona localmente com id temporário
  APP.appointments.push(newApp);
  saveAppointments();
  renderAppointments();
  renderTimeline();
  if (dashboardDatePick?.value === newApp.date) renderDailyDashboard(newApp.date);

  // Gera nome curto (ignora preposições)
  function getNomeCurto(nomeCompleto) {
    if (!nomeCompleto) return "Paciente";
    const partes = nomeCompleto.trim().split(/\s+/);
    if (partes.length === 1) return partes[0];
    const preposicoes = ["de", "da", "do", "dos", "das"];
    const nomesFiltrados = partes.filter((p) => !preposicoes.includes(p.toLowerCase()));
    if (nomesFiltrados.length >= 2) {
      return `${nomesFiltrados[0]} ${nomesFiltrados[nomesFiltrados.length - 1]}`;
    } else {
      return nomesFiltrados[0];
    }
  }

  const nomeCurto = getNomeCurto(newApp.nome);
  const humanDate = formatDate(newApp.date);

  let msg = `Olá, ${nomeCurto}!\n\nSua consulta com a Dra. Kaline Ramos foi ${
    isRemarcar ? "remarcada" : "agendada"
  } para o dia ${humanDate}, às ${newApp.time}.\nDuração prevista: ${newApp.duration} minutos.`;

  if (newApp.observacao) {
    msg += `\nMotivo: ${newApp.observacao}.`;
  }

  msg += `\n\nPor favor, confirme sua presença respondendo Sim.\n\nObs.: Caso precise remarcar, pedimos que avise com antecedência.`;

  // Define telefone destino
  const telefoneDestino = newApp.telefone || NUMERO_CLINICA;

  // Mostra o modal com texto e link corretos
  showModal(telefoneDestino, msg);

  // --- Envia para Supabase e sincroniza o id remoto ---
  if (APP.supabaseAvailable && window.SUPA?.insertAppointmentToSupabase) {
    try {
      const created = await window.SUPA.insertAppointmentToSupabase(newApp);
      // created deve ser o objeto retornado com .id (UUID). Se null/false => erro.
      if (created && (created.id || created.remote_id || created.ID)) {
        // detecta campo de id no retorno (ID pode variar de naming)
        const remoteId = created.id || created.remote_id || created.ID || created.uuid || created._id;
        // atualiza localmente: encontra pelo id temporário e substitui
        const idx = APP.appointments.findIndex(a => a.id === localId);
        if (idx !== -1) {
          APP.appointments[idx].remote_id = remoteId;
          APP.appointments[idx].id = remoteId; // sincroniza id para usar na exclusão
          // atualiza createdAt se retornar algo padronizado
          if (created.created_at) APP.appointments[idx].createdAt = created.created_at;
          saveAppointments();
          console.info('✅ Consulta sincronizada com Supabase. remote_id:', remoteId);
        } else {
          // se não encontrou, faz um push seguro
          const synced = { ...newApp, remote_id: remoteId, id: remoteId, createdAt: created.created_at || newApp.createdAt };
          APP.appointments.push(synced);
          saveAppointments();
        }
      } else {
        console.warn('⚠️ Falha ao sincronizar consulta com Supabase (retorno inválido).');
      }
    } catch (e) {
      console.error('Erro ao inserir consulta no Supabase', e);
    }
  }

  clearBookingFields();

  if (bookingMsg) {
    bookingMsg.textContent = `Consulta ${confirmationMsg}!`;
    bookingMsg.style.color = "#065f46";
  }
}


/* ---------- render appointments list (global) ---------- */
window.renderAppointments = function() {
  if (!appointmentsTableBody) return;
  appointmentsTableBody.innerHTML = "";

  const filterText = (filterInput?.value || "").toLowerCase().trim();
  const filtered = APP.appointments
    .filter(app => {
      if (!filterText) return true;
      const nomeMatch = (app.nome || "").toLowerCase().includes(filterText);
      const cpfMatch = (app.cpf || "").includes(filterText) || maskCPF(app.cpf || "").includes(filterText);
      const dateMatch = (app.date || "").includes(filterText) || formatDate(app.date || "").includes(filterText);
      return nomeMatch || cpfMatch || dateMatch;
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (filtered.length === 0) {
    appointmentsTableBody.innerHTML = `<tr><td colspan="8" class="muted">Nenhuma consulta agendada.</td></tr>`;
    return;
  }

  filtered.forEach(app => {
    const tr = document.createElement("tr");
    tr.classList.add(`duration-${app.duration}`);

    const tdNome = document.createElement("td"); tdNome.textContent = app.nome;
    const tdDate = document.createElement("td"); tdDate.textContent = formatDate(app.date);
    const tdTime = document.createElement("td"); tdTime.textContent = app.time;
    const tdDuration = document.createElement("td"); tdDuration.textContent = `${app.duration} min`;

    const tdContact = document.createElement("td");
    const wa = document.createElement("a");
    wa.href = `https://wa.me/${app.telefone}?text=${encodeURIComponent(`Olá ${app.nome}, sua consulta está agendada para ${formatDate(app.date)} às ${app.time}. Duração: ${app.duration} min.`)}`;
    wa.target = "_blank";
    wa.textContent = formatPhone(app.telefone || "");
    tdContact.appendChild(wa);

    const tdEmail = document.createElement("td"); tdEmail.textContent = app.email || "-";
    const tdObs = document.createElement("td"); tdObs.textContent = app.observacao || "-"; tdObs.className = "obs-cell";

    const tdActions = document.createElement("td");
    const btnRemarcar = document.createElement("button");
    btnRemarcar.textContent = "Remarcar";
    btnRemarcar.className = "primary";
    btnRemarcar.style.marginRight = "5px";
    btnRemarcar.addEventListener("click", () => remarcarAppointment(app.id));

    const btnDel = document.createElement("button");
    btnDel.textContent = "Remover";
    btnDel.className = "secondary";

    btnDel.addEventListener("click", () => {
      if (!confirm(`Remover agendamento de ${app.nome} em ${formatDate(app.date)} às ${app.time}?`)) return;

      (async () => {
        try {
          // tenta excluir no Supabase usando remote_id (prefer) ou id
          const remoteId = app.remote_id || app.id;
          let deletedOnSupabase = false;

          if (APP.supabaseAvailable && remoteId && window.SUPA?.deleteAppointmentFromSupabase) {
            try {
              deletedOnSupabase = await window.SUPA.deleteAppointmentFromSupabase(remoteId);
              console.info("🗑️ Exclusão Supabase via id:", deletedOnSupabase);
            } catch (err) {
              console.warn("Tentativa de exclusão por id falhou:", err);
              deletedOnSupabase = false;
            }
          }

          // Se não conseguiu deletar por id, tenta deletar por combinação única (cpf+date+time) — fallback REST
          if (!deletedOnSupabase && APP.supabaseAvailable && window.SUPA) {
            try {
              // endpoint que remove por cpf,date,time — útil quando id não corresponde
              const cpfEsc = encodeURIComponent(app.cpf || "");
              const dateEsc = encodeURIComponent(app.date || "");
              const timeEsc = encodeURIComponent(app.time || "");
              const endpoint = `${window.SUPA.TABELA_CONSULTAS}?cpf=eq.${cpfEsc}&date=eq.${dateEsc}&time=eq.${timeEsc}`;
              const res = await (async function(){
                // fazemos uma chamada direta similar a supabaseFetch
                const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
                const baseHeaders = {
                  'apikey': SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                  'Content-Type': 'application/json'
                };
                return fetch(url, { method: 'DELETE', mode: 'cors', headers: baseHeaders });
              })();
              if (res && res.ok) {
                deletedOnSupabase = true;
                console.info("🗑️ Exclusão Supabase via cpf+date+time: ok");
              } else {
                const errText = res ? await res.text() : "no response";
                console.warn("Falha exclusão via cpf+date+time:", errText);
              }
            } catch (err) {
              console.error("Erro no fallback de exclusão Supabase:", err);
            }
          }

          // No final: sempre remove localmente para manter UI consistente
        } catch (err) {
          console.error("Erro ao tentar excluir no Supabase:", err);
        } finally {
          APP.appointments = APP.appointments.filter(x => x.id !== app.id);
          saveAppointments();
          renderAppointments();
          renderTimes();
          renderTimeline();
          renderDailyDashboard(dashboardDatePick?.value);
        }
      })();
    });

    tdActions.appendChild(btnRemarcar);
    tdActions.appendChild(btnDel);

    tr.appendChild(tdNome);
    tr.appendChild(tdDate);
    tr.appendChild(tdTime);
    tr.appendChild(tdDuration);
    tr.appendChild(tdContact);
    tr.appendChild(tdEmail);
    tr.appendChild(tdObs);
    tr.appendChild(tdActions);
    appointmentsTableBody.appendChild(tr);
  });
};


  /* ---------- daily dashboard ---------- */
  function renderDailyDashboard(date) {
    if (!date) return;
    if (dailyAppointmentsTitle) dailyAppointmentsTitle.textContent = `Consultas agendadas para ${formatDate(date)}`;
    const apptsDoDia = APP.appointments.filter(a => a.date === date).sort((a,b) => a.time.localeCompare(b.time));
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
  if (!date) {
    targetElement.innerHTML = `<p class="muted">Selecione uma data para ver a linha do tempo.</p>`;
    return;
  }

  const apptsDoDia = APP.appointments
    .filter(a => a.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));

  let current = 0;
  ALL_TIME_SLOTS.forEach(slot => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    let slotBooked = false;
    let info = null;

    if (current < apptsDoDia.length) {
      const next = apptsDoDia[current];
      if (timeToMinutes(next.time) === timeToMinutes(slot)) {
        slotBooked = true;
        info = next;
        current++;
      }
    }

    if (!slotBooked) {
      const ongoing = apptsDoDia.find(appt => {
        const apptStart = timeToMinutes(appt.time);
        const apptEnd = apptStart + appt.duration;
        const sStart = timeToMinutes(slot);
        return sStart > apptStart && sStart < apptEnd;
      });
      if (!ongoing) {
        item.innerHTML = `<span class="time-slot">${slot}</span> <span class="patient-name">Livre</span>`;
      }
    }

    if (slotBooked && info) {
      item.classList.add(`booked-${info.duration}`);
      const end = minutesToTime(timeToMinutes(info.time) + info.duration);
      item.innerHTML = `
        <span class="time-slot">${info.time}</span>
        <span class="patient-name">${info.nome}</span>
        <span class="duration-tag">${info.duration} min (até ${end})</span>
      `;
      // 🔹 Novo: clique para ver detalhes
      item.style.cursor = "pointer";
      item.addEventListener("click", () => showAppointmentDetails(info));
    }

    if (item.innerHTML) targetElement.appendChild(item);
  });
}

  function showAppointmentDetails(appt) {
  const msg = `
    <strong>Paciente:</strong> ${appt.nome}<br>
    <strong>Data:</strong> ${formatDate(appt.date)}<br>
    <strong>Horário:</strong> ${appt.time}<br>
    <strong>Duração:</strong> ${appt.duration} minutos<br>
    <strong>Telefone:</strong> ${formatPhone(appt.telefone)}<br>
    <strong>Email:</strong> ${appt.email || '-'}<br>
    <strong>Observação:</strong> ${appt.observacao || '-'}
  `;

  // Reutiliza o modal existente para mostrar detalhes
  const modalText = document.getElementById("modalText");
  if (modalText) modalText.innerHTML = msg;

  const waLink = document.getElementById("waLink");
  if (waLink) {
    const texto = `Olá ${appt.nome}, sua consulta está marcada para ${formatDate(appt.date)} às ${appt.time}.`;
    waLink.href = `https://wa.me/${appt.telefone}?text=${encodeURIComponent(texto)}`;
  }

  const copyBtn = document.getElementById("copyBtn");
  const closeBtn = document.getElementById("closeModal");

  // Substitui ações do modal
  if (copyBtn) {
    copyBtn.textContent = "Remarcar";
    copyBtn.onclick = () => {
      closeModalAction();
      remarcarAppointment(appt.id);
    };
  }

  if (closeBtn) {
    closeBtn.textContent = "Remover";
    closeBtn.onclick = () => {
      if (confirm(`Remover o agendamento de ${appt.nome} às ${appt.time}?`)) {
        APP.appointments = APP.appointments.filter(a => a.id !== appt.id);
        localStorage.setItem('ads_appointments', JSON.stringify(APP.appointments));
        renderAppointments();
        renderTimeline();
        closeModalAction();
      }
    };
  }

  // Mostra o modal
  if (modal) {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }
}


  function renderTimeline() {
    const date = APP.selectedDate || (dashboardDatePick?.value || null);
    renderTimelineForDashboard(date, timelineBody);
  }

  function exportDailyAppointmentsToCSV(date) {
    const appts = APP.appointments.filter(a => a.date === date).sort((a,b)=>a.time.localeCompare(b.time));
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

/* ---------- modal / copy ---------- */
function showModal(telefone_clinica, mensagem) {
  const modalText = document.getElementById('modalText');
  const waLink = document.getElementById('waLink');
  const copyBtn = document.getElementById('copyBtn');
  const closeBtn = document.getElementById('closeModal');

  // 🔹 Formata a mensagem para HTML (negrito e quebras de linha)
  const formatMessageForModal = (text) => {
    return text
      .replace(/\*(.*?)\*/g, "<strong>$1</strong>") // transforma *texto* em negrito
      .replace(/\n/g, "<br>"); // preserva quebras de linha
  };

  // 🔹 Atualiza o texto do modal com formatação
  if (modalText) {
    modalText.innerHTML = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; font-size: 15px;">
        ${formatMessageForModal(mensagem)}
      </div>
    `;
  }

  // Reconfigura os botões para o estado padrão (confirmação de agendamento)
  if (copyBtn) {
    copyBtn.textContent = "Copiar mensagem";
    copyBtn.onclick = () => {
      const text = mensagem.replace(/\*/g, ""); // copia o texto limpo (sem marcações)
      navigator.clipboard.writeText(text)
        .then(() => {
          copyBtn.textContent = "Copiado!";
          setTimeout(() => (copyBtn.textContent = "Copiar mensagem"), 1500);
        })
        .catch(() => alert("Não foi possível copiar a mensagem."));
    };
  }

  if (closeBtn) {
    closeBtn.textContent = "Fechar";
    closeBtn.onclick = () => closeModalAction();
  }

  // Configura o link do WhatsApp normalmente
  if (waLink) {
    // 🔹 Usa o telefone do paciente, se existir
    const telefoneDestino = APP.foundPatient?.telefone || telefone_clinica;
    waLink.href = `https://wa.me/${telefoneDestino}?text=${encodeURIComponent(mensagem)}`;
  }

  // Mostra o modal
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
}


  /* ---------- init UI and listeners ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    // date limits
    const hoje = new Date();
    const hojeString = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
    if (datePick) datePick.min = hojeString;
    if (dashboardDatePick) dashboardDatePick.min = hojeString;
    const maxDate = new Date(hoje.getTime() + TRES_MESES_EM_DIAS * 24*60*60*1000);
    const md = `${maxDate.getFullYear()}-${String(maxDate.getMonth()+1).padStart(2,'0')}-${String(maxDate.getDate()).padStart(2,'0')}`;
    if (datePick) datePick.max = md;
    if (dashboardDatePick) dashboardDatePick.max = md;

    // init durations
    const defaultBtn = document.querySelector('.duration-btn[data-minutes="30"]');
    if (defaultBtn) defaultBtn.classList.add('selected');

    // show first tab
    window.showTab('patient-register');
    if (dashboardDatePick) {
      const hojeVal = hojeString;
      dashboardDatePick.value = hojeVal;
      renderDailyDashboard(hojeVal);
    }
    // selection list click
    if (selectionList) {
      selectionList.addEventListener('click', (e) => {
        const selectedCpf = e.target.closest('.selection-item')?.dataset.cpf;
        if (selectedCpf) selectPatientByCpf(selectedCpf);
      });
    }
    // tabs nav
    if (tabsNav) {
      tabsNav.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn) {
          document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
          tabBtn.classList.add('active');
          window.showTab(tabBtn.dataset.tab);
          // if switching to patient-register, refresh patient list
          if (tabBtn.dataset.tab === 'patient-register' && typeof APP.renderRegisteredPatients === 'function') APP.renderRegisteredPatients();
          // if switching to booking, show appointments list as well
          if (tabBtn.dataset.tab === 'booking-flow') {
            if (appointmentsListSection) appointmentsListSection.classList.remove('hidden');
            renderAppointments();
          } else {
            if (appointmentsListSection) appointmentsListSection.classList.add('hidden');
          }
        }
      });
    }

/* ---------- listeners (substituir bloco existente) ---------- */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initListeners);
} else {
  initListeners();
}

function initListeners() {
  // Busca/filtra paciente na aba Agendamento enquanto digita (debounce)
  if (cpfInput) {
    let cpfTimeout;
    cpfInput.addEventListener('input', () => {
      clearTimeout(cpfTimeout);
      cpfTimeout = setTimeout(() => {
        onSearch();
      }, 250);
    });
    // também mantém Enter para compatibilidade
    cpfInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') onSearch(); });
  }

  // Botão de buscar (caso use)
  if (btnSearch) btnSearch.addEventListener('click', onSearch);

  // Date pick change
  if (datePick) datePick.addEventListener('change', () => { APP.selectedDate = datePick.value || null; renderTimes(); renderTimeline(); });

  // Agendar / limpar
  if (btnSchedule) btnSchedule.addEventListener('click', scheduleSelected);
  if (btnClear) btnClear.addEventListener('click', clearBookingFields);

  // Botão padrão do modal (copiar) — mantém comportamento
// Safe copy button listener: chama copyModalText se existir; fallback copia texto do modal
const copyBtnEl = document.getElementById('copyBtn');
if (copyBtnEl) {
  copyBtnEl.addEventListener('click', () => {
    if (typeof copyModalText === 'function') {
      copyModalText();
      return;
    }
    if (typeof window.copyModalText === 'function') {
      window.copyModalText();
      return;
    }
    // fallback: copia manualmente do modalText
    const modalText = document.getElementById('modalText');
    if (modalText) {
      navigator.clipboard.writeText(modalText.textContent.trim())
        .then(() => {
          copyBtnEl.textContent = "Copiado!";
          setTimeout(() => (copyBtnEl.textContent = "Copiar mensagem"), 1500);
        })
        .catch(() => alert("Não foi possível copiar a mensagem."));
    }
  });
}


  // Duração (30/60)
  if (durationOptions) durationOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.duration-btn');
    if (btn) {
      document.querySelectorAll('.duration-btn').forEach(x => x.classList.remove('selected'));
      btn.classList.add('selected');
      APP.selectedDuration = parseInt(btn.dataset.minutes, 10);
      APP.selectedTime = null;
      renderTimes();
    }
  });

/* 🔹 Filtro dinâmico da Lista Completa de Agendamentos (melhorado e mais estável) */
const filterField = document.getElementById('filterInput');

if (filterField) {
  let typingTimeout;
  filterField.addEventListener('input', () => {
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      if (typeof renderAppointments === 'function') {
        renderAppointments();
      }
    }, 200); // atualiza 0.2s após parar de digitar
  });
  console.log("✅ Filtro dinâmico ativado na Lista Completa de Agendamentos.");
} else {
  console.warn("⚠️ Campo de filtro (filterInput) não encontrado no DOM.");
}


  // Export CSV / dashboard date change
  if (btnExportCsv) btnExportCsv.addEventListener('click', () => exportDailyAppointmentsToCSV(dashboardDatePick.value));
  if (dashboardDatePick) dashboardDatePick.addEventListener('change', (e) => renderDailyDashboard(e.target.value));

  // Botão atualizar dashboard (mantém)
  const refreshBtn = document.getElementById('btnRefreshDashboard');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshDailyDashboard);

  // Clique na lista de seleção (quando múltiplos resultados)
  if (selectionList) {
    selectionList.addEventListener('click', (e) => {
      const selectedCpf = e.target.closest('.selection-item')?.dataset.cpf;
      if (selectedCpf) selectPatientByCpf(selectedCpf);
    });
  }

  // Fechamento do modal (botão e clique fora)
  const closeModalBtn = document.getElementById('closeModal');
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModalAction);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModalAction(); });

  // renderizações iniciais (se já não estiverem)
  renderAppointments();
  renderTimeline();
}


    function refreshDailyDashboard() {
  const selectedDate = dashboardDatePick.value;
  if (!selectedDate) {
    alert("Selecione uma data antes de atualizar.");
    return;
  }

  // Recarrega os agendamentos atuais (do localStorage ou Supabase no futuro)
  appointments = loadAppointments();

  // Atualiza a exibição da agenda e timeline
  renderDailyDashboard(selectedDate);

  // Feedback visual
  const btn = document.getElementById('btnRefreshDashboard');
  btn.textContent = "Atualizado!";
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = "Atualizar";
    btn.disabled = false;
  }, 1500);
}

    // initial renders
    renderAppointments();
    renderTimeline();
  });

/* ---------- garantia de funcionamento do seletor de duração ---------- */
if (durationOptions) {
  durationOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.duration-btn');
    if (btn) {
      document.querySelectorAll('.duration-btn').forEach(x => x.classList.remove('selected'));
      btn.classList.add('selected');
      APP.selectedDuration = parseInt(btn.dataset.minutes, 10);
      APP.selectedTime = null;
      renderTimes();
    }
  });
}


  // expose some functions for other modules
  window.renderTimeline = renderTimeline;
  window.renderAppointments = window.renderAppointments;
  window.renderDailyDashboard = renderDailyDashboard;
  window.saveAppointments = saveAppointments;
  window.selectPatientByCpf = selectPatientByCpf;
  window.showModal = showModal;

  /* ---------- fechamento do modal ---------- */
function closeModalAction() {
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

// 🔹 Fecha ao clicar no botão “Fechar”
const closeModalBtn = document.getElementById('closeModal');
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', closeModalAction);
}

// 🔹 Fecha ao clicar fora do modal
if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModalAction();
    }
  });
}

})();
