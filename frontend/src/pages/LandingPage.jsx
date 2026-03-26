import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { BACKEND_URL } from '../config';
import { useToast } from '../components/Toast';

export default function LandingPage() {
  const navigate = useNavigate();
  const showToast = useToast();

  const token = localStorage.getItem('teamToken');
  const teamData = JSON.parse(localStorage.getItem('team') || '{}');

  const [r1Live, setR1Live] = useState(false);
  const [r2Live, setR2Live] = useState(false);
  const [r1Completed, setR1Completed] = useState(false);
  const [r1Disqualified, setR1Disqualified] = useState(false);
  const [dqReason, setDqReason] = useState('');

  useEffect(() => {
    loadRounds();
    checkQuizStatus();

    const socket = io(BACKEND_URL);
    socket.on('connect', () => socket.emit('joinTeam', teamData.id));
    socket.on('roundStatusChanged', (data) => {
      if (data.roundNumber === 1) setR1Live(data.isLive);
      else setR2Live(data.isLive);
    });
    socket.on('teamRemoved', (data) => {
      if (data.teamId === teamData.id) {
        localStorage.clear();
        navigate('/?kicked=1');
      }
    });

    const handleUnload = () => {
      const url = `${BACKEND_URL}/api/team/logout/beacon`;
      try {
        navigator.sendBeacon(url, new Blob([JSON.stringify({ token })], { type: 'application/json' }));
      } catch {}
      localStorage.clear();
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      socket.disconnect();
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  async function loadRounds() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/team/rounds`);
      const data = await res.json();
      data.rounds.forEach(r => {
        if (r.roundNumber === 1) setR1Live(r.isLive);
        else setR2Live(r.isLive);
      });
    } catch {}
  }

  async function checkQuizStatus() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/team/quiz/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.completed && !data.disqualified) setR1Completed(true);
      else if (data.disqualified) {
        setR1Disqualified(true);
        setDqReason(data.disqualifyReason || 'Violation');
      }
    } catch {}
  }

  async function handleLogout() {
    try {
      await fetch(`${BACKEND_URL}/api/team/logout`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}
    localStorage.clear();
    navigate('/');
  }

  const LiveBadge = ({ live }) => (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
      padding: '0.3rem 0.8rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 800,
      background: live ? '#dcfce7' : '#f1f5f9',
      color: live ? '#16a34a' : '#64748b'
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: live ? '#16a34a' : '#94a3b8',
        animation: live ? 'blink 1.2s infinite' : 'none'
      }} />
      {live ? 'LIVE' : 'OFFLINE'}
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .round-card { background:white; border-radius:var(--radius-lg); box-shadow:var(--shadow-soft);
          border:1px solid rgba(226,232,240,0.6); padding:2rem; display:flex; flex-direction:column;
          gap:1.25rem; transition:box-shadow 0.2s; }
        .round-card:hover { box-shadow:var(--shadow-hover); }
        .enter-btn { width:100%; padding:1rem; border:none; border-radius:var(--radius-sm);
          font-family:'Nunito',sans-serif; font-weight:800; font-size:1rem; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:0.5rem; transition:all 0.2s; margin-top:auto; }
        .enter-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 10px 20px rgba(168,85,247,0.3); }
        .enter-btn:disabled { opacity:0.45; cursor:not-allowed; }
        .rules-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.6rem; }
        .rules-list li { display:flex; align-items:flex-start; gap:0.6rem; font-size:0.9rem;
          color:var(--text-muted); font-weight:600; }
        .rules-list li .material-symbols-rounded { font-size:16px; margin-top:1px; flex-shrink:0; }
        @media(max-width:700px){.rounds-grid{grid-template-columns:1fr!important;}}
      `}</style>

      {/* Nav */}
      <nav style={{
        padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(226,232,240,0.5)', position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.4rem' }}>
          <div style={{
            width: 36, height: 36, background: 'var(--orange-gradient)', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', transform: 'rotate(-10deg)'
          }}>
            <span className="material-symbols-rounded">bolt</span>
          </div>
          BuzzIt!
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            background: 'var(--primary-gradient)', color: 'white', padding: '0.4rem 1rem',
            borderRadius: 20, fontWeight: 800, fontSize: '0.9rem'
          }}>
            {teamData.teamName || 'Team'}
          </div>
        </div>
      </nav>

      <button className="fixed-logout" onClick={handleLogout}>
        <span className="material-symbols-rounded">logout</span> Logout
      </button>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 2rem', background: `radial-gradient(circle at top right,rgba(168,85,247,0.06),transparent 50%), radial-gradient(circle at bottom left,rgba(251,146,60,0.06),transparent 50%), var(--bg-color)`, minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
            Welcome to <span className="text-gradient">IAC Quiz 2025</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: 0 }}>
            Select an active round to participate. Good luck!
          </p>
        </div>

        <div className="rounds-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Round 1 */}
          <div className="round-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'white',
                background: 'linear-gradient(135deg,#818cf8,#a855f7)'
              }}>
                <span className="material-symbols-rounded">quiz</span>
              </div>
              <LiveBadge live={r1Live} />
            </div>
            <div>
              <p style={{ color: '#a855f7', fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>ROUND 1</p>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>Online Quiz</h2>
            </div>
            <ul className="rules-list">
              <li><span className="material-symbols-rounded" style={{ color: '#a855f7' }}>format_list_numbered</span>10 multiple choice questions, one at a time</li>
              <li><span className="material-symbols-rounded" style={{ color: '#a855f7' }}>timer</span>Each question has a fixed time limit — answer faster to score more</li>
              <li><span className="material-symbols-rounded" style={{ color: '#a855f7' }}>leaderboard</span>Scoring is time-based with microsecond precision — <strong>no ties possible</strong></li>
              <li><span className="material-symbols-rounded" style={{ color: '#a855f7' }}>fullscreen</span>Fullscreen is required throughout the quiz</li>
              <li><span className="material-symbols-rounded" style={{ color: 'var(--danger)', fontSize: 16, marginTop: 1, flexShrink: 0 }}>warning</span><span style={{ color: 'var(--danger)', fontWeight: 700 }}>Tab switching is strictly monitored. 3 violations = auto submit</span></li>
              <li><span className="material-symbols-rounded" style={{ color: '#a855f7' }}>block</span>Do NOT refresh the page — your session will be lost</li>
              <li><span className="material-symbols-rounded" style={{ color: '#a855f7' }}>auto_timer</span>Each question auto-submits when the timer expires</li>
            </ul>
            <div>
              {r1Disqualified ? (
                <div style={{
                  background: '#fee2e2', color: '#dc2626', padding: '0.5rem 1rem', borderRadius: 8,
                  fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '0.5rem'
                }}>
                  <span className="material-symbols-rounded">gavel</span> Disqualified: {dqReason}
                </div>
              ) : r1Completed ? (
                <div style={{
                  background: '#dcfce7', color: '#16a34a', padding: '0.5rem 1rem', borderRadius: 8,
                  fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '0.5rem'
                }}>
                  <span className="material-symbols-rounded">check_circle</span> Round 1 Completed!
                </div>
              ) : (
                <button
                  className="enter-btn"
                  style={{ background: 'linear-gradient(135deg,#818cf8,#a855f7)', color: 'white' }}
                  disabled={!r1Live}
                  onClick={() => navigate('/quiz')}
                >
                  <span className="material-symbols-rounded">play_arrow</span> Enter Round 1
                </button>
              )}
            </div>
          </div>

          {/* Round 2 */}
          <div className="round-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'white', background: 'var(--orange-gradient)'
              }}>
                <span className="material-symbols-rounded">notifications_active</span>
              </div>
              <LiveBadge live={r2Live} />
            </div>
            <div>
              <p style={{ color: '#fb923c', fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>ROUND 2</p>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>Live Buzzer Round</h2>
            </div>
            <ul className="rules-list">
              <li><span className="material-symbols-rounded" style={{ color: '#fb923c' }}>live_tv</span>Admin will display questions on screen in the main arena</li>
              <li><span className="material-symbols-rounded" style={{ color: '#fb923c' }}>bolt</span>Hit the buzzer as fast as possible when the question appears</li>
              <li><span className="material-symbols-rounded" style={{ color: '#fb923c' }}>emoji_events</span>Only the fastest buzz wins the chance to answer</li>
              <li><span className="material-symbols-rounded" style={{ color: '#fb923c' }}>block</span>One buzz per question — you cannot buzz again for the same question</li>
              <li><span className="material-symbols-rounded" style={{ color: '#fb923c' }}>speed</span>Your reaction time is recorded to millisecond precision</li>
              <li><span className="material-symbols-rounded" style={{ color: '#fb923c' }}>psychology</span>Be ready to answer immediately after buzzing in</li>
            </ul>
            <button
              className="enter-btn"
              style={{ background: 'var(--orange-gradient)', color: 'white' }}
              disabled={!r2Live}
              onClick={() => navigate('/buzzer')}
            >
              <span className="material-symbols-rounded">bolt</span> Enter Round 2
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
