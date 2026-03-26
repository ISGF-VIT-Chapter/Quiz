import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { BACKEND_URL } from '../config';
import { useToast } from '../components/Toast';

// buzzer states
const STATE = { IDLE: 'idle', ARMED: 'armed', WINNER: 'winner', LOSER: 'loser' };

export default function BuzzerPage() {
  const navigate = useNavigate();
  const showToast = useToast();

  const token = localStorage.getItem('teamToken');
  const teamData = JSON.parse(localStorage.getItem('team') || '{}');

  const [buzzerState, setBuzzerState] = useState(STATE.IDLE);
  const [statusHtml, setStatusHtml] = useState('<hourglass> Waiting for next question...');
  const [statusIcon, setStatusIcon] = useState('hourglass_empty');
  const [statusText, setStatusText] = useState('Waiting for next question...');
  const [statusColor, setStatusColor] = useState('var(--text-muted)');
  const [buzzerIcon, setBuzzerIcon] = useState('power_settings_new');
  const [buzzerLabel, setBuzzerLabel] = useState('BUZZ!');
  const myBuzzData = useRef(null);

  useEffect(() => {
    if (!token) { navigate('/'); return; }

    // Check Round 2 is live
    (async () => {
      try {
        const rRes = await fetch(`${BACKEND_URL}/api/team/rounds`);
        const rData = await rRes.json();
        const r2 = rData.rounds.find(r => r.roundNumber === 2);
        if (!r2 || !r2.isLive) {
          showToast('Round 2 is not currently active.', 'error');
          setTimeout(() => navigate('/landing'), 1800);
        }
      } catch {}
    })();

    const socket = io(BACKEND_URL);
    socket.on('connect', () => socket.emit('joinTeam', teamData.id));

    socket.on('teamRemoved', (data) => {
      if (data.teamId === teamData.id) { localStorage.clear(); navigate('/?kicked=1'); }
    });

    socket.on('buzzerEnabled', () => {
      myBuzzData.current = null;
      setBuzzerState(STATE.ARMED);
      setBuzzerIcon('bolt');
      setStatusIcon('bolt');
      setStatusText('Question is live! Click the buzzer now!');
      setStatusColor('#f97316');
    });

    socket.on('buzzerDisabled', () => {
      myBuzzData.current = null;
      setBuzzerState(STATE.IDLE);
      setBuzzerIcon('power_settings_new');
      setStatusIcon('hourglass_empty');
      setStatusText('Waiting for next question...');
      setStatusColor('var(--text-muted)');
    });

    socket.on('buzzWinner', (winnerData) => {
      if (winnerData.teamId === teamData.id) return;
      setBuzzerState(STATE.LOSER);
      setBuzzerIcon('block');
      if (!myBuzzData.current) {
        setStatusText(`${winnerData.teamName} Buzzed!`);
        setStatusColor('#ef4444');
      }
    });

    const handleUnload = () => {
      try { navigator.sendBeacon(`${BACKEND_URL}/api/team/logout/beacon`, new Blob([JSON.stringify({ token })], { type: 'application/json' })); } catch {}
      localStorage.clear();
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => { socket.disconnect(); window.removeEventListener('beforeunload', handleUnload); };
  }, []);

  async function handleBuzz() {
    if (buzzerState !== STATE.ARMED) return;
    setBuzzerState(STATE.IDLE);
    setStatusIcon('sync');
    setStatusText('Sending...');
    setStatusColor('var(--text-muted)');

    try {
      const res = await fetch(`${BACKEND_URL}/api/team/buzz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message, 'error');
      } else {
        if (!data.payload || typeof data.payload.rank !== 'number') {
          showToast(data.message || 'Buzz received. Waiting for results.', 'info');
          setBuzzerState(STATE.IDLE);
          setStatusIcon('hourglass_empty');
          setStatusText('Waiting for next question...');
          setStatusColor('var(--text-muted)');
          return;
        }
        myBuzzData.current = data.payload;
        const r = data.payload.rank;
        const ord = r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`;
        setBuzzerState(r === 1 ? STATE.WINNER : STATE.LOSER);
        setBuzzerIcon(r === 1 ? 'verified' : 'timer');
        setStatusText(`You're the ${ord} team to press it! Time: ${data.payload.timeDiff}`);
        setStatusColor(r === 1 ? '#10b981' : '#facc15');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  async function handleLogout(e) {
    e.preventDefault();
    try {
      await fetch(`${BACKEND_URL}/api/team/logout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
    } catch {}
    localStorage.clear();
    navigate('/landing');
  }

  // Buzzer button styles per state
  const buzzerStyles = {
    [STATE.IDLE]: {
      background: '#e2e8f0',
      boxShadow: 'inset 0 -10px 20px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05)',
      cursor: 'not-allowed',
      iconColor: '#94a3b8',
      textColor: '#94a3b8',
      animation: 'none',
    },
    [STATE.ARMED]: {
      background: 'var(--orange-gradient)',
      boxShadow: 'inset 0 -10px 20px rgba(0,0,0,0.2), inset 0 10px 20px rgba(255,255,255,0.3), 0 20px 40px rgba(251,146,60,0.4), 0 0 80px rgba(244,63,94,0.4)',
      cursor: 'pointer',
      iconColor: 'white',
      textColor: 'white',
      animation: 'pulseOrange 2s infinite',
    },
    [STATE.WINNER]: {
      background: 'linear-gradient(135deg,#10b981,#059669)',
      boxShadow: '0 0 80px rgba(16,185,129,0.4)',
      cursor: 'default',
      iconColor: 'white',
      textColor: 'white',
      animation: 'none',
    },
    [STATE.LOSER]: {
      background: '#cbd5e1',
      boxShadow: 'none',
      cursor: 'default',
      iconColor: '#64748b',
      textColor: '#64748b',
      animation: 'none',
    },
  };

  const bs = buzzerStyles[buzzerState];

  return (
    <>
      <style>{`
        @keyframes pulseOrange {
          0% { box-shadow: 0 0 0 0 rgba(251,146,60,0.4); }
          70% { box-shadow: 0 0 0 30px rgba(251,146,60,0); }
          100% { box-shadow: 0 0 0 0 rgba(251,146,60,0); }
        }
        .buzzer-btn-inner:active[data-armed="true"] {
          transform: scale(0.95);
          box-shadow: inset 0 10px 20px rgba(0,0,0,0.3), 0 5px 10px rgba(251,146,60,0.4) !important;
        }
        @media(max-width:1024px){.arena-layout{grid-template-columns:1fr!important;}}
      `}</style>

      <div style={{
        background: `radial-gradient(circle at top right,rgba(168,85,247,0.05),transparent 50%),
          radial-gradient(circle at bottom left,rgba(251,146,60,0.05),transparent 50%), var(--bg-color)`,
        minHeight: '100vh', display: 'flex', flexDirection: 'column', overflowX: 'hidden'
      }}>
        {/* Top nav */}
        <nav style={{ padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg-color)' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ padding: '0.5rem 1rem', borderRadius: 20, color: 'white', fontWeight: 800, background: 'var(--primary-gradient)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              {teamData.teamName || 'Team'}
            </div>
            <div style={{ padding: '0.5rem 1rem', borderRadius: 20, color: 'white', fontWeight: 800, background: 'var(--orange-gradient)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              Active Round
            </div>
          </div>
        </nav>

        <a href="#" className="fixed-logout" onClick={handleLogout}>
          <span className="material-symbols-rounded">arrow_back</span> Back to Login
        </a>

        {/* Arena layout */}
        <div className="arena-layout" style={{
          flex: 1, display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem',
          padding: '0 2rem 2rem 2rem', maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box'
        }}>
          {/* Buzzer main */}
          <main style={{
            background: 'white', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden', border: '1px solid rgba(226,232,240,0.6)', minHeight: 600
          }}>
            <span className="material-symbols-rounded" style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', fontSize: '2.5rem', opacity: 0.8, color: '#60a5fa' }}>my_location</span>

            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: statusColor, marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontStyle: 'italic', zIndex: 10 }}>
              <span className="material-symbols-rounded" style={{ animation: statusIcon === 'sync' ? 'spin 1s linear infinite' : 'none', display: 'inline-block' }}>{statusIcon}</span>
              {statusText.includes('\n') ? (
                <div dangerouslySetInnerHTML={{ __html: statusText }} />
              ) : (
                statusText === 'Question is live! Click the buzzer now!'
                  ? <span style={{ background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{statusText}</span>
                  : <span>{statusText}</span>
              )}
            </div>

            <button
              className="buzzer-btn-inner"
              data-armed={buzzerState === STATE.ARMED ? 'true' : 'false'}
              onClick={handleBuzz}
              disabled={buzzerState !== STATE.ARMED}
              style={{
                width: 280, height: 280, borderRadius: '50%', border: 'none', cursor: bs.cursor,
                background: bs.background, boxShadow: bs.boxShadow, animation: bs.animation,
                transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, gap: '0.5rem'
              }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '5rem', color: bs.iconColor, transition: 'color 0.2s' }}>{buzzerIcon}</span>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: bs.textColor, transition: 'color 0.2s' }}>{buzzerLabel}</span>
            </button>
          </main>

          {/* Leaderboard sidebar */}
          <aside style={{
            background: 'white', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-soft)',
            border: '1px solid rgba(226,232,240,0.6)', padding: '1.5rem', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.5rem' }}>
              <div style={{
                background: 'var(--orange-gradient)', color: 'white', width: 32, height: 32,
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>emoji_events</span>
              </div>
              Leaderboard
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', borderRadius: 'var(--radius-sm)',
                background: '#fefce8', border: '1px solid #fde047'
              }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#eab308' }}>🏆</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, fontWeight: 800, color: 'var(--text-main)' }}>Current Rankings</h4>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>Hidden during live round</p>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
              <span className="material-symbols-rounded" style={{ fontSize: 16, color: '#fb923c' }}>lightbulb</span>
              Scores update after each round
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
