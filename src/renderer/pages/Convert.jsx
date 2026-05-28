import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { runConvertPass } from '../services/mediaConverter';
import { notify } from '../components/Dialog';

const AUTO_KEY = 'media_convert_auto_interval'; // 'off' | '1m' | '5m'

export default function Convert() {
  const [pendingCount, setPendingCount] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [log, setLog] = useState([]);
  const [auto, setAuto] = useState(() => localStorage.getItem(AUTO_KEY) || 'off');
  const timerRef = useRef(null);
  const runningRef = useRef(false);

  const pushLog = (msg, kind = 'info') =>
    setLog(prev => [{ at: new Date(), msg, kind }, ...prev].slice(0, 100));

  const refreshPending = () => {
    api.get('/designs/pending-convert', { params: { per_page: 1 } })
      .then(res => setPendingCount(res.data.total ?? (res.data.data || []).length))
      .catch(() => {});
  };
  useEffect(refreshPending, []);

  const run = async (silent = false) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setProgress({ done: 0, total: 0 });
    try {
      const res = await runConvertPass((p) => {
        setProgress({ done: p.done, total: p.total });
        if (p.message) pushLog(p.message);
      });
      pushLog(`Pass xong: ${res.ok} ok, ${res.failed} fail / ${res.total}`, res.failed ? 'error' : 'ok');
      if (res.errors.length) res.errors.forEach(e => pushLog(e, 'error'));
      if (!silent) notify(`Convert: ${res.ok}/${res.total} ok${res.failed ? `, ${res.failed} fail` : ''}`, { title: 'Convert _qr', kind: res.failed ? 'warning' : 'success' });
    } catch (err) {
      pushLog(err.message || 'Convert failed', 'error');
      if (!silent) notify(err.message || 'Convert failed', { title: 'Convert _qr', kind: 'error' });
    } finally {
      setRunning(false);
      runningRef.current = false;
      setProgress(null);
      refreshPending();
    }
  };

  // Auto interval (per-device, while window open).
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (auto === 'off') return;
    const ms = { '1m': 60_000, '5m': 5 * 60_000 }[auto];
    if (!ms) return;
    timerRef.current = setInterval(() => run(true), ms);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const setAutoInterval = (v) => { setAuto(v); localStorage.setItem(AUTO_KEY, v); };

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-neutral-800">Convert _qr</h2>
          <p className="text-xs text-neutral-500 mt-1">Build QR overlay cho các design chưa convert, upload B2, lưu link _qr.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">Pending: <b className="text-orange-600">{pendingCount ?? '…'}</b></span>
          <select value={auto} onChange={e => setAutoInterval(e.target.value)} className="px-2 py-1.5 bg-white border border-neutral-200 rounded text-sm">
            <option value="off">Auto: Off</option>
            <option value="1m">Auto: 1 phút</option>
            <option value="5m">Auto: 5 phút</option>
          </select>
          <button onClick={() => run(false)} disabled={running} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium">
            {running ? (progress ? `Converting ${progress.done}/${progress.total}…` : 'Converting…') : 'Run convert now'}
          </button>
        </div>
      </div>

      {auto !== 'off' && <p className="text-[11px] text-amber-700">⚠ Auto chỉ chạy khi cửa sổ app đang mở.</p>}

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2 text-sm font-semibold text-neutral-700 border-b border-neutral-100 bg-[#faf8f6]">Log</div>
        <div className="max-h-[60vh] overflow-y-auto text-xs font-mono">
          {log.length === 0 ? (
            <p className="p-4 text-neutral-400">Chưa chạy lần nào.</p>
          ) : log.map((l, i) => (
            <div key={i} className={`px-4 py-1 border-b border-neutral-50 ${l.kind === 'error' ? 'text-red-500' : l.kind === 'ok' ? 'text-green-600' : 'text-neutral-600'}`}>
              <span className="text-neutral-400">{l.at.toLocaleTimeString()}</span> · {l.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
