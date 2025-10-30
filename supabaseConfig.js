// supabaseConfig.js
// Centraliza a comunicação com Supabase (REST) e exporta funções usadas pelos outros módulos.

const SUPABASE_URL = 'https://tasoqpfyjzlnnqmphjmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhc29xcGZ5anpsbm5xbXBoam1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzM0NzIsImV4cCI6MjA3NzI0OTQ3Mn0.6mbYEImKggwVXqnS5aWhcisAZLVYt_7QJg1UM0t3URg';

const TABELA_PACIENTES = 'pacientes';
const TABELA_CONSULTAS = 'consultas'; // tabela usada para os agendamentos

/* ---------- Base de requisição ---------- */
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

/* ---------- PACIENTES ---------- */
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

async function insertPatientToSupabase(patientData) {
  try {
    const res = await supabaseFetch(TABELA_PACIENTES, {
      method: 'POST',
      headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify(patientData)
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn('insertPatientToSupabase failed:', err);
      return false;
    }
    const created = await res.json();
    return created && created[0] ? created[0] : true;
  } catch (e) {
    console.warn('insertPatientToSupabase failed', e);
    return false;
  }
}

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

/* ---------- CONSULTAS (Agendamentos) ---------- */

// Lê todas as consultas do Supabase
async function loadAppointmentsFromSupabase() {
  try {
    const res = await supabaseFetch(`${TABELA_CONSULTAS}?select=*`, { method: 'GET' });
    if (!res.ok) throw new Error(`Supabase READ falhou: ${res.status}`);
    const data = await res.json();
    return data.map(c => ({
      remote_id: c.id, // id remoto (UUID Supabase)
      id: c.id, // manter id igual ao remoto para consistência
      cpf: (c.cpf || '').toString(),
      nome: c.nome,
      telefone: c.telefone,
      email: c.email,
      date: c.date,
      time: c.time,
      duration: c.duration || 30,
      observacao: c.observacao || '',
      createdAt: c.created_at || c.createdAt || null
    }));
  } catch (e) {
    console.warn('loadAppointmentsFromSupabase failed', e);
    return [];
  }
}

// Insere nova consulta e retorna o registro criado com UUID real
async function insertAppointmentToSupabase(appointmentData) {
  try {
    const { id, remote_id, createdAt, ...safeData } = appointmentData;

    if (safeData.date && safeData.date.includes('/')) {
      const [d, m, y] = safeData.date.split('/');
      safeData.date = `${y}-${m}-${d}`;
    }

    const res = await supabaseFetch(TABELA_CONSULTAS, {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(safeData)
    });

    if (res.ok) {
      const json = await res.json();
      const created = json[0];
      console.info('✅ Consulta salva no Supabase:', created);
      return created; // retorna objeto com o id UUID
    } else {
      const err = await res.text();
      console.warn('⚠️ Erro ao salvar consulta no Supabase:', err);
      return null;
    }
  } catch (e) {
    console.error('insertAppointmentToSupabase failed', e);
    return null;
  }
}

// Remove uma consulta no Supabase (usa id UUID)
async function deleteAppointmentFromSupabase(id) {
  try {
    if (!id) {
      console.warn('⚠️ Nenhum ID fornecido para exclusão no Supabase.');
      return false;
    }

    // faz o DELETE corretamente no Supabase
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABELA_CONSULTAS}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    });

    if (res.ok) {
      console.info(`🗑️ Consulta removida com sucesso do Supabase (id: ${id})`);
      return true;
    } else {
      const errText = await res.text();
      console.warn(`⚠️ Falha ao deletar no Supabase: ${res.status} - ${errText}`);
      return false;
    }
  } catch (e) {
    console.error('❌ deleteAppointmentFromSupabase falhou:', e);
    return false;
  }
}


/* ---------- Expor funções globalmente ---------- */
window.SUPA = {
  // pacientes
  loadPatientsFromSupabase,
  insertPatientToSupabase,
  updatePatientOnSupabase,
  deletePatientFromSupabase,

  // consultas
  loadAppointmentsFromSupabase,
  insertAppointmentToSupabase,
  deleteAppointmentFromSupabase,

  // tabelas
  TABELA_PACIENTES,
  TABELA_CONSULTAS
};
