import { useEffect, useState } from 'react';
import api from '../services/api';
import UploadButton from '../components/UploadButton';
import { notify, askConfirm } from '../components/Dialog';
import Pagination from '../components/Pagination';

// A "media" item holds one or more videos — uploaded to B2 or linked by URL.
export default function Media() {
  const [form, setForm] = useState({ code: '', title: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState({ data: [], current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchList = () => {
    setLoading(true);
    api.get('/media', { params: { page, per_page: 20 } })
      .then(res => setList(res.data))
      .finally(() => setLoading(false));
  };
  useEffect(fetchList, [page]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/media', form);
      notify(`Media ${res.data.media.code} đã tạo`, { title: 'Media', kind: 'success' });
      setForm({ code: '', title: '', description: '' });
      setPage(1);
      fetchList();
    } catch (err) {
      notify(err.response?.data?.message || 'Create failed', { title: 'Media', kind: 'error' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (m) => {
    const ok = await askConfirm(`Xoá media ${m.code} (và ${m.videos_count} video)?`, { title: 'Delete media', okText: 'Delete' });
    if (!ok) return;
    try { await api.delete(`/media/${m.id}`); fetchList(); }
    catch (err) { notify(err.response?.data?.message || 'Delete failed', { title: 'Error', kind: 'error' }); }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-800">Media</h2>
        <p className="text-xs text-neutral-500 mt-1">Mỗi media chứa nhiều video — upload lên B2 hoặc dán link.</p>
      </div>

      {/* Create */}
      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm grid grid-cols-3 gap-3 items-end max-w-3xl">
        <div>
          <label className="text-xs text-neutral-500">Code (để trống = tự sinh)</label>
          <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="auto: MV2605290001" className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-neutral-500">Title</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Tên media (optional)" className="w-full mt-1 px-3 py-2 bg-[#faf8f6] border border-neutral-200 rounded-lg text-sm" />
        </div>
        <button type="submit" disabled={saving} className="px-6 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium">
          {saving ? 'Creating…' : 'Create media'}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <p className="text-neutral-400 text-sm">Loading…</p>
      ) : list.data.length === 0 ? (
        <p className="text-neutral-400 text-sm">Chưa có media nào.</p>
      ) : (
        <div className="space-y-3">
          {list.data.map(m => <MediaCard key={m.id} media={m} onChange={fetchList} onDelete={() => handleDelete(m)} />)}
        </div>
      )}

      <Pagination page={page} lastPage={list.last_page} onChange={setPage} />
    </div>
  );
}

function MediaCard({ media, onChange, onDelete }) {
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const addVideo = async (url, source) => {
    if (!url) return;
    setBusy(true);
    try {
      await api.post(`/media/${media.id}/videos`, { url, source });
      setLinkUrl('');
      onChange();
    } catch (err) {
      notify(err.response?.data?.message || 'Add video failed', { title: 'Media', kind: 'error' });
    } finally { setBusy(false); }
  };

  const removeVideo = async (v) => {
    if (!confirm('Xoá video này?')) return;
    await api.delete(`/media-videos/${v.id}`);
    onChange();
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-mono text-orange-600 text-sm">{media.code}</div>
          {media.title && <div className="text-neutral-800 text-sm">{media.title}</div>}
          <div className="text-[11px] text-neutral-400">{media.videos?.length || 0} video</div>
        </div>
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-600">Delete</button>
      </div>

      {/* Videos */}
      <div className="space-y-2 mb-3">
        {(media.videos || []).length === 0 ? (
          <p className="text-xs text-neutral-400">Chưa có video.</p>
        ) : media.videos.map(v => (
          <div key={v.id} className="flex items-center gap-2 text-xs">
            <span className={`shrink-0 px-1.5 py-0.5 rounded ${v.source === 'upload' ? 'bg-blue-100 text-blue-600' : 'bg-neutral-100 text-neutral-500'}`}>{v.source}</span>
            <a href={v.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-blue-600 hover:underline" title={v.url}>{v.name || v.url}</a>
            <button onClick={() => removeVideo(v)} className="shrink-0 text-red-400 hover:text-red-600">×</button>
          </div>
        ))}
      </div>

      {/* Add video: upload or paste link */}
      <div className="flex items-center gap-2 border-t border-neutral-100 pt-3">
        <UploadButton
          folder={`media/${media.code}`}
          accept="video/*"
          title="Upload video to B2"
          onUrl={(url) => addVideo(url, 'upload')}
        />
        <input
          value={linkUrl}
          onChange={e => setLinkUrl(e.target.value)}
          placeholder="hoặc dán link video (YouTube/Drive/...)"
          className="flex-1 px-3 py-1.5 bg-[#faf8f6] border border-neutral-200 rounded text-sm"
        />
        <button onClick={() => addVideo(linkUrl, 'link')} disabled={busy || !linkUrl} className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50 text-neutral-700 text-xs rounded">Add link</button>
      </div>
    </div>
  );
}
