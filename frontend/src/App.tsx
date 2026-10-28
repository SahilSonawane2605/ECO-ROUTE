import { useState, useEffect } from 'react';
import {
  Waves,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  MapPin,
  Info,
  LogOut,
  Shield,
  FileText
} from 'lucide-react';
import type { ReportItem, MunicipalAsset, ModelMetrics, User } from './types';
import { ReportMap } from './components/ReportMap';
import { SubmitReportModal } from './components/SubmitReportModal';
import { ReportDetailDrawer } from './components/ReportDetailDrawer';
import { AuthModal } from './components/AuthModal';

export function App() {
  // Auth state
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('ecoroute_token'));
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('ecoroute_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authModalConfig, setAuthModalConfig] = useState<{
    isOpen: boolean;
    mode: 'citizen_login' | 'admin_login';
  }>({ isOpen: false, mode: 'citizen_login' });

  // Data state
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [assets, setAssets] = useState<MunicipalAsset[]>([]);
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // GIS toggles
  const [showDrains, setShowDrains] = useState(true);
  const [showWaterways, setShowWaterways] = useState(true);

  // Active drawer & modal
  const [activeReport, setActiveReport] = useState<ReportItem | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'reports' | 'map' | 'model_audit'>('reports');

  const handleLoginSuccess = (newToken: string, newUser: User) => {
    setToken(newToken);
    setCurrentUser(newUser);
    localStorage.setItem('ecoroute_token', newToken);
    localStorage.setItem('ecoroute_user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    localStorage.removeItem('ecoroute_token');
    localStorage.removeItem('ecoroute_user');
    setReports([]);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [repRes, assetRes, metricsRes] = await Promise.all([
        fetch('/api/reports', { headers }),
        fetch('/api/municipal/assets'),
        fetch('/api/model/info'),
      ]);

      if (repRes.ok) {
        const data = await repRes.json();
        setReports(data.reports || []);
      } else if (repRes.status === 401) {
        handleLogout();
      }

      if (assetRes.ok) {
        const data = await assetRes.json();
        setAssets(data.assets || []);
      }
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setModelMetrics(data);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    } else {
      // Load public assets & metrics even if not logged in
      Promise.all([
        fetch('/api/municipal/assets').then(r => r.json()).then(d => setAssets(d.assets || [])).catch(() => {}),
        fetch('/api/model/info').then(r => r.json()).then(d => setModelMetrics(d)).catch(() => {})
      ]);
    }
  }, [token]);

  // Filter reports
  const filteredReports = reports.filter((r) => {
    if (selectedType !== 'all' && r.report_type !== selectedType) return false;
    if (selectedStatus !== 'all' && r.status !== selectedStatus) return false;
    if (selectedRisk !== 'all' && r.risk_level !== selectedRisk) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        r.title.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        r.ml_category.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const isMunicipalAdmin = currentUser?.role === 'municipal_admin';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white ${
              isMunicipalAdmin ? 'bg-slate-900' : 'bg-emerald-800'
            }`}>
              <Waves className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-900 tracking-tight">ECO-ROUTE</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  isMunicipalAdmin 
                    ? 'bg-slate-900 text-white border-slate-900' 
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                  {isMunicipalAdmin ? 'Municipal Administration Portal' : 'Pune Citizen Intelligence Portal'}
                </span>
              </div>
              <p className="text-xs text-slate-500">Plastic Waste Drainage Hazards & Urban Waterlogging Prevention</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {/* View Switchers */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setActiveTab('reports')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  activeTab === 'reports' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isMunicipalAdmin ? 'Municipal Command Console' : 'My Reports'}
              </button>
              <button
                onClick={() => setActiveTab('map')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  activeTab === 'map' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hydraulic Map
              </button>
              <button
                onClick={() => setActiveTab('model_audit')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1 ${
                  activeTab === 'model_audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                <span>RealWaste ML Metrics</span>
              </button>
            </div>

            {/* Auth Buttons */}
            {currentUser ? (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-200">
                <div className="text-right">
                  <div className="font-semibold text-slate-900 text-xs">{currentUser.full_name}</div>
                  <div className="text-[10px] text-slate-500 font-mono capitalize">{currentUser.role.replace('_', ' ')}</div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600"
                >
                  <LogOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsSubmitModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Report Hazard</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={() => setAuthModalConfig({ isOpen: true, mode: 'citizen_login' })}
                  className="px-3 py-1.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 font-semibold rounded-lg"
                >
                  Citizen Sign In
                </button>
                <button
                  onClick={() => setAuthModalConfig({ isOpen: true, mode: 'admin_login' })}
                  className="px-3 py-1.5 text-white bg-slate-900 hover:bg-slate-800 font-semibold rounded-lg"
                >
                  Municipal Staff Access
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Unauthenticated Landing State */}
        {!currentUser && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4 max-w-2xl mx-auto my-8">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center mx-auto border border-emerald-200">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Sign in to Access ECO-ROUTE</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Dedicated civic environmental platform separating citizen reporting from authorized municipal desilting triage.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => setAuthModalConfig({ isOpen: true, mode: 'citizen_login' })}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5"
              >
                <span>Citizen Login</span>
              </button>
              <button
                onClick={() => setAuthModalConfig({ isOpen: true, mode: 'admin_login' })}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5"
              >
                <span>Municipal Staff Login</span>
              </button>
            </div>
          </div>
        )}

        {/* Authenticated Workspace */}
        {currentUser && activeTab === 'reports' && (
          <div className="space-y-4">
            {/* Filter and Status Bar */}
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by ID, address, or material..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-md w-56 text-xs focus:outline-none focus:border-slate-400"
                  />
                </div>

                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-xs"
                >
                  <option value="all">All Incident Types</option>
                  <option value="plastic_waste">Plastic Waste Reports</option>
                  <option value="waterlogging">Active Waterlogging</option>
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-xs"
                >
                  <option value="all">All Statuses</option>
                  <option value="SUBMITTED">SUBMITTED</option>
                  <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                  <option value="ASSIGNED">ASSIGNED</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="VERIFIED">VERIFIED</option>
                </select>

                <select
                  value={selectedRisk}
                  onChange={(e) => setSelectedRisk(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-xs"
                >
                  <option value="all">All Risk Tiers</option>
                  <option value="CRITICAL">CRITICAL (75-100)</option>
                  <option value="HIGH">HIGH (50-74)</option>
                  <option value="MODERATE">MODERATE (25-49)</option>
                  <option value="LOW">LOW (&lt; 25)</option>
                </select>
              </div>

              <button
                onClick={fetchData}
                className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md flex items-center gap-1 font-medium"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Reports List */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-800 uppercase tracking-wider">
                <span>
                  {isMunicipalAdmin ? `Municipal Incident Triage Queue (${filteredReports.length})` : `My Submitted Incidents (${filteredReports.length})`}
                </span>
                <span className="font-normal text-slate-500 normal-case">
                  {isMunicipalAdmin ? 'Showing all authorized reports' : 'Strictly isolated to your account'}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredReports.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-700 text-xs">No Incident Reports Logged</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isMunicipalAdmin 
                          ? 'No reports currently match the active filter criteria.'
                          : 'You have not submitted any incident reports yet. Click "Report Hazard" to submit your first report.'}
                      </p>
                    </div>
                    {!isMunicipalAdmin && (
                      <button
                        onClick={() => setIsSubmitModalOpen(true)}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg"
                      >
                        Submit Your First Report
                      </button>
                    )}
                  </div>
                ) : (
                  filteredReports.map((rep) => {
                    const isCritical = rep.risk_score >= 75;
                    const isHigh = rep.risk_score >= 50 && rep.risk_score < 75;
                    const isModerate = rep.risk_score >= 25 && rep.risk_score < 50;

                    const riskColor = isCritical
                      ? 'text-red-700 bg-red-50 border-red-200'
                      : isHigh
                      ? 'text-orange-700 bg-orange-50 border-orange-200'
                      : isModerate
                      ? 'text-amber-700 bg-amber-50 border-amber-200'
                      : 'text-emerald-700 bg-emerald-50 border-emerald-200';

                    return (
                      <div
                        key={rep.id}
                        onClick={() => setActiveReport(rep)}
                        className="p-4 hover:bg-slate-50 transition-colors cursor-pointer flex items-start justify-between gap-4"
                      >
                        <div className="flex items-start gap-4">
                          <img
                            src={rep.image_path}
                            alt={rep.title}
                            className="w-16 h-16 rounded object-cover border border-slate-200 shrink-0"
                          />
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs font-bold text-slate-900">{rep.id}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${riskColor}`}>
                                {rep.risk_score} • {rep.risk_level}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-medium">
                                {rep.status}
                              </span>
                            </div>
                            <h4 className="font-semibold text-slate-900 text-xs">{rep.title}</h4>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{rep.address}</span>
                              <span className="text-slate-300">•</span>
                              <span>{new Date(rep.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-1">
                              Classified: <b>{rep.ml_category}</b> ({Math.round(rep.ml_confidence * 100)}%) • Extent: ~{rep.ml_extent_coverage}%
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveReport(rep);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hydraulic Map View */}
        {activeTab === 'map' && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden h-[680px] flex flex-col">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <div className="font-semibold text-slate-800 uppercase tracking-wider">
                Geospatial Drainage & Incident Overlay
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDrains}
                    onChange={(e) => setShowDrains(e.target.checked)}
                    className="rounded text-emerald-700"
                  />
                  <span>Storm Drains</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showWaterways}
                    onChange={(e) => setShowWaterways(e.target.checked)}
                    className="rounded text-sky-700"
                  />
                  <span>Waterways</span>
                </label>
              </div>
            </div>

            <div className="flex-1 relative">
              <ReportMap
                reports={reports}
                assets={assets}
                selectedReport={activeReport}
                onSelectReport={(r) => setActiveReport(r)}
                showDrains={showDrains}
                showWaterways={showWaterways}
                heightClass="h-full"
              />
            </div>
          </div>
        )}

        {/* Model Evaluation Tab */}
        {activeTab === 'model_audit' && modelMetrics && (
          <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Fine-Tuned RealWaste ML Evaluation</h2>
                <p className="text-slate-500 mt-0.5">
                  Trained on authentic RealWaste dataset (4,752 images) with deterministic stratified splits.
                </p>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block uppercase tracking-wider font-semibold text-[10px]">
                  Held-Out Test Set Accuracy
                </span>
                <span className="text-2xl font-bold font-mono text-emerald-800">
                  {(modelMetrics.test_evaluation.test_accuracy * 100).toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-slate-500 block">Backbone Architecture</span>
                <span className="font-semibold text-slate-900 mt-0.5 block">{modelMetrics.architecture}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-slate-500 block">Dataset & License</span>
                <span className="font-semibold text-slate-900 mt-0.5 block">{modelMetrics.dataset} ({modelMetrics.license})</span>
              </div>
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-slate-500 block">Dataset Splits</span>
                <span className="font-semibold text-slate-900 mt-0.5 block font-mono">
                  {modelMetrics.splits.train_samples} Train / {modelMetrics.splits.val_samples} Val / {modelMetrics.splits.test_samples} Test
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-slate-500 block">Macro F1-Score</span>
                <span className="font-semibold text-slate-900 mt-0.5 block font-mono">
                  {modelMetrics.test_evaluation.macro_avg.f1_score.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Per-Class Precision & Recall Table */}
            <div>
              <h3 className="font-semibold text-slate-800 uppercase tracking-wider mb-2">
                Held-Out Test Split Classification Report (719 unseen images)
              </h3>
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Precision</th>
                      <th className="px-3 py-2">Recall</th>
                      <th className="px-3 py-2">F1-Score</th>
                      <th className="px-3 py-2">Test Support</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {Object.entries(modelMetrics.test_evaluation.per_class).map(([cls, met]) => (
                      <tr key={cls} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-sans font-medium text-slate-900">{cls}</td>
                        <td className="px-3 py-1.5">{(met.precision * 100).toFixed(1)}%</td>
                        <td className="px-3 py-1.5">{(met.recall * 100).toFixed(1)}%</td>
                        <td className="px-3 py-1.5 font-bold text-emerald-800">{(met.f1_score * 100).toFixed(1)}%</td>
                        <td className="px-3 py-1.5 text-slate-500">{met.support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TACO Investigation Note */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded text-slate-700 space-y-1">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-slate-500" />
                <span>Dataset Verification & Integrity Statement:</span>
              </div>
              <p className="text-[11px] text-slate-600">
                <b>TACO:</b> {modelMetrics.taco_investigation.findings}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Drawer */}
      <ReportDetailDrawer
        report={activeReport}
        currentUser={currentUser}
        token={token}
        onClose={() => setActiveReport(null)}
        onRefresh={() => {
          fetchData();
          if (activeReport && token) {
            fetch(`/api/reports/${activeReport.id}`, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.json())
              .then(d => setActiveReport(d))
              .catch(() => {});
          }
        }}
      />

      {/* Report Modal */}
      <SubmitReportModal
        isOpen={isSubmitModalOpen}
        token={token}
        onClose={() => setIsSubmitModalOpen(false)}
        onSuccess={() => fetchData()}
        assets={assets}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalConfig.isOpen}
        initialMode={authModalConfig.mode}
        onClose={() => setAuthModalConfig(prev => ({ ...prev, isOpen: false }))}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}

export default App;
