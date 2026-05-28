import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { buildMediaGangsheet, mediaGangsheetFilename } from '../services/mediaGangsheet';
import { uploadFileToB2 } from '../services/uploadB2';
import { notify, askConfirm } from '../components/Dialog';
import Pagination from '../components/Pagination';

export default function Gangsheet() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState('compose');
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold text-neutral-800">Gangsheet</h2>
      <div className="flex gap-2 border-b border-neutral-200">
        <TabBtn active={tab === 'compose'} onClick={() => setTab('compose')}>Compose</TabBtn>
        <TabBtn active={tab === 'manage'} onClick={() => setTab('manage')}>Manage</TabBtn>
      </div>
      {tab === 'compose' && <ComposeTab />}
      {tab === 'manage' && <ManageTab isAdmin={hasRole('admin')} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${active ? 'border-orange-500 text-orange-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>{children}</button>
  );
}

function ComposeTab() {
  const [pending, setPending] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);

  const fetchPending = () => {
    setLoading(true);
    api.get('/gangsheets/pending-designs', { params: { per_page: 200 } })
      .then(res => { setPending(res.data.data || []); setSelected(new Set()); })
      .finally(() => setLoading(false));
  };
  useEffect(fetchPending, []);

  const toggle = (id) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map(d => d.id)));
  };

  const handleGenerate = async () => {
    const designs = pending.filter(d => selected.has(d.id));
    if (designs.length === 0) return notify('Chọn ít nhất 1 design', { title: 'Gangsheet', kind: 'error' });
    if (!window.electronAPI?.s3Upload) return notify('Cần mở từ desktop app để build + upload PDF.', { title: 'Gangsheet', kind: 'error' });

    setRunning(true);
    setProgress({ done: 0, total: 0 });
    try {
      const built = await buildMediaGangsheet(designs, {
        onProgress: (p) => setProgress({ done: p.done, total: p.total }),
      });
      const filename = mediaGangsheetFilename({
        firstCode: built.firstCode, lastCode: built.lastCode,
        designsCount: designs.length, facesCount: built.faces,
      });
      const file = new File([built.blob], filename, { type: 'application/pdf' });
      const { url } = await uploadFileToB2(file, { folder: 'gangsheet', filename });

      await api.post('/gangsheets', {
        filename,
        file_url: url,
        first_code: built.firstCode,
        last_code: built.lastCode,
        designs_count: designs.length,
        sides_count: built.faces,
        design_ids: built.designIds,
      });
      notify(`Gangsheet tạo xong: ${filename} (${built.faces} faces)`, { title: 'Gangsheet', kind: 'success' });
      fetchPending();
    } catch (err) {
      notify(err.response?.data?.message || err.message || 'Generate failed', { title: 'Gangsheet failed', kind: 'error' });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-neutral-600">Pending designs: <b className="text-orange-600">{pending.length}</b></span>
        <span className="text-[11px] text-neutral-400">1 face = 1 page (Letter landscape, design căn giữa + alignment marks)</span>
        <button onClick={handleGenerate} disabled={running || selected.size === 0} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium ml-auto">
          {running ? (progress ? `Building ${progress.done}/${progress.total}…` : 'Building…') : `Generate (${selected.size})`}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-neutral-500 text-xs border-b border-neutral-200 bg-[#faf8f6]">
              <th className="px-3 py-2 w-8 text-center"><input type="checkbox" onChange={toggleAll} checked={pending.length > 0 && selected.size === pending.length} className="accent-orange-500" /></th>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-center">Front _qr</th>
              <th className="px-3 py-2 text-center">Back _qr</th>
              <th className="px-3 py-2 text-left">When</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-neutral-400">Loading…</td></tr>
            ) : pending.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-neutral-400">Không có design nào đã convert chờ gộp.</td></tr>
            ) : pending.map(d => (
              <tr key={d.id} className={`border-b border-neutral-100 hover:bg-orange-50/30 ${selected.has(d.id) ? 'bg-orange-50/60' : ''}`}>
                <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="accent-orange-500" /></td>
                <td className="px-3 py-1.5 font-mono text-orange-600 text-xs">{d.code}</td>
                <td className="px-3 py-1.5 text-neutral-700">{d.name || '-'}</td>
                <td className="px-3 py-1.5 text-center text-xs">{d.front_qr ? '✓' : '—'}</td>
                <td className="px-3 py-1.5 text-center text-xs">{d.back_qr ? '✓' : '—'}</td>
                <td className="px-3 py-1.5 text-xs text-neutral-500">{new Date(d.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ManageTab({ isAdmin }) {
  const [list, setList] = useState({ data: [], current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchList = () => {
    setLoading(true);
    api.get('/gangsheets', { params: { page, per_page: 20 } })
      .then(res => setList(res.data)).finally(() => setLoading(false));
  };
  useEffect(fetchList, [page]);

  const handleDelete = async (g) => {
    const ok = await askConfirm(`Xoá gangsheet ${g.filename}?`, { title: 'Delete', okText: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/gangsheets/${g.id}`); fetchList(); }
    catch (err) { notify(err.response?.data?.message || 'Delete failed', { title: 'Error', kind: 'error' }); }
  };

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-neutral-500 text-xs border-b border-neutral-200 bg-[#faf8f6]">
              <th className="px-3 py-2 text-left">Filename</th>
              <th className="px-3 py-2 text-left">Range</th>
              <th className="px-3 py-2 text-right">Designs</th>
              <th className="px-3 py-2 text-right">Faces</th>
              <th className="px-3 py-2 text-left">By</th>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-neutral-400">Loading…</td></tr>
            ) : list.data.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-neutral-400">Chưa có gangsheet nào.</td></tr>
            ) : list.data.map(g => (
              <tr key={g.id} className="border-b border-neutral-100 hover:bg-orange-50/30">
                <td className="px-3 py-1.5 font-mono text-xs text-neutral-700 truncate max-w-[280px]">{g.filename}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-neutral-500">{g.first_code}{g.first_code !== g.last_code && <> → {g.last_code}</>}</td>
                <td className="px-3 py-1.5 text-right">{g.designs_count}</td>
                <td className="px-3 py-1.5 text-right">{g.sides_count}</td>
                <td className="px-3 py-1.5 text-xs">{g.creator?.name || '-'}</td>
                <td className="px-3 py-1.5 text-xs text-neutral-500">{new Date(g.created_at).toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right">
                  <div className="flex gap-3 justify-end">
                    <a href={g.file_url} target="_blank" rel="noreferrer" className="text-xs text-orange-500 hover:text-orange-600">Download</a>
                    {isAdmin && <button onClick={() => handleDelete(g)} className="text-xs text-red-500 hover:text-red-600">Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} lastPage={list.last_page} onChange={setPage} />
    </div>
  );
}
