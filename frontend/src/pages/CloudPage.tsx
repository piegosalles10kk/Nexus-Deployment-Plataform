import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Cloud, Plus, Trash2, Server, Loader2, AlertCircle, CheckCircle2,
  RefreshCw, X, Globe, Cpu, RotateCw, Copy, Check
} from 'lucide-react';

interface CloudProvider {
  id: string;
  name: string;
  type: 'AWS' | 'DIGITALOCEAN' | 'AZURE' | 'GCP';
  region: string;
  createdAt: string;
  _count: { servers: number };
}

interface CloudServer {
  id: string;
  name: string;
  region: string;
  instanceType: string;
  ip: string | null;
  status: 'PROVISIONING' | 'RUNNING' | 'STOPPED' | 'ERROR';
  agentConnected: boolean;
  agentVersion: string | null;
  lastError: string | null;
  createdAt: string;
}

const statusConfig = {
  PROVISIONING: { label: 'Provisionando', color: 'text-warning', dot: 'bg-warning animate-pulse' },
  RUNNING:      { label: 'Online',         color: 'text-success', dot: 'bg-success animate-pulse-status' },
  STOPPED:      { label: 'Parado',         color: 'text-text-muted', dot: 'bg-border' },
  ERROR:        { label: 'Erro',           color: 'text-danger',  dot: 'bg-danger' },
};

const DO_REGIONS    = ['nyc3', 'sfo3', 'ams3', 'sgp1', 'lon1', 'fra1', 'tor1', 'blr1'];
const DO_SIZES      = ['s-1vcpu-1gb', 's-1vcpu-2gb', 's-2vcpu-2gb', 's-2vcpu-4gb', 's-4vcpu-8gb'];
const AWS_REGIONS   = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', 'sa-east-1'];
const AWS_TYPES     = ['t3.micro', 't3.small', 't3.medium', 't3.large', 'm5.large'];
const AZURE_REGIONS = ['eastus', 'westus2', 'westeurope', 'brazilsouth', 'southeastasia', 'australiaeast', 'uksouth'];
const AZURE_TYPES   = ['Standard_B1s', 'Standard_B2s', 'Standard_B2ms', 'Standard_D2s_v3', 'Standard_D4s_v3'];
const GCP_REGIONS   = ['us-central1', 'us-east1', 'us-west1', 'southamerica-east1', 'europe-west1', 'asia-southeast1', 'australia-southeast1'];
const GCP_TYPES     = ['e2-micro', 'e2-small', 'e2-medium', 'n2-standard-2', 'n2-standard-4', 'c2-standard-4'];

const inputClass = 'w-full px-3 py-2.5 rounded-lg bg-bg-input border border-border text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-colors';
const selectClass = inputClass;

