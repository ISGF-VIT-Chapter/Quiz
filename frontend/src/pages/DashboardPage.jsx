import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { BACKEND_URL } from '../config';
import { useToast } from '../components/Toast';

const VIEWS = {
  HOME: 'home', REGISTRATION: 'registration', ROUND1: 'round1',
  BUZZER: 'buzzer', SCORING: 'scoring', OVERVIEW: 'overview', QSTATUS: 'question-status'
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const showToast = useToast();

  const token = localStorage.getItem('adminToken');
  const authH = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const [activeView, setActiveView] = useState(VIEWS.HOME);
  const [teams, setTeams] = useState([]);
  const [r1Live, setR1Live] = useState(false);
  const [r2Live, setR2Live] = useState(false);
  const [violations, setViolations] = useState([]);
  const [buzzLogs, setBuzzLogs] = useState([]);
  const [buzzerArmed, setBuzzerArmed] = useState(false);
  const [r1Data, setR1Data] = useState([]);
  const [r2Questions, setR2Questions] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [scoreTeam, setScoreTeam] = useState('');
  const [scoreQNum, setScoreQNum] = useState('');
  const [scoreAmount, setScoreAmount] = useState('');
  const [scoreLog, setScoreLog] = useState([]);
  const [r2StatusRows, setR2StatusRows] = useState([]);
  const [r2StatusFilter, setR2StatusFilter] = useState('answered');
  const [r2Stats, setR2Stats] = useState({ total: 0, answered: 0, unanswered: 0 });
  const [addTeamName, setAddTeamName] = useState('');
  const [addTeamCode, setAddTeamCode] = useState('');
  const [addTeamPass, setAddTeamPass] = useState('');

  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) { navigate('/admin'); return; }
    loadRounds();
    fetchTeams();
    fetchQuestions();

    const socket = io(BACKEND_URL);
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('joinAdmin'));
    socket.on('teamStatusChanged', () => fetchTeams());
    socket.on('roundStatusChanged', (data) => {
      if (data.roundNumber === 1) setR1Live(data.isLive);
      else setR2Live(data.isLive);
    });
    socket.on('quizViolation', (data) => addViolationToFeed(data));
    socket.on('teamBuzzed', (data) => {
      const theTime = new Date(data.buzzTimeMs).toISOString().substring(11, 23);
      setBuzzLogs(prev => [...prev, { team: data.teamName, time: theTime, diff: data.timeDiff || '0.000s' }]);
    });
    socket.on('buzzWinner', () => {
      setBuzzerArmed(false);
    });
    return () => socket.disconnect();
  }, []);

  // Auto-refresh R1 every 10s when that view is active
  useEffect(() => {
    if (activeView === VIEWS.ROUND1) {
      loadR1Results();
      const iv = setInterval(loadR1Results, 10000);
      return () => clearInterval(iv);
    }
    if (activeView === VIEWS.QSTATUS) loadR2QuestionStatus();
  }, [activeView]);

  function addViolationToFeed(data) {
    const labels = { tab_switch: 'Tab Switch', window_blur: 'Window Switch', fullscreen_exit: 'Fullscreen Exit' };
    const now = new Date().toTimeString().substring(0, 8);
    setViolations(prev => [{
      id: Date.now(), teamName: data.teamName || 'Unknown',
      count: data.violationCount, disqualified: data.disqualified,
      label: labels[data.reason] || data.reason, time: now
    }, ...prev]);
  }

  async function loadRounds() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/rounds`, { headers: authH });
      const data = await res.json();
      data.rounds.forEach(r => {
        if (r.roundNumber === 1) setR1Live(r.isLive);
        else setR2Live(r.isLive);
      });
    } catch {}
  }

  async function toggleRound(roundNumber) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/rounds/${roundNumber}/toggle`, { method: 'PUT', headers: authH });
      const data = await res.json();
      if (data.round.roundNumber === 1) setR1Live(data.round.isLive);
      else setR2Live(data.round.isLive);
      showToast(`Round ${roundNumber} is now ${data.round.isLive ? 'LIVE' : 'offline'}.`, data.round.isLive ? 'success' : 'info');
    } catch { showToast('Failed to toggle round.', 'error'); }
  }

  async function fetchTeams() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/teams`, { headers: authH });
      if (res.status === 401 || res.status === 403) { localStorage.removeItem('adminToken'); navigate('/admin'); return; }
      const data = await res.json();
      setTeams((data.teams || []).sort((a, b) => b.score - a.score));
    } catch {}
  }

  async function fetchQuestions() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/questions`, { headers: authH });
      const data = await res.json();
      const r2qs = (data.questions || []).filter(q => q.roundNumber === 2);
      setR2Questions(r2qs);
      if (r2qs.length) setSelectedQuestionId(r2qs[0].id);
    } catch {}
  }

  async function loadR1Results() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/quiz/results`, { headers: authH });
      const data = await res.json();
      setR1Data(data.teams || []);
    } catch {}
  }

  async function loadR2QuestionStatus() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/round2/status`, { headers: authH });
      const data = await res.json();
      setR2StatusRows(data.questions || []);
      setR2Stats({
        total: data.stats?.total ?? (data.questions || []).length,
        answered: data.stats?.answered ?? (data.questions || []).filter(r => r.answered).length,
        unanswered: data.stats?.unanswered ?? (data.questions || []).filter(r => !r.answered).length,
      });
    } catch {}
  }

  async function handleAddTeam(e) {
    e.preventDefault();
    await fetch(`${BACKEND_URL}/api/admin/teams`, {
      method: 'POST', headers: authH,
      body: JSON.stringify({ teamName: addTeamName, teamCode: addTeamCode, password: addTeamPass })
    });
    setAddTeamName(''); setAddTeamCode(''); setAddTeamPass('');
    showToast('Team Registered!', 'success');
    fetchTeams();
  }

  async function deleteTeam(id) {
    if (!confirm('Remove this team?')) return;
    await fetch(`${BACKEND_URL}/api/admin/teams/${id}`, { method: 'DELETE', headers: authH });
    fetchTeams();
  }

  async function forceLogoutTeam(id) {
    if (!confirm('Force logout this team?')) return;
    await fetch(`${BACKEND_URL}/api/admin/teams/${id}/logout`, { method: 'POST', headers: authH });
    fetchTeams();
  }

  async function handleArmBuzzer() {
    if (!selectedQuestionId) { showToast('Select a question first.', 'error'); return; }
    setBuzzerArmed(true);
    setBuzzLogs([]);
    await fetch(`${BACKEND_URL}/api/admin/buzzer/enable`, { method: 'POST', headers: authH, body: JSON.stringify({ questionId: selectedQuestionId }) });
  }

  async function handleDisableBuzzer() {
    setBuzzerArmed(false);
    await fetch(`${BACKEND_URL}/api/admin/buzzer/disable`, { method: 'POST', headers: authH });
  }

  async function handleSubmitScore() {
    if (!scoreTeam || isNaN(parseInt(scoreAmount))) { showToast('Select team and amount', 'error'); return; }
    const qNumValue = parseInt(scoreQNum, 10);
    if (isNaN(qNumValue)) { showToast('Enter a valid question number', 'error'); return; }
    const amt = parseInt(scoreAmount);
    try {
      await fetch(`${BACKEND_URL}/api/admin/teams/${scoreTeam}/score`, {
        method: 'PUT', headers: authH,
        body: JSON.stringify({ delta: amt, questionNumber: qNumValue, roundNumber: 2 })
      });
      const teamName = teams.find(t => t.id === scoreTeam)?.teamName || '';
      const timeLabel = new Date().toTimeString().substring(0, 8);
      setScoreLog(prev => [{ team: teamName, q: scoreQNum, amt, time: timeLabel }, ...prev]);
      showToast('Score updated!', 'success');
      setScoreAmount('');
      fetchTeams();
    } catch { showToast('Error updating score', 'error'); }
  }

  function handleLogout() {
    localStorage.removeItem('adminToken');
    navigate('/admin');
  }

  // R1 derived data
  const r1Sorted = [...r1Data].filter(t => t.session?.completedAt && !t.session?.isDisqualified).sort((a, b) => b.round1Score - a.round1Score);
  const r1Started = r1Data.filter(t => t.session).length;
  const r1Completed = r1Data.filter(t => t.session?.completedAt && !t.session?.isDisqualified).length;
  const r1DQ = r1Data.filter(t => t.session?.isDisqualified).length;

  const [expandedTeam, setExpandedTeam] = useState(null);

  // R2 filtered rows
  const r2Filtered = r2StatusRows.filter(r => {
    if (r2StatusFilter === 'answered') return r.answered;
    if (r2StatusFilter === 'unanswered') return !r.answered;
    return true;
  }).sort((a, b) => a.questionNumber - b.questionNumber);

  function rankIcon(rank) {
    if (rank === 1) return <span className="material-symbols-rounded" style={{ color: '#facc15', verticalAlign: 'middle' }}>workspace_premium</span>;
    if (rank === 2) return <span className="material-symbols-rounded" style={{ color: '#94a3b8', verticalAlign: 'middle' }}>military_tech</span>;
    if (rank === 3) return <span className="material-symbols-rounded" style={{ color: '#fb923c', verticalAlign: 'middle' }}>military_tech</span>;
    return `#${rank}`;
  }

  const navItems = [
    { id: VIEWS.HOME, icon: 'home', label: 'Home' },
    { id: VIEWS.REGISTRATION, icon: 'person_add', label: 'Team Registration' },
    { id: VIEWS.ROUND1, icon: 'quiz', label: 'Round 1 Results', badge: 'NEW' },
    { id: VIEWS.BUZZER, icon: 'notifications_active', label: 'Buzzer Control' },
    { id: VIEWS.SCORING, icon: 'assignment', label: 'Scoring Panel' },
    { id: VIEWS.OVERVIEW, icon: 'groups', label: 'Team Overview' },
    { id: VIEWS.QSTATUS, icon: 'query_stats', label: 'Question Status' },
  ];

  return (
    <>
      <style>{`
        .sidebar { background:linear-gradient(180deg,#4c1d95 0%,#312e81 100%); display:flex; flex-direction:column;
          padding:2rem 1rem; width:280px; z-index:100; color:white; box-sizing:border-box; height:100vh;
          position:sticky; top:0; overflow-y:auto; flex-shrink:0; }
        .nav-item { display:flex; align-items:center; gap:1rem; padding:0.9rem 1.25rem; color:#e0e7ff;
          text-decoration:none; font-weight:700; font-size:0.95rem; border-radius:8px; cursor:pointer;
          transition:all 0.2s; border:none; background:transparent; width:100%; text-align:left; font-family:'Nunito',sans-serif; }
        .nav-item:hover { background:rgba(255,255,255,0.1); color:white; }
        .nav-item.active { background:rgba(255,255,255,0.15); color:white; }
        .main-content { flex:1; height:100vh; overflow-y:auto; padding:2.5rem 3rem; background:var(--bg-color); scroll-behavior:smooth; }
        .table-container { background:var(--card-bg); border-radius:var(--radius-md); box-shadow:var(--shadow-soft);
          border:1px solid rgba(226,232,240,0.6); padding:1.5rem; margin-bottom:2rem; }
        table { width:100%; border-collapse:collapse; text-align:left; }
        th { padding:1rem; border-bottom:2px solid var(--input-bg); color:var(--text-main); font-weight:800; font-size:0.875rem; }
        td { padding:1rem; border-bottom:1px solid var(--input-bg); color:var(--text-main); font-weight:600; font-size:0.9rem; }
        tr:last-child td { border-bottom:none; }
        .status-pill { display:inline-flex; align-items:center; gap:0.4rem; padding:0.25rem 0.75rem; border-radius:999px;
          font-size:0.75rem; font-weight:700; border:1px solid transparent; }
        .pill-online { background:var(--success-light); color:var(--success); border-color:rgba(34,197,94,0.2); }
        .pill-offline { background:var(--input-bg); color:var(--text-muted); border-color:#e2e8f0; }
        .pill-blue { background:#dbeafe; color:#2563eb; }
        .pill-red { background:#fee2e2; color:#dc2626; border-color:rgba(239,68,68,0.2); }
        .pill-yellow { background:#fef9c3; color:#ca8a04; }
        .control-card { background:white; border-radius:var(--radius-md); padding:2rem; border:1px solid #e2e8f0;
          box-shadow:var(--shadow-soft); margin-bottom:2rem; }
        .pt-input { width:100%; padding:0.75rem; background:var(--input-bg); border:none; border-radius:var(--radius-sm);
          font-family:'Nunito',sans-serif; font-weight:600; box-sizing:border-box; }
        .submit-green-btn { background:#059669; color:white; width:100%; padding:1rem; border:none; border-radius:var(--radius-sm);
          font-weight:800; font-size:1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:0.5rem; transition:background 0.2s; font-family:'Nunito',sans-serif; }
        .submit-green-btn:hover { background:#047857; }
        .remove-btn { background:#ef4444; color:white; border:none; padding:0.5rem 1rem; border-radius:var(--radius-sm);
          font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; font-size:0.85rem; font-family:'Nunito',sans-serif; }
        .logout-team-btn { background:#f59e0b; color:white; border:none; padding:0.5rem 1rem; border-radius:var(--radius-sm);
          font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; font-size:0.85rem; font-family:'Nunito',sans-serif; }
        .buzzer-toggle-btn { color:white; padding:1rem 2rem; display:flex; align-items:center; justify-content:center;
          gap:0.5rem; font-size:1.1rem; font-weight:800; border-radius:var(--radius-sm); border:none; cursor:pointer;
          transition:all 0.2s; font-family:'Nunito',sans-serif; }
        .buzzer-status-bar { color:white; padding:1rem; text-align:center; border-radius:var(--radius-sm);
          font-weight:800; margin-top:1.5rem; width:100%; display:flex; justify-content:center; align-items:center; gap:0.5rem; }
        @keyframes pulseRed { 0%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)} 70%{box-shadow:0 0 0 15px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }
        .rank-row-1 td { background:linear-gradient(to right,rgba(253,224,71,0.15),transparent); border-left:4px solid #facc15; }
        .rank-row-2 td { background:linear-gradient(to right,rgba(203,213,225,0.15),transparent); border-left:4px solid #94a3b8; }
        .rank-row-3 td { background:linear-gradient(to right,rgba(251,146,60,0.1),transparent); border-left:4px solid #fb923c; }
        .points-badge { background:#f3e8ff; color:#a855f7; padding:0.4rem 0.9rem; border-radius:8px; font-weight:800; font-size:0.85rem; }
        .toggle-switch { position:relative; display:inline-block; width:56px; height:28px; }
        .toggle-switch input { opacity:0; width:0; height:0; }
        .toggle-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:#cbd5e1; transition:.3s; border-radius:999px; }
        .toggle-slider:before { position:absolute; content:""; height:22px; width:22px; left:3px; bottom:3px;
          background:white; transition:.3s; border-radius:50%; box-shadow:0 2px 4px rgba(0,0,0,0.2); }
        input:checked + .toggle-slider { background:#22c55e; }
        input:checked + .toggle-slider:before { transform:translateX(28px); }
        .violation-item { background:#fff5f5; border:1px solid #fecaca; border-radius:10px; padding:0.75rem 1rem;
          display:flex; align-items:center; gap:0.75rem; }
        .qs-filter-btn { background:var(--input-bg); border:none; padding:0.4rem 0.9rem; border-radius:999px;
          font-weight:700; font-size:0.85rem; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem; font-family:'Nunito',sans-serif; }
        .qs-filter-btn.active { background:#dcfce7; color:#16a34a; }
        .attempts-table td { padding:0.6rem 1rem; font-size:0.85rem; }
        .attempts-table tr:nth-child(even) { background:#f1f5f9; }
        @media(max-width:900px){.main-content{padding:1.5rem 1rem;}}
      `}</style>

      <div style={{ display: 'flex', background: 'var(--bg-color)', minHeight: '100vh', overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside className="sidebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontWeight: 800, fontSize: '1.4rem', marginBottom: '3rem', padding: '0 0.5rem' }}>
            <div style={{
              background: '#facc15', color: '#4c1d95', width: 44, height: 44, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-10deg)', fontSize: 24
            }}>
              <span className="material-symbols-rounded">bolt</span>
            </div>
            <div>
              BuzzIt Admin
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#c4b5fd', display: 'block', marginTop: 2 }}>Control Panel</span>
            </div>
          </div>

          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {navItems.map(item => (
              <button key={item.id} className={`nav-item ${activeView === item.id ? 'active' : ''}`} onClick={() => setActiveView(item.id)}>
                <span className="material-symbols-rounded">{item.icon}</span>
                {item.label}
                {item.badge && (
                  <span style={{ background: '#a855f7', color: 'white', fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderRadius: 999, fontWeight: 800, marginLeft: 'auto' }}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <button className="nav-item" style={{ color: '#fca5a5', marginTop: 'auto' }} onClick={handleLogout}>
            <span className="material-symbols-rounded">arrow_back</span> Logout
          </button>
        </aside>

        {/* Main content */}
        <main className="main-content">

          {/* HOME */}
          {activeView === VIEWS.HOME && (
            <div>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 2rem', color: 'var(--text-main)' }}>
                <div style={{ background: '#4c1d95', color: 'white', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-rounded">home</span>
                </div>
                Admin Dashboard
              </h1>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                {[
                  { num: 1, icon: 'quiz', color: '#a855f7', title: 'Round 1 — Online Quiz', desc: 'Turn on to allow participants to access the online quiz.', live: r1Live },
                  { num: 2, icon: 'notifications_active', color: '#f97316', title: 'Round 2 — Live Buzzer', desc: 'Turn on to allow participants to access the buzzer arena.', live: r2Live },
                ].map(r => (
                  <div key={r.num} style={{ background: 'white', borderRadius: 'var(--radius-md)', padding: '1.75rem', border: '1px solid #e2e8f0', boxShadow: 'var(--shadow-soft)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="material-symbols-rounded" style={{ color: r.color }}>{r.icon}</span> {r.title}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={r.live} onChange={() => toggleRound(r.num)} />
                        <span className="toggle-slider" />
                      </label>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.live ? '🟢 LIVE' : '⚫ Offline'}</span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{r.desc}</p>
                    {r.num === 1 && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="status-pill pill-blue">{teams.length} teams total</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <h2 style={{ fontWeight: 800, margin: '0 0 1rem' }}>Live Violation Feed</h2>
              <div className="table-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Real-time proctoring alerts from Round 1</span>
                  <button onClick={() => setViolations([])} style={{ background: 'var(--input-bg)', border: 'none', borderRadius: 8, padding: '0.4rem 0.8rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: "'Nunito',sans-serif" }}>Clear</button>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {violations.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic', padding: '1rem' }}>No violations yet. Monitoring active.</div>
                  ) : violations.map(v => (
                    <div key={v.id} className="violation-item">
                      <span className="material-symbols-rounded" style={{ color: '#dc2626', flexShrink: 0 }}>warning</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.9rem' }}>
                          {v.teamName} <span style={{ background: '#dc2626', color: 'white', fontSize: '0.7rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: 999 }}>#{v.count}</span>
                          {v.disqualified && <span style={{ background: '#991b1b', color: 'white', fontSize: '0.7rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: 999, marginLeft: 4 }}>DISQUALIFIED</span>}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{v.label} · {v.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* REGISTRATION */}
          {activeView === VIEWS.REGISTRATION && (
            <div>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 2rem' }}>
                <div style={{ background: '#3b82f6', color: 'white', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-rounded">person_add</span>
                </div>
                Team Registration
              </h1>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                {[
                  { bg: '#3b82f6', val: teams.length, label: 'Total Teams' },
                  { bg: '#22c55e', val: teams.filter(t => t.isActive).length, label: 'Currently Active' },
                  { bg: '#ef4444', val: teams.filter(t => !t.isActive).length, label: 'Offline' },
                ].map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 'var(--radius-md)', padding: '1.5rem', color: 'white', boxShadow: 'var(--shadow-soft)' }}>
                    <h3 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800 }}>{s.val}</h3>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '1rem', fontWeight: 600, opacity: 0.9 }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="control-card">
                <h2 style={{ margin: '0 0 1.5rem' }}>Register New Team</h2>
                <form onSubmit={handleAddTeam}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div><div className="input-label">Team Name</div><input className="pt-input" value={addTeamName} onChange={e => setAddTeamName(e.target.value)} placeholder="Team name" required /></div>
                    <div><div className="input-label">Login Code</div><input className="pt-input" value={addTeamCode} onChange={e => setAddTeamCode(e.target.value)} placeholder="Login code" required /></div>
                    <div><div className="input-label">Password</div><input className="pt-input" value={addTeamPass} onChange={e => setAddTeamPass(e.target.value)} placeholder="Password" required /></div>
                  </div>
                  <button type="submit" className="submit-green-btn"><span className="material-symbols-rounded">add</span> Register Team</button>
                </form>
              </div>
              <div className="table-container">
                <h2>Registered Teams</h2>
                <table>
                  <thead><tr><th>Team Name</th><th>Login Code</th><th>Password</th><th>Login Status</th><th>R1 Score</th><th>Actions</th></tr></thead>
                  <tbody>
                    {teams.map(t => (
                      <tr key={t.id}>
                        <td><strong>{t.teamName}</strong></td>
                        <td><code style={{ background: 'var(--input-bg)', padding: '0.2rem 0.4rem', borderRadius: 4 }}>{t.teamCode}</code></td>
                        <td><span style={{ fontFamily: 'monospace' }}>{t.rawPassword || '***'}</span></td>
                        <td><span className={`status-pill ${t.isActive ? 'pill-online' : 'pill-offline'}`}>{t.isActive ? 'Online' : 'Offline'}</span></td>
                        <td><span className="points-badge">{(t.round1Score || 0).toFixed(4)}</span></td>
                        <td style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="logout-team-btn" onClick={() => forceLogoutTeam(t.id)}><span className="material-symbols-rounded">logout</span></button>
                          <button className="remove-btn" onClick={() => deleteTeam(t.id)}><span className="material-symbols-rounded">delete</span></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ROUND 1 */}
          {activeView === VIEWS.ROUND1 && (
            <div>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 2rem' }}>
                <div style={{ background: 'linear-gradient(135deg,#818cf8,#a855f7)', color: 'white', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-rounded">quiz</span>
                </div>
                Round 1 — Online Quiz Results
              </h1>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                {[
                  { bg: '#a855f7', val: r1Started, label: 'Started' },
                  { bg: '#22c55e', val: r1Completed, label: 'Completed' },
                  { bg: '#ef4444', val: r1DQ, label: 'Disqualified' },
                ].map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 'var(--radius-md)', padding: '1.5rem', color: 'white', boxShadow: 'var(--shadow-soft)' }}>
                    <h3 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800 }}>{s.val}</h3>
                    <p style={{ margin: '0.5rem 0 0', fontWeight: 600, opacity: 0.9 }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="table-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Leaderboard</h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Click a row to see per-question breakdown</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No ties guaranteed • Updates every 10s</span>
                    <button onClick={loadR1Results} style={{ background: 'var(--input-bg)', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: "'Nunito',sans-serif" }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 16 }}>refresh</span> Refresh
                    </button>
                    <button onClick={() => {
                      let csv = 'Rank,Team,Total Score,Correct,Completed At,Status\n';
                      r1Sorted.forEach((t, i) => {
                        const correct = t.attempts.filter(a => a.isCorrect).length;
                        csv += `${i + 1},"${t.teamName}",${t.round1Score.toFixed(4)},${correct}/10,${t.session?.completedAt || ''},Completed\n`;
                      });
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'round1_results.csv'; a.click();
                    }} style={{ background: '#059669', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: "'Nunito',sans-serif" }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 16 }}>download</span> Export CSV
                    </button>
                  </div>
                </div>
                <table>
                  <thead><tr><th>Rank</th><th>Team</th><th>Total Score</th><th>Correct</th><th>Completed At</th><th>Status</th></tr></thead>
                  <tbody>
                    {r1Data.filter(t => !t.session).map(t => (
                      <tr key={t.teamId}><td>—</td><td>{t.teamName}</td><td>—</td><td>—</td><td>—</td><td><span className="status-pill pill-offline">Not Started</span></td></tr>
                    ))}
                    {r1Data.filter(t => t.session && !t.session.completedAt).map(t => (
                      <tr key={t.teamId}><td>—</td><td>{t.teamName}</td><td>—</td><td>{t.session.currentQuestionIndex}/10</td><td>In Progress</td><td><span className="status-pill pill-yellow">In Progress</span></td></tr>
                    ))}
                    {r1Data.filter(t => t.session?.isDisqualified).map(t => (
                      <tr key={t.teamId} style={{ opacity: 0.7 }}><td>DQ</td><td>{t.teamName}</td><td style={{ fontFamily: 'monospace', color: '#a855f7', fontWeight: 800 }}>0.0000</td><td>—</td><td>—</td><td><span className="status-pill pill-red">Disqualified</span></td></tr>
                    ))}
                    {r1Sorted.map((t, i) => {
                      const rank = i + 1;
                      const correct = t.attempts.filter(a => a.isCorrect).length;
                      const completedAt = t.session?.completedAt ? new Date(t.session.completedAt).toLocaleTimeString() : '—';
                      const isExpanded = expandedTeam === t.teamId;
                      return [
                        <tr key={t.teamId} className={`rank-row-${rank}`} style={{ cursor: 'pointer' }} onClick={() => setExpandedTeam(isExpanded ? null : t.teamId)}>
                          <td style={{ fontWeight: 800 }}>{rankIcon(rank)} {rank <= 3 ? `#${rank}` : `#${rank}`}</td>
                          <td style={{ fontWeight: 800 }}>{t.teamName}</td>
                          <td style={{ fontFamily: 'monospace', color: '#a855f7', fontWeight: 800 }}>{t.round1Score.toFixed(4)}</td>
                          <td>{correct}/10</td>
                          <td>{completedAt}</td>
                          <td><span className="status-pill pill-online">Completed</span></td>
                        </tr>,
                        isExpanded && (
                          <tr key={`exp-${t.teamId}`} style={{ background: '#f8fafc' }}>
                            <td colSpan={6} style={{ padding: '1rem' }}>
                              <table className="attempts-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr style={{ background: '#e2e8f0' }}><th style={{ padding: '0.6rem 1rem' }}>#</th><th>Question</th><th>Answer</th><th>Correct?</th><th>Time (ms)</th><th>Score</th></tr></thead>
                                <tbody>
                                  {t.attempts.map((a, ai) => (
                                    <tr key={ai}>
                                      <td>{ai + 1}</td>
                                      <td style={{ maxWidth: 300, fontSize: '0.82rem' }}>{a.questionText}</td>
                                      <td>{a.selectedAnswer === 'TIMEOUT' ? <em>Timeout</em> : a.selectedAnswer}</td>
                                      <td style={{ fontWeight: 800, color: a.isCorrect ? '#16a34a' : '#dc2626' }}>{a.isCorrect ? '✓ Yes' : '✗ No'}</td>
                                      <td style={{ fontFamily: 'monospace' }}>{a.timeTakenMs}</td>
                                      <td style={{ fontFamily: 'monospace', color: '#a855f7', fontWeight: 800 }}>{a.score.toFixed(4)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BUZZER */}
          {activeView === VIEWS.BUZZER && (
            <div>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 2rem' }}>
                <div style={{ background: '#ef4444', color: 'white', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-rounded">notifications_active</span>
                </div>
                Buzzer Control — Round 2
              </h1>
              <div className="control-card" style={{ textAlign: 'center', position: 'relative' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'white', border: '2px solid #a855f7', color: '#a855f7', padding: '0.25rem 1rem', borderRadius: 999, fontWeight: 800, fontSize: '0.85rem', marginBottom: '2rem', position: 'absolute', left: '1rem', top: '1rem', boxShadow: '0 4px 6px rgba(168,85,247,0.15)' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>quiz</span>
                  <select value={selectedQuestionId} onChange={e => setSelectedQuestionId(e.target.value)} style={{ border: 'none', background: 'transparent', color: '#a855f7', fontWeight: 800, fontFamily: "'Nunito',sans-serif", outline: 'none', fontSize: '1rem', cursor: 'pointer' }}>
                    {r2Questions.map(q => <option key={q.id} value={q.id}>Q{q.orderIndex}: {q.questionText.substring(0, 40)}</option>)}
                  </select>
                </div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Control Buzzer</h3>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1rem' }}>
                  <button
                    className="buzzer-toggle-btn"
                    onClick={handleArmBuzzer}
                    style={{
                      background: buzzerArmed ? '#ef4444' : '#64748b',
                      animation: buzzerArmed ? 'pulseRed 2s infinite' : 'none'
                    }}
                  >
                    <span className="material-symbols-rounded">{buzzerArmed ? 'sensors' : 'bolt'}</span>
                    {buzzerArmed ? 'Buzzer Live' : 'Enable Buzzer'}
                  </button>
                  <button className="buzzer-toggle-btn" onClick={handleDisableBuzzer} style={{ background: '#ef4444' }}>
                    <span className="material-symbols-rounded">power_settings_new</span> Turn Off Buzzer
                  </button>
                </div>
                <div className="buzzer-status-bar" style={{ background: buzzerArmed ? '#22c55e' : '#94a3b8' }}>
                  <span className="material-symbols-rounded">bolt</span>
                  {buzzerArmed ? 'Waiting for Buzz...' : 'Buzzer is Disabled'}
                </div>
              </div>
              <div className="table-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2>Buzz Timings</h2>
                  <button onClick={() => setBuzzLogs([])} style={{ background: 'var(--input-bg)', color: 'var(--text-main)', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: "'Nunito',sans-serif" }}>
                    <span className="material-symbols-rounded">delete</span> Clear
                  </button>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <table>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1 }}>
                      <tr><th>Rank</th><th>Team</th><th>Time of Buzz</th><th>Reaction Time</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {buzzLogs.length === 0
                        ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>Waiting for buzzes...</td></tr>
                        : buzzLogs.map((l, i) => (
                          <tr key={i} style={{ background: i === 0 ? 'rgba(253,224,71,0.15)' : '' }}>
                            <td style={{ fontWeight: 800 }}>{rankIcon(i + 1)} #{i + 1}</td>
                            <td style={{ fontWeight: 800 }}>{l.team}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.time}</td>
                            <td style={{ color: '#a855f7', fontWeight: 700 }}>{l.diff}</td>
                            <td><span className={`status-pill ${i === 0 ? 'pill-online' : 'pill-blue'}`}>Buzzed</span></td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SCORING */}
          {activeView === VIEWS.SCORING && (
            <div>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 2rem' }}>
                <div style={{ background: '#059669', color: 'white', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-rounded">assignment</span>
                </div>
                Scoring Panel
              </h1>
              <div className="control-card">
                <h2>Award / Deduct Points</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="material-symbols-rounded" style={{ color: '#facc15', fontSize: 18 }}>lightbulb</span> Enter negative values to deduct points
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                  <div>
                    <div className="input-label">Team</div>
                    <select className="pt-input" value={scoreTeam} onChange={e => setScoreTeam(e.target.value)}>
                      <option value="">Select team</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.teamName}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="input-label">Question #</div>
                    <input className="pt-input" value={scoreQNum} onChange={e => setScoreQNum(e.target.value)} placeholder="e.g. Q3" />
                  </div>
                  <div>
                    <div className="input-label">Points (+ or -)</div>
                    <input type="number" className="pt-input" value={scoreAmount} onChange={e => setScoreAmount(e.target.value)} placeholder="e.g. 50 or -10" />
                  </div>
                </div>
                <button className="submit-green-btn" onClick={handleSubmitScore}><span className="material-symbols-rounded">add</span> Submit Score</button>
              </div>
              <div className="table-container">
                <h2>Score Log</h2>
                <table>
                  <thead><tr><th>Team</th><th>Question</th><th>Points</th><th>Time</th></tr></thead>
                  <tbody>
                    {scoreLog.length === 0
                      ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>No entries yet.</td></tr>
                      : scoreLog.map((s, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 800 }}>{s.team}</td>
                          <td>{s.q}</td>
                          <td><span className={`status-pill ${s.amt > 0 ? 'pill-online' : 'pill-red'}`}>{s.amt > 0 ? `+${s.amt}` : s.amt} pts</span></td>
                          <td>{s.time}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* OVERVIEW */}
          {activeView === VIEWS.OVERVIEW && (
            <div>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 2rem' }}>
                <div style={{ background: '#3b82f6', color: 'white', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-rounded">emoji_events</span>
                </div>
                Team Overview & Leaderboard
              </h1>
              <div className="table-container">
                <h3 style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                  <span className="material-symbols-rounded">workspace_premium</span> Leaderboard (Round 2 Points)
                </h3>
                <table>
                  <thead><tr><th>Rank</th><th>Team Name</th><th>R2 Points</th><th>R1 Score</th><th>Status</th></tr></thead>
                  <tbody>
                    {teams.map((t, i) => {
                      const rank = i + 1;
                      return (
                        <tr key={t.id} className={`rank-row-${rank}`}>
                          <td style={{ fontWeight: 800 }}>{rankIcon(rank)} #{rank}</td>
                          <td><strong>{t.teamName}</strong></td>
                          <td><span className="points-badge">{t.score} pts</span></td>
                          <td><span style={{ fontFamily: 'monospace', color: '#a855f7' }}>{(t.round1Score || 0).toFixed(4)}</span></td>
                          <td><span className={`status-pill ${t.isActive ? 'pill-online' : 'pill-offline'}`}>{t.isActive ? 'Online' : 'Offline'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* QUESTION STATUS */}
          {activeView === VIEWS.QSTATUS && (
            <div>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 2rem' }}>
                <div style={{ background: '#7c3aed', color: 'white', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-rounded">query_stats</span>
                </div>
                Question Status — Round 2
              </h1>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                {[
                  { bg: '#a855f7', val: r2Stats.total, label: 'Total Questions' },
                  { bg: '#22c55e', val: r2Stats.answered, label: 'Answered' },
                  { bg: '#ef4444', val: r2Stats.unanswered, label: 'Unanswered' },
                ].map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 'var(--radius-md)', padding: '1.5rem', color: 'white', boxShadow: 'var(--shadow-soft)' }}>
                    <h3 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 800 }}>{s.val}</h3>
                    <p style={{ margin: '0.5rem 0 0', fontWeight: 600, opacity: 0.9 }}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="table-container">
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                  {[
                    { key: 'answered', icon: 'check_circle', label: 'Answered' },
                    { key: 'unanswered', icon: 'help', label: 'Unanswered' },
                    { key: 'all', icon: 'format_list_bulleted', label: 'All' },
                  ].map(f => (
                    <button key={f.key} className={`qs-filter-btn ${r2StatusFilter === f.key ? 'active' : ''}`} onClick={() => setR2StatusFilter(f.key)}>
                      <span className="material-symbols-rounded" style={{ fontSize: 16 }}>{f.icon}</span> {f.label}
                    </button>
                  ))}
                </div>
                <table>
                  <thead><tr><th>Question #</th><th>Answered By</th><th>Points Awarded</th><th>Status</th></tr></thead>
                  <tbody>
                    {r2Filtered.length === 0
                      ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>No questions found.</td></tr>
                      : r2Filtered.map(r => (
                        <tr key={r.questionNumber}>
                          <td style={{ fontWeight: 800 }}>#{r.questionNumber}</td>
                          <td>{r.answered ? r.answeredBy : 'Not answered'}</td>
                          <td>{r.answered ? (r.pointsAwarded ?? 0) : '—'}</td>
                          <td><span className={`status-pill ${r.answered ? 'pill-online' : 'pill-offline'}`}>{r.answered ? 'answered' : 'unanswered'}</span></td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  );
}
