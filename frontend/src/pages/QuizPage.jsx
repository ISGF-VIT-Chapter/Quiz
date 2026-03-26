import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../config';
import { useToast } from '../components/Toast';

const SCREENS = { PRE: 'pre', QUIZ: 'quiz', COMPLETE: 'complete', DQ: 'dq' };

export default function QuizPage() {
  const navigate = useNavigate();
  const showToast = useToast();

  const token = localStorage.getItem('teamToken');
  const teamData = JSON.parse(localStorage.getItem('team') || '{}');
  const authH = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const [screen, setScreen] = useState(SCREENS.PRE);
  const [question, setQuestion] = useState(null);
  const [qProgress, setQProgress] = useState('Question 1 / 10');
  const [timerPct, setTimerPct] = useState(100);
  const [timerSecs, setTimerSecs] = useState(30);
  const [timerWarning, setTimerWarning] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [dqReason, setDqReason] = useState('');
  const [feedback, setFeedback] = useState(null); // {type, text}
  const [violation, setViolation] = useState(null); // {title, msg, count}
  const [violationCd, setViolationCd] = useState(3);

  const timerRAF = useRef(null);
  const questionStartTime = useRef(0);
  const timeLimitSeconds = useRef(30);
  const answeredRef = useRef(false);
  const violationLock = useRef(false);
  const lastViolationTime = useRef(0);
  const proctoringActive = useRef(false);

  useEffect(() => {
    if (!token) { navigate('/'); return; }
    (async () => {
      const done = await checkStatus();
      if (!done) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/team/rounds`);
          const data = await res.json();
          const r1 = data.rounds.find(r => r.roundNumber === 1);
          if (!r1 || !r1.isLive) {
            showToast('Round 1 is not active right now.', 'error');
            setTimeout(() => navigate('/landing'), 1800);
          }
        } catch {}
      }
    })();

    const handleUnload = () => {
      try { navigator.sendBeacon(`${BACKEND_URL}/api/team/logout/beacon`, new Blob([JSON.stringify({ token })], { type: 'application/json' })); } catch {}
      localStorage.clear();
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => { window.removeEventListener('beforeunload', handleUnload); stopTimer(); removeProctoring(); };
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/team/quiz/status`, { headers: authH });
      const data = await res.json();
      if (data.disqualified) { showDQ(data.disqualifyReason); return true; }
      if (data.completed) { showComplete(); return true; }
    } catch {}
    return false;
  }

  // Proctoring
  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) reportViolation('tab_switch');
  }, []);
  const handleWindowBlur = useCallback(() => {
    if (document.visibilityState !== 'hidden') reportViolation('window_blur');
  }, []);
  const handleFullscreenChange = useCallback(() => {
    if (!document.fullscreenElement) reportViolation('fullscreen_exit');
  }, []);

  function attachProctoring() {
    proctoringActive.current = true;
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', preventKeys);
  }
  function preventKeys(e) {
    if ((e.ctrlKey || e.metaKey) && ['c','v','u','s','a','p'].includes(e.key.toLowerCase())) e.preventDefault();
    if (e.key === 'F12') e.preventDefault();
  }
  function removeProctoring() {
    proctoringActive.current = false;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('keydown', preventKeys);
  }

  async function reportViolation(reason) {
    const now = Date.now();
    if (violationLock.current || now - lastViolationTime.current < 1500) return;
    violationLock.current = true;
    lastViolationTime.current = now;
    try {
      const res = await fetch(`${BACKEND_URL}/api/team/quiz/flag-violation`, {
        method: 'POST', headers: authH, body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.autoSubmitted) {
        removeProctoring(); stopTimer();
        if (document.fullscreenElement) document.exitFullscreen();
        showComplete(); return;
      }
      if (data.disqualified) {
        removeProctoring(); stopTimer();
        if (document.fullscreenElement) document.exitFullscreen();
        showDQ(reason); return;
      }
      showViolationWarning(reason, data.violationCount);
    } catch {}
    setTimeout(() => { violationLock.current = false; }, 2000);
  }

  function showViolationWarning(reason, count) {
    const labels = { tab_switch: 'Tab Switch Detected!', window_blur: 'Window Switch Detected!', fullscreen_exit: 'Fullscreen Exited!' };
    setViolation({
      title: labels[reason] || 'Violation Detected!',
      msg: `This is violation #${count}. ${count < 3 ? 'One more violation will result in automatic submission.' : ''}`,
      count
    });
    let c = 3;
    setViolationCd(c);
    const iv = setInterval(() => {
      c--;
      setViolationCd(c);
      if (c <= 0) { clearInterval(iv); setViolation(null); }
    }, 1000);
  }

  async function handleStart() {
    const alreadyDone = await checkStatus();
    if (alreadyDone) return;
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      showToast('Please allow fullscreen to continue.', 'error'); return;
    }
    setScreen(SCREENS.QUIZ);
    attachProctoring();
    await loadQuestion();
  }

  async function loadQuestion() {
    stopTimer();
    answeredRef.current = false;
    setAnswered(false);
    setSelectedOption(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/team/quiz/start`, { method: 'POST', headers: authH });
      const data = await res.json();
      if (data.alreadyCompleted) { showComplete(); return; }
      if (data.disqualified) { showDQ(data.reason); return; }
      if (data.message && res.status === 403) {
        showToast('Round 1 is not active.', 'error');
        setTimeout(() => navigate('/landing'), 1500); return;
      }
      renderQuestion(data.question);
    } catch {
      showToast('Connection error. Retrying...', 'error');
      setTimeout(loadQuestion, 2000);
    }
  }

  function renderQuestion(q) {
    setQuestion(q);
    timeLimitSeconds.current = q.timeLimitSeconds || 30;
    questionStartTime.current = Date.now();
    setQProgress(`Question ${q.questionNumber} / ${q.totalQuestions}`);
    answeredRef.current = false;
    setAnswered(false);
    setSelectedOption(null);
    startTimer(timeLimitSeconds.current);
  }

  function startTimer(seconds) {
    stopTimer();
    const endTime = Date.now() + seconds * 1000;
    function tick() {
      const remaining = Math.max(0, endTime - Date.now());
      const fraction = remaining / (seconds * 1000);
      setTimerPct(fraction * 100);
      setTimerSecs(Math.ceil(remaining / 1000));
      setTimerWarning(remaining <= 5000);
      if (remaining <= 0) {
        if (!answeredRef.current) autoSubmit();
        return;
      }
      timerRAF.current = requestAnimationFrame(tick);
    }
    timerRAF.current = requestAnimationFrame(tick);
  }
  function stopTimer() {
    if (timerRAF.current) { cancelAnimationFrame(timerRAF.current); timerRAF.current = null; }
  }

  async function autoSubmit() {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setAnswered(true);
    stopTimer();
    await submitToServer('TIMEOUT');
  }

  async function handleOptionClick(value) {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setAnswered(true);
    setSelectedOption(value);
    stopTimer();
    await submitToServer(value);
  }

  async function submitToServer(selectedAnswer) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/team/quiz/answer`, {
        method: 'POST', headers: authH,
        body: JSON.stringify({ questionId: question.id, selectedAnswer })
      });
      const data = await res.json();
      if (res.status === 400 && data.message === 'You have been disqualified.') {
        removeProctoring(); stopTimer();
        if (document.fullscreenElement) document.exitFullscreen();
        showDQ('violation'); return;
      }
      if (data.quizComplete) {
        removeProctoring();
        if (document.fullscreenElement) document.exitFullscreen();
        showComplete();
      } else if (data.question) {
        renderQuestion(data.question);
      }
    } catch {
      showToast('Error submitting answer.', 'error');
    }
  }

  function showComplete() { stopTimer(); removeProctoring(); setScreen(SCREENS.COMPLETE); }
  function showDQ(reason) {
    const labels = { tab_switch: 'Tab switching', window_blur: 'Window switching', fullscreen_exit: 'Exiting fullscreen', violation: 'Repeated violations' };
    setDqReason(`Reason: ${labels[reason] || reason || 'Violations'}. Your score has been set to 0.`);
    setScreen(SCREENS.DQ);
  }

  async function handleLogout() {
    try { await fetch(`${BACKEND_URL}/api/team/logout`, { method: 'POST', headers: authH }); } catch {}
    localStorage.clear();
    if (document.fullscreenElement) document.exitFullscreen();
    navigate('/');
  }

  const opts = question ? [
    { letter: 'A', value: question.optionA },
    { letter: 'B', value: question.optionB },
    { letter: 'C', value: question.optionC },
    { letter: 'D', value: question.optionD },
  ] : [];

  return (
    <>
      <style>{`
        * { box-sizing:border-box; }
        .quiz-root { min-height:100vh; background:#0f0f1a; color:#f1f5f9; font-family:'Nunito',sans-serif; margin:0; }
        .option-btn { background:#1a1a2e; border:2px solid rgba(168,85,247,0.2); color:#f1f5f9;
          border-radius:14px; padding:1.1rem 1.5rem; font-family:'Nunito',sans-serif; font-size:1rem;
          font-weight:700; cursor:pointer; text-align:left; display:flex; align-items:center; gap:0.75rem; transition:all 0.15s; width:100%; }
        .option-btn:hover:not(:disabled) { background:#23234a; border-color:#a855f7; transform:translateY(-1px); }
        .option-btn:disabled { cursor:not-allowed; opacity:0.65; }
        .option-btn.selected { border-color:#a855f7; background:#23234a; }
        .option-letter { width:32px; height:32px; border-radius:8px; background:rgba(168,85,247,0.15);
          display:flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:800;
          color:#a78bfa; flex-shrink:0; }
        .feedback-overlay { position:fixed; top:0; left:0; right:0; padding:1.5rem 2rem;
          display:flex; align-items:center; justify-content:center; gap:0.75rem;
          font-size:1.25rem; font-weight:800; transform:translateY(-100%); transition:transform 0.3s; z-index:100; }
        .feedback-overlay.show { transform:translateY(0); }
        .feedback-overlay.correct-fb { background:linear-gradient(135deg,#052e16,#14532d); border-bottom:2px solid #22c55e; color:#86efac; }
        .feedback-overlay.incorrect-fb { background:linear-gradient(135deg,#2d0a0a,#7f1d1d); border-bottom:2px solid #ef4444; color:#fca5a5; }
        .feedback-overlay.timeout-fb { background:linear-gradient(135deg,#1c1c04,#451a03); border-bottom:2px solid #f59e0b; color:#fcd34d; }
        @media(max-width:600px){.options-grid{grid-template-columns:1fr!important;}}
      `}</style>

      <div className="quiz-root">
        <button className="fixed-logout" onClick={handleLogout} style={{ background: '#1a1a2e', border: '1px solid rgba(168,85,247,0.2)', color: '#94a3b8' }}>
          <span className="material-symbols-rounded">logout</span> Logout
        </button>

        {/* Violation overlay */}
        {violation && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(15,15,26,0.92)', zIndex: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1.5rem'
          }}>
            <div style={{ background: '#2d0a0a', border: '2px solid #ef4444', borderRadius: 20, padding: '2.5rem', maxWidth: 480, textAlign: 'center' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '3rem', color: '#ef4444', display: 'block', marginBottom: '1rem' }}>warning</span>
              <h2 style={{ color: '#fca5a5', margin: '0 0 0.5rem', fontSize: '1.6rem' }}>{violation.title}</h2>
              <p style={{ color: '#fca5a5', margin: 0, fontSize: '1rem', opacity: 0.85 }}>{violation.msg}</p>
            </div>
            <div style={{ fontSize: '3rem', fontWeight: 800, color: '#ef4444', fontFamily: 'monospace' }}>{violationCd}</div>
          </div>
        )}

        {/* PRE SCREEN */}
        {screen === SCREENS.PRE && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem',
            background: 'radial-gradient(circle at 60% 40%,rgba(168,85,247,0.12),transparent 60%)'
          }}>
            <div style={{
              background: '#1a1a2e', borderRadius: 24, border: '1px solid rgba(168,85,247,0.2)',
              padding: '3rem', maxWidth: 560, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
            }}>
              <div style={{
                width: 72, height: 72, background: 'linear-gradient(135deg,#818cf8,#a855f7)', borderRadius: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem'
              }}>
                <span className="material-symbols-rounded" style={{ fontSize: '2rem' }}>quiz</span>
              </div>
              <h1 style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem' }}>Round 1 — Online Quiz</h1>
              <p style={{ textAlign: 'center', color: '#94a3b8', margin: '0 0 2rem' }}>Read the rules carefully before starting</p>
              <div style={{ background: '#12122a', borderRadius: 12, padding: '1.5rem', marginBottom: '2rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>gavel</span> Rules
                </h3>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {[
                    '10 MCQ questions, one at a time with a 30-second timer each',
                    'Answer faster to earn more points per question (max 10 pts)',
                    'Scoring is time-based — no ties are possible',
                    'Fullscreen is required — exiting counts as a violation',
                    <span key="warn" style={{ color: '#fca5a5', fontWeight: 700 }}>Tab switching is monitored. 3rd violation auto-submits your quiz</span>,
                    'Questions auto-submit when time runs out (0 points for that question)',
                    'Do NOT press back or refresh — your session cannot be restored',
                  ].map((rule, i) => (
                    <li key={i} style={{ color: '#cbd5e1', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span style={{ color: '#a78bfa', flexShrink: 0 }}>▸</span>{rule}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={handleStart} style={{
                width: '100%', padding: '1.2rem', background: 'linear-gradient(135deg,#818cf8,#a855f7)', border: 'none',
                borderRadius: 12, color: 'white', fontFamily: "'Nunito',sans-serif", fontSize: '1.1rem', fontWeight: 800,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(168,85,247,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <span className="material-symbols-rounded">play_circle</span> Start Quiz (Enters Fullscreen)
              </button>
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <a href="#" onClick={e => { e.preventDefault(); navigate('/landing'); }} style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none' }}>← Back to Rounds</a>
              </div>
            </div>
          </div>
        )}

        {/* QUIZ SCREEN */}
        {screen === SCREENS.QUIZ && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <div style={{
              padding: '1.2rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.07)'
            }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#94a3b8' }}>{qProgress}</div>
                <div style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>{teamData.teamName}</div>
              </div>
            </div>
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '2rem', maxWidth: 760, margin: '0 auto', width: '100%'
            }}>
              {/* Timer */}
              <div style={{ width: '100%', marginBottom: '1.5rem' }}>
                <div style={{ background: '#1e1e3a', borderRadius: 999, height: 10, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999, width: `${timerPct}%`, transition: 'background 0.3s',
                    background: timerWarning ? 'linear-gradient(90deg,#ef4444,#dc2626)' : 'linear-gradient(90deg,#818cf8,#a855f7)'
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700 }}>Time Remaining</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', color: timerWarning ? '#ef4444' : '#f1f5f9' }}>{timerSecs}</span>
                </div>
              </div>

              {/* Question */}
              <div style={{
                background: '#1a1a2e', borderRadius: 20, border: '1px solid rgba(168,85,247,0.15)',
                padding: '2rem', width: '100%', marginBottom: '1.5rem'
              }}>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, lineHeight: 1.5, margin: 0 }}>
                  {question?.questionText || 'Loading question...'}
                </h2>
              </div>

              {/* Options */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%' }} className="options-grid">
                {opts.map(opt => (
                  <button
                    key={opt.letter}
                    className={`option-btn ${selectedOption === opt.value ? 'selected' : ''}`}
                    disabled={answered}
                    onClick={() => handleOptionClick(opt.value)}
                  >
                    <span className="option-letter">{opt.letter}</span>
                    <span>{opt.value || '—'}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* COMPLETE SCREEN */}
        {screen === SCREENS.COMPLETE && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem',
            background: 'radial-gradient(circle at 50% 40%,rgba(34,197,94,0.08),transparent 60%)'
          }}>
            <div style={{
              background: '#1a1a2e', borderRadius: 24, padding: '3rem', maxWidth: 520, width: '100%',
              textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)'
            }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 1.5rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '2px solid #22c55e', fontSize: '2.5rem'
              }}>
                <span className="material-symbols-rounded">emoji_events</span>
              </div>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem' }}>Quiz Complete!</h1>
              <p style={{ color: '#94a3b8', margin: '0 0 2rem' }}>You've answered all 10 questions. Please wait for the admin results.</p>
              <button onClick={() => navigate('/landing')} style={{
                background: 'linear-gradient(135deg,#818cf8,#a855f7)', border: 'none', borderRadius: 12,
                color: 'white', fontFamily: "'Nunito',sans-serif", fontSize: '1rem', fontWeight: 800,
                padding: '1rem 2rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem'
              }}>
                <span className="material-symbols-rounded">home</span> Back to Rounds
              </button>
            </div>
          </div>
        )}

        {/* DQ SCREEN */}
        {screen === SCREENS.DQ && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem',
            background: 'radial-gradient(circle at 50% 40%,rgba(239,68,68,0.08),transparent 60%)'
          }}>
            <div style={{
              background: '#1a1a2e', borderRadius: 24, padding: '3rem', maxWidth: 520, width: '100%',
              textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid rgba(239,68,68,0.3)'
            }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 1.5rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '2px solid #ef4444', fontSize: '2.5rem'
              }}>
                <span className="material-symbols-rounded">gavel</span>
              </div>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#fca5a5' }}>Disqualified</h1>
              <p style={{ color: '#94a3b8', margin: '0 0 2rem' }}>{dqReason}</p>
              <button onClick={() => navigate('/landing')} style={{
                background: 'linear-gradient(135deg,#dc2626,#b91c1c)', border: 'none', borderRadius: 12,
                color: 'white', fontFamily: "'Nunito',sans-serif", fontSize: '1rem', fontWeight: 800,
                padding: '1rem 2rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem'
              }}>
                <span className="material-symbols-rounded">home</span> Back to Rounds
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