// ─── Add Provider Modal ───────────────────────────────────────────────────────
function AddProviderModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'AWS' | 'DIGITALOCEAN' | 'AZURE' | 'GCP'>('DIGITALOCEAN');
  const [apiKey, setApiKey] = useState('');       // DO token | AWS secret | Azure client secret | GCP SA JSON
  const [apiKeyId, setApiKeyId] = useState('');   // AWS access key ID | Azure client ID
  const [tenantId, setTenantId] = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [gcpProjectId, setGcpProjectId] = useState(''); // auto-extracted from SA JSON
  const [region, setRegion] = useState('nyc3');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const regions =
    type === 'DIGITALOCEAN' ? DO_REGIONS :
    type === 'AZURE'        ? AZURE_REGIONS :
    type === 'GCP'          ? GCP_REGIONS :
                              AWS_REGIONS;

  const handleTypeChange = (t: 'AWS' | 'DIGITALOCEAN' | 'AZURE' | 'GCP') => {
    setType(t);
    const defaultRegion =
      t === 'DIGITALOCEAN' ? 'nyc3' :
      t === 'AZURE'        ? 'eastus' :
      t === 'GCP'          ? 'us-central1' :
                             'us-east-1';
    setRegion(defaultRegion);
    setApiKey(''); setApiKeyId(''); setTenantId(''); setSubscriptionId(''); setGcpProjectId('');
  };

  // Auto-extract project_id when user pastes GCP service account JSON
  const handleGcpJsonChange = (value: string) => {
    setApiKey(value);
    try {
      const sa = JSON.parse(value);
      if (sa.project_id) setGcpProjectId(sa.project_id);
    } catch { /* not valid JSON yet */ }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/cloud/providers', {
        name, type, apiKey, region,
        apiKeyId: apiKeyId || undefined,
        tenantId: tenantId || undefined,
        subscriptionId: subscriptionId || undefined,
      });
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Falha ao adicionar provider.');
    } finally {
      setSaving(false);
    }
  };

  const providerLabel: Record<'AWS' | 'DIGITALOCEAN' | 'AZURE' | 'GCP', string> = {
    DIGITALOCEAN: '💧 DigitalOcean',
    AWS: '☁️ AWS',
    AZURE: '🔷 Azure',
    GCP: '🟡 GCP',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-bg-secondary border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Adicionar Cloud Provider</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/8 border border-danger/25 text-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Minha conta AWS" required className={inputClass} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Provedor</label>
            <div className="grid grid-cols-2 gap-2">
              {(['DIGITALOCEAN', 'AWS', 'AZURE', 'GCP'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                    type === t
                      ? 'bg-accent/10 border-accent/40 text-accent-light'
                      : 'bg-bg-card border-border text-text-secondary hover:text-text-primary hover:bg-bg-card-hover'
                  }`}
                >
                  {providerLabel[t]}
                </button>
              ))}
            </div>
          </div>

          {/* AWS fields */}
          {type === 'AWS' && (
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Access Key ID</label>
              <input value={apiKeyId} onChange={(e) => setApiKeyId(e.target.value)} placeholder="AKIAIOSFODNN7EXAMPLE" required className={inputClass} />
            </div>
          )}

          {/* Azure fields */}
          {type === 'AZURE' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Subscription ID</label>
                <input value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Tenant ID</label>
                <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Client ID (App ID)</label>
                <input value={apiKeyId} onChange={(e) => setApiKeyId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required className={inputClass} />
              </div>
            </>
          )}

          {/* GCP: Service Account JSON textarea */}
          {type === 'GCP' ? (
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                Service Account JSON
              </label>
              <textarea
                value={apiKey}
                onChange={(e) => handleGcpJsonChange(e.target.value)}
                placeholder={'{\n  "type": "service_account",\n  "project_id": "meu-projeto",\n  ...\n}'}
                rows={6}
                required
                className={`${inputClass} font-mono text-xs resize-none`}
              />
              {gcpProjectId && (
                <p className="text-[11px] text-success mt-1">Project detectado: <span className="font-semibold">{gcpProjectId}</span></p>
              )}
              <p className="text-[11px] text-text-muted mt-1">Cole o conteúdo do arquivo .json da service account. Armazenado criptografado (AES-256).</p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                {type === 'DIGITALOCEAN' ? 'Personal Access Token' : 'Secret Access Key / Client Secret'}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  type === 'DIGITALOCEAN' ? 'dop_v1_...' :
                  type === 'AZURE'        ? 'Valor do client secret...' :
                                            'wJalrXUtnFEMI/K7MDENG/...'
                }
                required
                className={inputClass}
              />
              <p className="text-[11px] text-text-muted mt-1">Armazenado de forma criptografada (AES-256)</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Região padrão</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className={selectClass}>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-semibold hover:text-text-primary hover:bg-bg-card-hover transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-semibold disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Provision Server Modal ────────────────────────────────────────────────────
function ProvisionModal({
  provider,
  onClose,
  onProvisioned,
}: {
  provider: CloudProvider;
  onClose: () => void;
  onProvisioned: () => void;
}) {
  const [name, setName] = useState('');
  const [instanceType, setInstanceType] = useState(
    provider.type === 'DIGITALOCEAN' ? 's-1vcpu-1gb' :
    provider.type === 'GCP'          ? 'e2-micro' :
    provider.type === 'AZURE'        ? 'Standard_B1s' :
                                       't3.micro',
  );
  const [region, setRegion] = useState(provider.region);
  const [sshPublicKey, setSshPublicKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const regions =
    provider.type === 'DIGITALOCEAN' ? DO_REGIONS :
    provider.type === 'AZURE'        ? AZURE_REGIONS :
    provider.type === 'GCP'          ? GCP_REGIONS :
                                       AWS_REGIONS;
  const types =
    provider.type === 'DIGITALOCEAN' ? DO_SIZES :
    provider.type === 'AZURE'        ? AZURE_TYPES :
    provider.type === 'GCP'          ? GCP_TYPES :
                                       AWS_TYPES;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/cloud/providers/${provider.id}/servers`, { name, instanceType, region, sshPublicKey });
      onProvisioned();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Falha ao provisionar servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-bg-secondary border border-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Provisionar Servidor</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/8 border border-danger/25 text-danger text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Nome do servidor</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="prod-api-01" required className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Região</label>
              <select value={region} onChange={(e) => setRegion(e.target.value)} className={selectClass}>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Tipo de instância</label>
              <select value={instanceType} onChange={(e) => setInstanceType(e.target.value)} className={selectClass}>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">SSH Public Key</label>
            <textarea
              value={sshPublicKey}
              onChange={(e) => setSshPublicKey(e.target.value)}
              placeholder="ssh-rsa AAAA..."
              rows={3}
              required
              className={`${inputClass} font-mono text-xs resize-none`}
            />
            <p className="text-[11px] text-text-muted mt-1">Injetada via Terraform para acesso root ao servidor</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-semibold hover:text-text-primary hover:bg-bg-card-hover transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-semibold disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
              Provisionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Server Card ──────────────────────────────────────────────────────────────
function ServerCard({
  server,
  providerId,
  onDeleted,
}: {
  server: CloudServer;
  providerId: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [copied, setCopied] = useState(false);
  const cfg = statusConfig[server.status];

  const handleDelete = async () => {
    if (!confirm(`Destruir o servidor "${server.name}" via Terraform? Esta ação é irreversível.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/cloud/providers/${providerId}/servers/${server.id}`);
      // Trigger exit animation, then notify parent
      setRemoving(true);
      setTimeout(() => onDeleted(), 400);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao destruir servidor.');
      setDeleting(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm(`Reiniciar o servidor "${server.name}"?`)) return;
    setRestarting(true);
    try {
      const res = await api.post(`/cloud/providers/${providerId}/servers/${server.id}/restart`);
      alert(res.data.message);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao reiniciar servidor.');
    } finally {
      setRestarting(false);
    }
  };

  const copyIp = () => {
    if (!server.ip) return;
    navigator.clipboard.writeText(server.ip);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="bg-bg-card border border-border rounded-xl p-5 flex items-center justify-between gap-4 group hover:border-border/80 transition-colors"
      style={{
        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: removing ? 0 : 1,
        transform: removing ? 'scale(0.95) translateY(-4px)' : 'scale(1) translateY(0)',
        maxHeight: removing ? '0px' : '300px',
        overflow: 'hidden',
        paddingTop: removing ? '0px' : undefined,
        paddingBottom: removing ? '0px' : undefined,
        borderWidth: removing ? '0px' : undefined,
        marginTop: removing ? '0px' : undefined,
        marginBottom: removing ? '0px' : undefined,
      }}
    >
      <div className="flex items-center gap-5 min-w-0 flex-1">
        {/* OS Icon box */}
        <div 
          className="w-12 h-12 rounded-full bg-gradient-to-br from-[#E95420]/10 to-[#E95420]/5 border border-[#E95420]/20 flex items-center justify-center shrink-0"
          title="Ubuntu Linux"
        >
          <span className="text-[#E95420] font-black text-[10px] tracking-[0.2em] uppercase origin-center transform -rotate-90 block">Ubu</span>
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-1.5">
            <p className="text-base font-bold text-text-primary truncate">{server.name}</p>
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-border/50 text-[10px] font-bold uppercase tracking-widest ${cfg.color} bg-bg-primary shadow-sm`}>
               <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
               {cfg.label}
            </div>
            {server.agentConnected && (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20 shadow-sm">
                <CheckCircle2 className="w-3 h-3" /> Agent Online
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-muted">
            <span className="flex items-center gap-1.5 font-medium"><Globe className="w-3.5 h-3.5 opacity-60" />{server.region}</span>
            <span className="flex items-center gap-1.5 font-medium"><Cpu className="w-3.5 h-3.5 opacity-60" />{server.instanceType}</span>
            {server.ip && (
              <button 
                onClick={copyIp}
                title="Copiar Endereço IP"
                className="flex items-center gap-2 text-text-secondary hover:text-accent-light transition-colors font-mono tracking-tight bg-bg-secondary hover:bg-accent/10 px-2 py-0.5 rounded-md border border-border hover:border-accent/30 group/ip"
              >
                {server.ip} {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3 h-3 opacity-40 group-hover/ip:opacity-100" />}
              </button>
            )}
            {server.agentConnected && server.agentVersion && (
              <span className="text-[10px] font-mono opacity-50 bg-bg-secondary px-1.5 rounded">v{server.agentVersion}</span>
            )}
          </div>
          {server.status === 'ERROR' && server.lastError && (
            <details className="mt-3">
              <summary className="text-xs text-danger font-semibold cursor-pointer select-none hover:underline inline-flex items-center gap-1 bg-danger/10 px-2 py-1 rounded-md">
                <AlertCircle className="w-3 h-3" /> Detalhes do erro de provisionamento
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-danger/5 border border-danger/20 text-[11px] text-danger/90 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto w-full">
                {server.lastError}
              </pre>
            </details>
          )}
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-2 opacity-100 sm:opacity-50 group-hover:opacity-100 transition-opacity shrink-0">
         <button
            onClick={handleRestart}
            disabled={restarting || server.status !== 'RUNNING'}
            title="Reiniciar servidor"
            className="p-2.5 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-bg-card-hover transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
         >
            <RotateCw className={`w-4 h-4 ${restarting ? 'animate-spin text-accent' : ''}`} />
         </button>
         <button
            onClick={handleDelete}
            disabled={deleting}
            title="Destruir servidor"
            className="p-2.5 rounded-lg border border-danger/20 text-danger/60 hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
         >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
         </button>
      </div>
    </div>
  );
}

// ─── Provider Card ─────────────────────────────────────────────────────────────
function ProviderCard({
  provider,
  onDeleted,
  onRefresh,
}: {
  provider: CloudProvider;
  onDeleted: () => void;
  onRefresh: () => void;
}) {
  const [servers, setServers] = useState<CloudServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showProvision, setShowProvision] = useState(false);

  const loadServers = async () => {
    setLoadingServers(true);
    try {
      const res = await api.get(`/cloud/providers/${provider.id}/servers`);
      setServers(res.data.data.servers);
    } catch { /* silent */ } finally {
      setLoadingServers(false);
    }
  };

  const silentRefresh = async () => {
    try {
      const res = await api.get(`/cloud/providers/${provider.id}/servers`);
      setServers(res.data.data.servers);
    } catch { /* silent */ }
  };

  const toggleExpand = () => {
    if (!expanded) loadServers();
    setExpanded((v) => !v);
  };

  // Auto-poll every 10s when expanded — stops when all servers are stable
  useEffect(() => {
    if (!expanded) return;
    const hasUnstable = servers.some(
      (s) => s.status === 'PROVISIONING' || s.status === 'STOPPED',
    );
    if (!hasUnstable && servers.length > 0) return; // all stable, no need to poll
    const interval = setInterval(silentRefresh, 10_000);
    return () => clearInterval(interval);
  }, [expanded, servers]);

  const deleteProvider = async () => {
    if (!confirm(`Remover o provider "${provider.name}"? Todos os servidores associados serão removidos do banco.`)) return;
    try {
      await api.delete(`/cloud/providers/${provider.id}`);
      onDeleted();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao remover provider.');
    }
  };

  const unstableCount = servers.filter(
    (s) => s.status === 'PROVISIONING' || s.status === 'STOPPED',
  ).length;

  return (
    <>
      <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
        {/* Provider header */}
        <div className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-bg-secondary border border-border flex items-center justify-center text-lg shrink-0">
              {provider.type === 'DIGITALOCEAN' ? '💧' : provider.type === 'AZURE' ? '🔷' : provider.type === 'GCP' ? '🟡' : '☁️'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary truncate">{provider.name}</p>
              <p className="text-xs text-text-muted">{provider.type} · {provider.region} · {provider._count.servers} servidor(es)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowProvision(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/25 text-accent-light hover:bg-accent/20 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Provisionar
            </button>
            <button
              onClick={toggleExpand}
              className="relative px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-bg-card-hover text-xs font-semibold transition-colors"
            >
              {expanded ? 'Recolher' : 'Servidores'}
              {expanded && unstableCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-warning animate-pulse" />
              )}
            </button>
            <button
              onClick={deleteProvider}
              className="p-1.5 rounded-md border border-danger/20 text-danger/60 hover:text-danger hover:bg-danger/8 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Servers list */}
        {expanded && (
          <div className="border-t border-border p-4 space-y-3 bg-bg-primary">
            {loadingServers && servers.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-accent animate-spin" />
              </div>
            ) : servers.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">Nenhum servidor provisionado ainda.</p>
            ) : (
              servers.map((s) => (
                <ServerCard
                  key={s.id}
                  server={s}
                  providerId={provider.id}
                  onDeleted={() => { loadServers(); onRefresh(); }}
                />
              ))
            )}
            <div className="flex items-center justify-between">
              <button
                onClick={loadServers}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${loadingServers ? 'animate-spin' : ''}`} /> Atualizar lista
              </button>
              {unstableCount > 0 && (
                <span className="text-xs text-warning flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Atualizando automaticamente…
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {showProvision && (
        <ProvisionModal
          provider={provider}
          onClose={() => setShowProvision(false)}
          onProvisioned={() => { loadServers(); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CloudPage() {
  const [providers, setProviders] = useState<CloudProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddProvider, setShowAddProvider] = useState(false);

  const load = async () => {
    setError('');
    try {
      const res = await api.get('/cloud/providers');
      setProviders(res.data.data.providers);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Falha ao carregar providers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 border border-accent/20">
              <Cloud className="w-5 h-5 text-accent-light" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">Módulo Cloud</h1>
              <p className="text-sm text-text-secondary mt-0.5">Gerencie servidores remotos via Terraform (AWS · Azure · GCP · DigitalOcean)</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddProvider(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Provider
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 text-xs text-text-secondary space-y-1.5">
        <p className="font-semibold text-text-primary">Como funciona</p>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li>Adicione um provider com suas credenciais de API (criptografadas em AES-256).</li>
          <li>Clique em <strong>Provisionar</strong> — o backend executa <code className="text-accent-light">terraform apply</code> criando a VPS.</li>
          <li>O cloud-init instala Docker + Nexus Agent automaticamente na VPS.</li>
          <li>O Nexus Agent se conecta de volta à plataforma via WebSocket para receber comandos de deploy.</li>
        </ol>
        <p className="text-warning font-semibold pt-1">⚠️ Requer a CLI do Terraform instalada no servidor da plataforma.</p>
      </div>

      {/* Providers */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 text-accent animate-spin" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-danger/8 border border-danger/25 text-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-lg p-16 text-center">
          <Cloud className="w-12 h-12 mx-auto mb-4 text-text-muted opacity-30" />
          <p className="text-sm font-semibold text-text-secondary mb-1">Nenhum provider configurado</p>
          <p className="text-xs text-text-muted mb-6">Adicione um provider AWS, Azure, GCP ou DigitalOcean para começar a provisionar servidores.</p>
          <button
            onClick={() => setShowAddProvider(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Adicionar primeiro provider
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} onDeleted={load} onRefresh={load} />
          ))}
        </div>
      )}

      {showAddProvider && (
        <AddProviderModal onClose={() => setShowAddProvider(false)} onAdded={load} />
      )}
    </div>
  );
}
