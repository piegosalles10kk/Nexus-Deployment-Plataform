import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
  Folder, FolderOpen, FileText, ChevronRight, Loader2,
  Save, AlertCircle, CheckCircle2, RefreshCw, Trash2, Copy,
} from 'lucide-react';

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

interface Props {
  projectId: string;
  canEdit: boolean;
}

export default function FileManager({ projectId, canEdit }: Props) {
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, FileEntry[]>>({});
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const loadDir = useCallback(async (path: string) => {
    setLoadingPath(path);
    setError(null);
    try {
      const res = await api.get(`/projects/${projectId}/files`, { params: { path } });
      const entries: FileEntry[] = res.data.data.entries;
      if (path === '') {
        setTree(entries);
      } else {
        setExpanded((prev) => ({ ...prev, [path]: entries }));
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message);
    } finally {
      setLoadingPath(null);
    }
  }, [projectId]);

  useEffect(() => {
    loadDir('');
  }, [loadDir]);

  const toggleDir = async (entry: FileEntry) => {
    if (expanded[entry.path]) {
      // collapse
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[entry.path];
        return next;
      });
    } else {
      await loadDir(entry.path);
    }
  };

  const openFile = async (entry: FileEntry) => {
    if (entry.isDir) return;
    setSelectedFile(entry.path);
    setContent('');
    setSaveStatus('idle');
    setLoadingContent(true);
    setError(null);
    try {
      const res = await api.get(`/projects/${projectId}/files/content`, { params: { path: entry.path } });
      setContent(res.data.data.content);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message);
    } finally {
      setLoadingContent(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      await api.put(`/projects/${projectId}/files/content`, { path: selectedFile, content });
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      setError(err?.response?.data?.message ?? err.message);
    } finally {
      setSaving(false);
    }
  };

  const deletePath = async (path: string) => {
    if (!confirm(`Excluir "${path}" permanentemente?`)) return;
    try {
      await api.delete(`/projects/${projectId}/files`, { params: { path } });
      // Reload parent or root
      const parent = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
      loadDir(parent);
      if (selectedFile === path) {
        setSelectedFile(null);
        setContent('');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message);
    }
  };

  const copyPath = async (path: string) => {
    const name = path.split('/').pop();
    const dest = prompt('Novo nome/caminho:', `${path}_copy`);
    if (!dest) return;
    try {
      await api.post(`/projects/${projectId}/files/copy`, { path, dest });
      const parent = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
      loadDir(parent);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message);
    }
  };

  const renderEntries = (entries: FileEntry[], depth = 0) =>
    entries.map((entry) => (
      <div key={entry.path}>
        <button
          onClick={() => (entry.isDir ? toggleDir(entry) : openFile(entry))}
          className={`group w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-md transition-colors text-left hover:bg-bg-card-hover ${
            selectedFile === entry.path ? 'bg-accent/10 text-accent-light' : 'text-text-secondary'
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {entry.isDir ? (
            <>
              <ChevronRight
                className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded[entry.path] ? 'rotate-90' : ''}`}
              />
              {expanded[entry.path] ? (
                <FolderOpen className="w-4 h-4 shrink-0 text-yellow-400" />
              ) : (
                <Folder className="w-4 h-4 shrink-0 text-yellow-400" />
              )}
            </>
          ) : (
            <>
              <span className="w-3.5 shrink-0" />
              <FileText className="w-4 h-4 shrink-0 text-text-muted" />
            </>
          )}
          <span className="truncate">{entry.name}</span>
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyPath(entry.path);
                  }}
                  className="p-1 rounded hover:bg-bg-primary text-text-muted hover:text-accent transition-colors"
                  title="Duplicar"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePath(entry.path);
                  }}
                  className="p-1 rounded hover:bg-bg-primary text-text-muted hover:text-danger transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            )}
            {loadingPath === entry.path && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
          </div>
        </button>
        {entry.isDir && expanded[entry.path] && (
          <div>{renderEntries(expanded[entry.path], depth + 1)}</div>
        )}
      </div>
    ));

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Sidebar — file tree */}
      <div className="w-64 shrink-0 bg-bg-secondary border border-border rounded-lg flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Arquivos do Projeto</span>
          <button
            onClick={() => loadDir('')}
            className="p-1 rounded hover:bg-bg-card-hover text-text-muted hover:text-text-primary transition-colors"
            title="Recarregar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {loadingPath === '' && tree.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            </div>
          ) : tree.length === 0 ? (
            <p className="text-xs text-text-muted text-center mt-4">
              Nenhum arquivo encontrado.<br />O projeto precisa ter sido deployado ao menos uma vez.
            </p>
          ) : (
            renderEntries(tree)
          )}
        </div>
      </div>

      {/* Editor pane */}
      <div className="flex-1 flex flex-col bg-bg-secondary border border-border rounded-lg overflow-hidden">
        {/* Editor header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm text-text-muted truncate">
            {selectedFile ?? 'Selecione um arquivo para editar'}
          </span>
          {selectedFile && canEdit && (
            <button
              onClick={saveFile}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-light text-white text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
              {saveStatus === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-green-300 ml-1" />}
              {saveStatus === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-300 ml-1" />}
            </button>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">
          {loadingContent ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 p-4 text-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : !selectedFile ? (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              Selecione um arquivo na árvore à esquerda
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              readOnly={!canEdit}
              spellCheck={false}
              className="w-full h-full resize-none bg-transparent text-text-primary text-sm font-mono p-4 focus:outline-none"
              style={{ tabSize: 2 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
