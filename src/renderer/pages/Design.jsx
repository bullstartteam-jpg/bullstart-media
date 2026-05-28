import { useEffect, useState } from 'react';
import api from '../services/api';
import UploadButton from '../components/UploadButton';
import { notify, askConfirm } from '../components/Dialog';
import { UrlPreview, PreviewModal } from '../components/Preview';
import Pagination from '../components/Pagination';

const STATUS_BADGE = {
  new:       'bg-blue-100 text-blue-600',
  converted: 'bg-green-100 text-green-600',
  ganged:    'bg-neutral-200 text-neutral-600',
};

export default function Design() {
  const [form, setForm] = useState({ code: '', name: '', front_url: '', back_url: '' });
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState({ data: [], current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);

  const fetchList = () => {
    setLoading(true);
    api.get('/designs', { params: { page, per_page: 20 } })
      .then(res => setList(res.data))
      .finally(() => setLoading(false));
  };
  useEffect(fetchList, [page]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.front_url && !form.back_url) return notify('Cần ít nhất 1 ảnh (front hoặc back)', { title: 'Design', kind: 'error' });
    setSaving(true);
    try {
      const res = await api.post('/designs', form);
      notify(`Design ${res.data.design.code} đã tạo. Sang Convert _qr để build.`, { title: 'Design created', kind: 'success' });
      setForm({ code: '', name: '', front_url: '', back_url: '' });
      setPage(1);
      fetchList();
    } catch (err) {
      const errs = err.response?.data?.errors;
      notify(err.response?.data?.message || (errs ? Object.values(errs).flat().join('\n') : 'Error'), { title: 'Create failed', kind: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d) => {
    const ok = await askConfirm(`Xoá design ${d.code}?`, { title: 'Delete design', okText: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/designs/${d.id}`);
      fetchList();
    } catch (err) {
      notify(err.response?.data?.message || 'Delete failed', { title: 'Error', kind: 'error' });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-800">Design</h2>
        <p className="text-xs text-neutral-500 mt-1">Upload ảnh design (front/back) → tạo → sang tab Convert _qr build, rồi Gangsheet gộp.</p>
      </div>

      {/* Create form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm space-y-3 max-w-2xl">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500">Code <span className="text-neutral-400">(để trống = tự sinh)</span></label>
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="auto: DM2605280001" className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Tên design (optional)" className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-sm" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-neutral-500">Front design</label>
              <UploadButton folder="designs" accept="image/*" onUrl={(url) => setForm(f => ({ ...f, front_url: url }))} title="Upload front" />
            </div>
            <input value={form.front_url} onChange={e => setForm(f => ({ ...f, front_url: e.target.value }))} placeholder="URL or Upload" className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-sm" />
            <UrlPreview url={form.front_url} onOpen={setPreviewUrl} label="Preview front" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-neutral-500">Back design</label>
              <UploadButton folder="designs" accept="image/*" onUrl={(url) => setForm(f => ({ ...f, back_url: url }))} title="Upload back" />
            </div>
            <input value={form.back_url} onChange={e => setForm(f => ({ ...f, back_url: e.target.value }))} placeholder="URL or Upload" className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-sm" />
            <UrlPreview url={form.back_url} onOpen={setPreviewUrl} label="Preview back" />
          </div>
        </div>
        <button type="submit" disabled={saving} className="px-6 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium">
          {saving ? 'Creating…' : 'Create design'}
        </button>
      </form>

      {/* Recent designs */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2 text-sm font-semibold text-neutral-700 border-b border-neutral-100 bg-[#faf8f6]">
          Designs (total {list.total ?? 0})
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-neutral-500 text-xs border-b border-neutral-200">
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-center">Front</th>
              <th className="px-3 py-2 text-center">Back</th>
              <th className="px-3 py-2 text-center">_qr</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-neutral-400">Loading…</td></tr>
            ) : list.data.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-neutral-400">Chưa có design nào.</td></tr>
            ) : list.data.map(d => (
              <tr key={d.id} className="border-b border-neutral-100 hover:bg-orange-50/30">
                <td className="px-3 py-1.5 font-mono text-orange-600 text-xs">{d.code}</td>
                <td className="px-3 py-1.5 text-neutral-700">{d.name || '-'}</td>
                <td className="px-3 py-1.5 text-center">{d.front_url ? <button onClick={() => setPreviewUrl(d.front_url)} className="text-xs text-blue-600 hover:underline">view</button> : <span className="text-neutral-300">—</span>}</td>
                <td className="px-3 py-1.5 text-center">{d.back_url ? <button onClick={() => setPreviewUrl(d.back_url)} className="text-xs text-blue-600 hover:underline">view</button> : <span className="text-neutral-300">—</span>}</td>
                <td className="px-3 py-1.5 text-center text-xs">
                  {d.front_qr || d.back_qr ? <span className="text-green-600">✓</span> : <span className="text-neutral-300">—</span>}
                </td>
                <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[d.status] || 'bg-neutral-100 text-neutral-500'}`}>{d.status}</span></td>
                <td className="px-3 py-1.5 text-xs text-neutral-500">{new Date(d.created_at).toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right"><button onClick={() => handleDelete(d)} className="text-xs text-red-500 hover:text-red-600">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} lastPage={list.last_page} onChange={setPage} />
      <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </div>
  );
}
