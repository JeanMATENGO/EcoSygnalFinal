import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  addDoc,
  updateDoc,
  where,
  serverTimestamp,
  increment,
  deleteField,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { auth, db, googleProvider, UserProfile, Report, handleFirestoreError, OperationType } from './lib/firebase';
import { 
  AlertTriangle, 
  Droplets, 
  Zap, 
  Map as MapIcon, 
  Bell, 
  Shield, 
  LogOut, 
  Menu, 
  X, 
  Send, 
  MessageSquare, 
  BarChart3,
  User as UserIcon,
  CheckCircle,
  Clock,
  Settings,
  Power,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { askEcoBot } from './lib/gemini';

// --- Context & Constants ---
const AppContext = createContext<{
  user: User | null;
  profile: UserProfile | null;
  isAppEnabled: boolean;
  reports: Report[];
  loading: boolean;
} | null>(null);

const ZONES = ["Ibanda", "Kadutu", "Bagira", "Panzi", "Nguba", "Essence", "Muhungu", "Kasha"];

// --- Helper Components ---
const Card = ({ children, className = "", id }: { children: React.ReactNode, className?: string, id?: string }) => (
  <div id={id} className={`bg-white rounded-2xl shadow-sm border border-stone-100 p-6 ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = "info" }: { children: React.ReactNode, variant?: string }) => {
  const styles: Record<string, string> = {
    info: "bg-blue-50 text-blue-600 border-blue-100",
    success: "bg-emerald-50 text-emerald-600 border-emerald-100",
    warning: "bg-amber-50 text-amber-600 border-amber-100",
    danger: "bg-rose-50 text-rose-600 border-rose-100"
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[variant]}`}>
      {children}
    </span>
  );
};

const Logo = ({ size = 40, className = "" }: { size?: number, className?: string }) => (
  <div className={`relative ${className}`} style={{ width: size, height: size }}>
    <div className="absolute inset-0 bg-blue-600 rounded-[25%] shadow-lg shadow-blue-200">
      <div className="flex items-center justify-center h-full">
        <Droplets className="text-white" size={size * 0.6} />
      </div>
    </div>
    <div className="absolute -bottom-1 -right-1 bg-amber-500 rounded-[35%] flex items-center justify-center border-2 border-white shadow-md shadow-amber-200" style={{ width: size * 0.45, height: size * 0.45 }}>
      <Zap className="text-white" size={size * 0.25} />
    </div>
  </div>
);

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  // ... other states
  
  useEffect(() => {
    document.title = "EcoSignal - Bukavu Connectée";
    // Simple dynamic favicon
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%232563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3-4-4-6.5c-1 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path></svg>';
    document.head.appendChild(link);
  }, []);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAppEnabled, setIsAppEnabled] = useState(true);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'map' | 'stats' | 'chat' | 'admin' | 'agent'>('home');
  const [notification, setNotification] = useState<string | null>(null);

  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);

  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, 'config', 'global'), (snap) => {
      if (snap.exists()) {
        setIsAppEnabled(snap.data().isAppEnabled);
      } else {
        setDoc(doc(db, 'config', 'global'), { isAppEnabled: true })
          .catch(err => handleFirestoreError(err, OperationType.WRITE, 'config/global'));
        setIsAppEnabled(true);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'config/global');
    });

    let unsubReports: (() => void) | null = null;
    let unsubProfile: (() => void) | null = null;
    let initialLoad = true;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      try {
        setUser(u);
        if (u) {
          // Profile listener for real-time updates (like changing techType)
          if (unsubProfile) unsubProfile();
          unsubProfile = onSnapshot(doc(db, 'users', u.uid), (snap) => {
            if (snap.exists()) {
              setProfile(snap.data() as UserProfile);
              setNeedsRoleSelection(false);
            } else {
              if (u.email?.toLowerCase() === 'jeanmatengo5@gmail.com') {
                const adminProfile: UserProfile = {
                  uid: u.uid,
                  email: u.email || '',
                  displayName: u.displayName || 'Admin',
                  role: 'admin'
                };
                setDoc(doc(db, 'users', u.uid), adminProfile)
                  .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`));
                setNeedsRoleSelection(false);
              } else {
                setNeedsRoleSelection(true);
              }
            }
          }, (err) => {
            handleFirestoreError(err, OperationType.GET, `users/${u.uid}`);
          });

          if (!unsubReports) {
            unsubReports = onSnapshot(
              query(collection(db, 'reports'), orderBy('createdAt', 'desc')),
              (snap) => {
                const newReports = snap.docs.map(d => ({ id: d.id, ...d.data() } as Report));
                setReports(newReports);
                
                if (!initialLoad && snap.docChanges().some(c => c.type === 'added')) {
                  const latest = newReports[0];
                  setNotification(`Nouveau signalement à ${latest.zone}: ${latest.type}`);
                  setTimeout(() => setNotification(null), 5000);
                }
                initialLoad = false;
              },
              (error) => {
                handleFirestoreError(error, OperationType.LIST, 'reports');
              }
            );
          }
        } else {
          setProfile(null);
          setReports([]);
          if (unsubReports) {
            unsubReports();
            unsubReports = null;
          }
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      unsubConfig();
      if (unsubReports) unsubReports();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  if (loading) return <SplashScreen />;

  if (!user) return <LoginScreen />;

  if (needsRoleSelection) return <RoleSelectionScreen user={user} onComplete={(p) => {
    setProfile(p);
    setNeedsRoleSelection(false);
  }} />;

  // Admin and Agent special access
  const isAdmin = profile?.role === 'admin' || user.email?.toLowerCase() === 'jeanmatengo5@gmail.com';
  const isAgent = profile?.role === 'technician' || isAdmin;

  // Killswitch view
  if (!isAppEnabled && !isAdmin) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center bg-stone-50">
        <Shield className="w-20 h-20 text-rose-500 mb-6" />
        <h1 className="text-3xl font-bold text-stone-900 mb-2">Service Temporairement Indisponible</h1>
        <p className="text-stone-500 max-w-md">L'administration a temporairement désactivé EcoSignal pour maintenance. Merci de votre patience.</p>
        <button onClick={() => signOut(auth)} className="mt-8 flex items-center gap-2 text-stone-600 hover:text-stone-900 font-medium transition-colors">
          <LogOut size={18} /> Déconnexion
        </button>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ user, profile, isAppEnabled, reports, loading }}>
      <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row">
        
        {/* Navigation Sidebar (Desktop) / Header (Mobile) */}
        <nav className="md:w-64 bg-white border-r border-stone-100 flex flex-col h-auto md:h-screen sticky top-0 z-50 shadow-sm md:shadow-none">
          <div className="p-6 flex items-center justify-between border-bottom md:border-none">
            <div className="flex items-center gap-3">
              <Logo size={42} />
              <span className="text-xl font-bold tracking-tight text-stone-900">EcoSignal</span>
            </div>
            <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          <div className={`${isMenuOpen ? 'block' : 'hidden'} md:block flex-1 p-4`}>
            <div id="sidebar-links" className="space-y-1">
              <NavButton id="nav-btn-reports" icon={<Droplets size={20} />} label="Signalements" active={activeTab === 'home'} onClick={() => { setActiveTab('home'); setIsMenuOpen(false); }} />
              <NavButton id="nav-btn-map" icon={<MapIcon size={20} />} label="Carte" active={activeTab === 'map'} onClick={() => { setActiveTab('map'); setIsMenuOpen(false); }} />
              <NavButton id="nav-btn-stats" icon={<BarChart3 size={20} />} label="Statistiques" active={activeTab === 'stats'} onClick={() => { setActiveTab('stats'); setIsMenuOpen(false); }} />
              <NavButton id="nav-btn-bot" icon={<MessageSquare size={20} />} label="EcoBot AI" active={activeTab === 'chat'} onClick={() => { setActiveTab('chat'); setIsMenuOpen(false); }} />
              
              <div id="tech-divider" className="pt-4 pb-2 px-2 text-[10px] font-bold text-stone-400 uppercase tracking-widest">Interface Pro</div>
              <NavButton id="nav-btn-agent" icon={<Clock size={20} />} label="Gestion Pannes" active={activeTab === 'agent'} onClick={() => { setActiveTab('agent'); setIsMenuOpen(false); }} />
              {isAdmin && <NavButton id="nav-btn-admin" icon={<Shield size={20} />} label="Administration" active={activeTab === 'admin'} onClick={() => { setActiveTab('admin'); setIsMenuOpen(false); }} />}
            </div>
          </div>

          <div className={`${isMenuOpen ? 'block' : 'hidden'} md:block p-4 border-t border-stone-100`}>
            <div className="flex items-center gap-3 p-3 mb-2">
              <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center overflow-hidden">
                {user.photoURL ? <img src={user.photoURL} alt="" /> : <UserIcon size={20} className="text-stone-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{profile?.displayName}</p>
                <p className="text-[10px] text-stone-400 uppercase font-bold">{profile?.role}</p>
              </div>
            </div>
            <NavButton icon={<LogOut size={20} />} label="Déconnexion" onClick={() => signOut(auth)} className="text-stone-500 hover:text-rose-600 hover:bg-rose-50" />
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto w-full overflow-x-hidden">
          <AnimatePresence>
            {notification && (
              <motion.div 
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="fixed top-6 right-6 z-[100] bg-zinc-900 text-white px-6 py-4 rounded-2xl shadow-2xl border border-zinc-700 flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center animate-pulse">
                  <Bell size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">Alerte EcoSignal</p>
                  <p className="text-xs text-stone-400">{notification}</p>
                </div>
                <button onClick={() => setNotification(null)}><X size={16} className="text-stone-500" /></button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {activeTab === 'home' && <HomeView key="home" />}
            {activeTab === 'map' && <MapView key="map" />}
            {activeTab === 'stats' && <StatsView key="stats" />}
            {activeTab === 'chat' && <ChatView key="chat" />}
            {activeTab === 'agent' && <AgentDashboard key="agent" />}
            {activeTab === 'admin' && <AdminDashboard key="admin" />}
          </AnimatePresence>
        </main>
      </div>
    </AppContext.Provider>
  );
}

const NavButton = ({ icon, label, active, onClick, className = "" }: any) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
      active 
      ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' 
      : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900 border border-transparent'
    } ${className}`}
  >
    {icon}
    {label}
  </button>
);

// --- Sub-Views ---

const HomeView = () => {
  const { reports, profile, user } = useContext(AppContext)!;
  const [showReportForm, setShowReportForm] = useState(false);

  const userReports = reports.filter(r => r.reporterId === user?.uid && r.status !== 'resolved');

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Mes Signalements</h2>
          <p className="text-stone-500">Gérez vos signalements personnels de pannes.</p>
        </div>
        <button 
          onClick={() => setShowReportForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
        >
          <AlertTriangle size={20} /> Signaler une panne
        </button>
      </header>

      {showReportForm && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
          <ReportForm onClose={() => setShowReportForm(false)} />
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Droplets className="text-blue-500" /> Eau - Mes Rapports
          </h3>
          <div className="space-y-4">
            {userReports.filter(r => r.type === 'water').map(r => <ReportItem key={r.id} report={r} />)}
            {userReports.filter(r => r.type === 'water').length === 0 && <div className="p-8 text-center bg-white rounded-xl border border-dashed text-stone-400">Aucun signalement d'eau actif.</div>}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Zap className="text-amber-500" /> Électricité - Mes Rapports
          </h3>
          <div className="space-y-4">
            {userReports.filter(r => r.type === 'electricity').map(r => <ReportItem key={r.id} report={r} />)}
            {userReports.filter(r => r.type === 'electricity').length === 0 && <div className="p-8 text-center bg-white rounded-xl border border-dashed text-stone-400">Aucun signalement d'électricité actif.</div>}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const ReportItem = ({ report }: { report: Report, key?: string }) => {
  const [comments, setComments] = useState<any[]>([]);
  const [confirming, setConfirming] = useState(false);
  
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'reports', report.id, 'comments'), orderBy('createdAt', 'desc')), 
      (snap) => {
        setComments(snap.docs.map(d => d.data()));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `reports/${report.id}/comments`);
      }
    );
  }, [report.id]);

  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      await updateDoc(doc(db, 'reports', report.id), {
        confirmedCount: increment(1)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${report.id}`);
    } finally {
      setConfirming(false);
    }
  };

  const statusMap: any = {
    reported: { label: 'Signalé', variant: 'info' },
    validating: { label: 'En vérification', variant: 'warning' },
    repair: { label: 'En réparation', variant: 'danger' },
    resolved: { label: 'Résolu', variant: 'success' }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return "Chargement...";
    const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return date.toLocaleString();
  };

  return (
    <Card className="hover:border-stone-200 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${report.type === 'water' ? 'bg-blue-50' : 'bg-amber-50'}`}>
            {report.type === 'water' ? <Droplets className="text-blue-500" size={18} /> : <Zap className="text-amber-500" size={18} />}
          </div>
          <div>
            <h4 className="font-bold text-stone-900">{report.zone}</h4>
            <div className="flex flex-col">
              <p className="text-[10px] text-stone-500 font-medium">{report.quartier}{report.avenue ? ` / ${report.avenue}` : ''}</p>
              <p className="text-[10px] text-stone-400">{formatTimestamp(report.createdAt)}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={statusMap[report.status].variant}>{statusMap[report.status].label}</Badge>
          {report.urgency === 'urgent' && <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 flex items-center gap-1"><AlertTriangle size={10}/> URGENT</span>}
        </div>
      </div>
      <p className="text-sm text-stone-600 mb-4 line-clamp-2">{report.description}</p>
      
      <div className="flex items-center justify-between mt-4">
        <button 
          onClick={handleConfirm}
          disabled={confirming}
          className="flex items-center gap-2 text-stone-500 hover:text-blue-600 text-xs font-bold transition-colors group"
        >
          <div className="p-1.5 rounded-lg group-hover:bg-blue-50 transition-colors">
            <CheckCircle size={14} className={confirming ? "animate-pulse" : ""} />
          </div>
          {report.confirmedCount || 0} confirmations citoyennes
        </button>
        
        {report.isConfirmed && (
          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 p-1.5 rounded-lg text-[10px] font-bold">
            <Shield size={12} /> Officiel
          </div>
        )}
      </div>

      {comments.length > 0 && (
        <div className="mt-4 pt-4 border-t border-stone-100">
          <div className="flex items-center gap-2 text-stone-400 text-[10px] uppercase font-bold mb-2">
            <MessageSquare size={12} /> Notes de l'agent
          </div>
          <p className="text-xs italic bg-stone-50 p-2 rounded border border-stone-100 text-stone-600">
            "{comments[0].text}"
          </p>
        </div>
      )}
    </Card>
  );
};

const ReportForm = ({ onClose }: { onClose: () => void }) => {
  const { user } = useContext(AppContext)!;
  const [type, setType] = useState<'water' | 'electricity'>('water');
  const [zone, setZone] = useState("");
  const [avenue, setAvenue] = useState("");
  const [quartier, setQuartier] = useState("");
  const [urgency, setUrgency] = useState<'urgent' | 'normal'>('normal');
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zone || !quartier || !avenue) {
      alert("Veuillez remplir la zone, le quartier et l'avenue.");
      return;
    }
    if (!description) {
      alert("Veuillez entrer une description.");
      return;
    }
    
    setSubmitting(true);
    try {
      const reportsCollection = collection(db, 'reports');
      const baseLat = -2.5000;
      const baseLng = 28.8600;
      const lat = baseLat + (Math.random() - 0.5) * 0.05;
      const lng = baseLng + (Math.random() - 0.5) * 0.05;

      const newReport = {
        type,
        zone,
        avenue,
        quartier,
        urgency,
        description,
        status: 'reported',
        reporterId: user?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        confirmedCount: 0,
        isConfirmed: false,
        lat,
        lng
      };

      await addDoc(reportsCollection, newReport);
      
      if (urgency === 'urgent') {
        // success
      }

      alert("Signalement envoyé avec succès !");
      onClose();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'reports');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card id="report-form-container" className="max-w-2xl mx-auto border-2 border-blue-100 overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold">Nouveau Signalement</h3>
        <button id="close-report-form" onClick={onClose} className="p-2 hover:bg-stone-50 rounded-full"><X size={20}/></button>
      </div>
      <form id="report-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <button 
            id="type-water-btn"
            type="button"
            onClick={() => setType('water')}
            className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${type === 'water' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-stone-100 text-stone-400'}`}
          >
            <Droplets size={24} />
            <span className="font-bold">Eau</span>
          </button>
          <button 
            id="type-elec-btn"
            type="button"
            onClick={() => setType('electricity')}
            className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${type === 'electricity' ? 'border-amber-600 bg-amber-50 text-amber-700' : 'border-stone-100 text-stone-400'}`}
          >
            <Zap size={24} />
            <span className="font-bold">Électricité</span>
          </button>
        </div>

        <div>
          <label htmlFor="zone-select" className="block text-sm font-semibold mb-2">Zone générale</label>
          <select 
            id="zone-select"
            value={zone} 
            onChange={e => setZone(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-stone-50 transition-all font-medium"
            required
          >
            <option value="">Choisissez la commune...</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="quartier-input" className="block text-sm font-semibold mb-2">Quartier</label>
            <input 
              id="quartier-input"
              type="text"
              value={quartier}
              onChange={e => setQuartier(e.target.value)}
              placeholder="Ex: Ndendere"
              className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-stone-50"
              required
            />
          </div>
          <div>
            <label htmlFor="avenue-input" className="block text-sm font-semibold mb-2">Avenue</label>
            <input 
              id="avenue-input"
              type="text"
              value={avenue}
              onChange={e => setAvenue(e.target.value)}
              placeholder="Ex: Maniema"
              className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-stone-50"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Niveau de panne</label>
          <div className="grid grid-cols-2 gap-4">
            <button 
              type="button"
              onClick={() => setUrgency('normal')}
              className={`py-3 rounded-xl border-2 font-bold transition-all ${urgency === 'normal' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-100 text-stone-400'}`}
            >
              Normal
            </button>
            <button 
              type="button"
              onClick={() => setUrgency('urgent')}
              className={`py-3 rounded-xl border-2 font-bold transition-all ${urgency === 'urgent' ? 'border-rose-600 bg-rose-50 text-rose-600' : 'border-stone-100 text-stone-400'}`}
            >
              URGENT
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="description-input" className="block text-sm font-semibold mb-2">Description du problème</label>
          <textarea 
            id="description-input"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Détaillez le problème..."
            className="w-full px-4 py-3 rounded-xl border border-stone-200 h-32 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-stone-50"
            required
          />
        </div>

        <button 
          id="submit-report-btn"
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-100 disabled:opacity-50"
        >
          {submitting ? "Envoi..." : "Envoyer le signalement"}
        </button>
      </form>
    </Card>
  );
};

const MapView = () => {
  const { reports } = useContext(AppContext)!;
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  return (
    <motion.div id="map-view-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 h-full pb-20">
      <header>
        <h2 className="text-3xl font-bold">Visualisation de Bukavu</h2>
        <p className="text-stone-500">Carte interactive des pannes par zone.</p>
      </header>
      
      <Card id="bukavu-map-card" className="min-h-[500px] md:h-[calc(100vh-250px)] relative overflow-hidden flex items-center justify-center bg-stone-900 border-stone-800">
        {/* Stylized Grid Map of Bukavu */}
        <div id="map-grid" className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl p-4 md:p-8 h-full">
          {ZONES.map((zone) => {
            const zoneReports = reports.filter(r => r.zone === zone && r.status !== 'resolved');
            const severity = zoneReports.length > 5 ? 'high' : zoneReports.length > 0 ? 'medium' : 'none';
            const bgColor = {
              high: 'bg-rose-500/20 border-rose-500',
              medium: 'bg-amber-500/20 border-amber-500',
              none: 'bg-stone-800 border-stone-700'
            }[severity];

            return (
              <motion.div 
                id={`map-zone-${zone}`}
                key={zone}
                whileHover={{ scale: 1.02, zIndex: 10 }}
                onClick={() => {
                  if (zoneReports.length > 0) setSelectedReport(zoneReports[0]);
                }}
                className={`rounded-2xl border-2 ${bgColor} p-4 md:p-6 flex flex-col justify-between transition-colors relative group cursor-pointer`}
              >
                <div>
                  <h4 className="text-white font-bold text-sm md:text-base">{zone}</h4>
                  <p className="text-stone-400 text-[10px] md:text-xs">{zoneReports.length} pannes actives</p>
                </div>
                <div className="flex gap-2">
                  {zoneReports.some(r => r.type === 'water') && <Droplets size={14} className="text-blue-400" />}
                  {zoneReports.some(r => r.type === 'electricity') && <Zap size={14} className="text-amber-400" />}
                </div>

                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex flex-col items-center justify-center p-4 text-center">
                  <p className="text-xs text-white font-semibold mb-2">{zone}</p>
                  <div className="space-y-1">
                    <p className="text-[10px] text-blue-300 font-bold uppercase">Eau: {zoneReports.filter(r => r.type === 'water').length}</p>
                    <p className="text-[10px] text-amber-300 font-bold uppercase">Elec: {zoneReports.filter(r => r.type === 'electricity').length}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
        
        <div id="map-legend" className="absolute bottom-4 left-4 md:bottom-6 md:left-6 flex flex-col md:flex-row md:items-center gap-3 md:gap-6 bg-stone-800/80 backdrop-blur-md p-3 md:p-4 rounded-xl border border-stone-700">
          <Legend color="bg-rose-500" label="Critique (+5 pannes)" />
          <Legend color="bg-amber-500" label="Modéré (1-5 pannes)" />
          <Legend color="bg-stone-700" label="Sain" />
        </div>
      </Card>

      <AnimatePresence>
        {selectedReport && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-md w-full"
            >
              <div className="bg-white rounded-3xl overflow-hidden shadow-2xl relative">
                <button 
                  onClick={() => setSelectedReport(null)}
                  className="absolute top-4 right-4 p-2 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-900 transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="p-8">
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${selectedReport.type === 'water' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                      {selectedReport.type === 'water' ? <Droplets size={28} /> : <Zap size={28} />}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-stone-900">{selectedReport.zone}</h3>
                      <p className="text-sm text-stone-500">Détails de la panne actuelle</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                      <p className="text-sm text-stone-700 font-medium leading-relaxed">{selectedReport.description}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-stone-400">
                      <span>Statut: {selectedReport.status}</span>
                      <div className="flex items-center gap-1"><CheckCircle size={12}/> {selectedReport.confirmedCount} confirmations</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedReport(null)}
                    className="w-full mt-8 bg-stone-900 text-white py-4 rounded-2xl font-bold hover:bg-stone-800 transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Legend = ({ color, label }: any) => (
  <div className="flex items-center gap-2">
    <div className={`w-3 h-3 rounded-full ${color}`} />
    <span className="text-xs text-stone-300 font-medium">{label}</span>
  </div>
);

const StatsView = () => {
  const { reports, user } = useContext(AppContext)!;

  const myReports = reports.filter(r => r.reporterId === user?.uid);
  const myResolved = myReports.filter(r => r.status === 'resolved');

  const zoneData = ZONES.map(z => ({
    name: z,
    water: myReports.filter(r => r.zone === z && r.type === 'water' && r.status !== 'resolved').length,
    electricity: myReports.filter(r => r.zone === z && r.type === 'electricity' && r.status !== 'resolved').length
  }));

  const globalZoneData = ZONES.map(z => ({
    name: z,
    count: reports.filter(r => r.zone === z && r.status !== 'resolved').length
  })).sort((a, b) => b.count - a.count);

  const pieData = [
    { name: 'Signalé', value: myReports.filter(r => r.status === 'reported').length, color: '#3b82f6' },
    { name: 'En Vérification', value: myReports.filter(r => r.status === 'validating').length, color: '#f59e0b' },
    { name: 'En Réparation', value: myReports.filter(r => r.status === 'repair').length, color: '#f43f5e' },
    { name: 'Résolu', value: myReports.filter(r => r.status === 'resolved').length, color: '#10b981' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="space-y-8 pb-10">
      <header>
        <h2 className="text-3xl font-bold">Tableau Analytique</h2>
        <p className="text-stone-500">Performances et récurrence des incidents.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Total Pannes (Global)" value={reports.filter(r => r.status !== 'resolved').length} icon={<AlertTriangle className="text-stone-400" />} />
        <StatCard 
          label="Taux de résolution de tes pannes" 
          value={myReports.length > 0 ? `${(myResolved.length / myReports.length * 100).toFixed(1)}%` : "N/A"} 
          icon={<CheckCircle className="text-stone-400" />} 
        />
        <StatCard label="Zone Critique" value={globalZoneData[0]?.count > 0 ? globalZoneData[0].name : "Aucune"} icon={<BarChart3 className="text-stone-400" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="h-[400px]">
          <h3 className="font-bold mb-6">Pannes par Zone (Tes rapports)</h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={zoneData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <Tooltip cursor={{ fill: '#F9FAFB' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
              <Bar dataKey="water" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="electricity" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="h-[400px]">
          <h3 className="font-bold mb-6">État de Traitement (Tes rapports)</h3>
          <ResponsiveContainer width="100%" height="85%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
             {pieData.map(d => (
               <div key={d.name} className="flex items-center gap-1">
                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                 <span className="text-[10px] text-stone-500 font-medium">{d.name}</span>
               </div>
             ))}
          </div>
        </Card>
      </div>
    </motion.div>
  );
};

const StatCard = ({ label, value, icon }: any) => (
  <Card className="flex items-center justify-between">
    <div>
      <p className="text-sm text-stone-500 font-medium mb-1">{label}</p>
      <h4 className="text-3xl font-bold">{value}</h4>
    </div>
    <div className="p-3 bg-stone-50 rounded-xl">{icon}</div>
  </Card>
);

const ChatView = () => {
  const { reports, profile } = useContext(AppContext)!;
  const [messages, setMessages] = useState<{ role: 'user' | 'bot', text: string }[]>([
    { role: 'bot', text: `Bonjour ${profile?.displayName || "Citoyen"} ! Je suis EcoBot. Comment puis-je vous aider avec les services d'eau ou d'électricité aujourd'hui ?` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input || loading) return;
    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    const context = reports.map(r => `[${r.type}] ${r.zone} (${r.quartier}, ${r.avenue}): ${r.status} (Urgence: ${r.urgency}) - ${r.description}`).join('; ');
    const botResponse = await askEcoBot(userMsg, context, profile?.displayName || "Citoyen", messages);
    
    setMessages(prev => [...prev, { role: 'bot', text: botResponse }]);
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col gap-4">
      <header>
        <h2 className="text-3xl font-bold">EcoBot AI</h2>
        <p className="text-stone-500">Votre assistant intelligent qui connaît Bukavu.</p>
      </header>

      <Card className="flex-1 flex flex-col p-0 overflow-hidden border-stone-200">
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                m.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : 'bg-stone-50 text-stone-900 border border-stone-100 rounded-tl-none'
              }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-stone-50 px-4 py-3 rounded-2xl animate-pulse text-stone-400 text-xs">EcoBot réfléchit...</div>
            </div>
          )}
        </div>
        <div className="p-4 bg-white border-t border-stone-100 flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Posez une question sur les coupures..."
            className="flex-1 px-5 py-3 rounded-xl bg-stone-50 border-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button 
            onClick={handleSend}
            disabled={loading}
            className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-100"
          >
            <Send size={20} />
          </button>
        </div>
      </Card>
    </motion.div>
  );
};

const AgentDashboard = () => {
  const { reports, profile, user } = useContext(AppContext)!;
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  if (profile?.role !== 'technician' && profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full">
        <div className="w-20 h-20 bg-stone-100 rounded-3xl flex items-center justify-center text-stone-400 mb-6">
          <Shield size={40} />
        </div>
        <h3 className="text-2xl font-bold text-stone-900 mb-2">Accès Restreint</h3>
        <p className="text-stone-500 max-w-sm">Désolé, cet espace est reservé pour les technicien.</p>
      </div>
    );
  }

  // Technician specialization selection
  const setTechType = async (type: 'water' | 'electricity') => {
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), { techType: type })
        .catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));
    }
  };

  const resetTechType = async () => {
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), { techType: deleteField() })
        .catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));
    }
  };

  if (!profile.techType && profile.role !== 'admin') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-2">Identification Technique</h2>
          <p className="text-stone-500">Pour quel service travaillez-vous ?</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          <button 
            onClick={() => setTechType('water')}
            className="p-10 bg-white border-2 border-stone-100 rounded-3xl hover:border-blue-500 transition-all flex flex-col items-center gap-6 shadow-sm hover:shadow-xl group"
          >
            <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Droplets size={40} />
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-stone-900">REGIDESO</div>
              <div className="text-sm text-stone-400 mt-1">Pannes d'eau</div>
            </div>
          </button>

          <button 
            onClick={() => setTechType('electricity')}
            className="p-10 bg-white border-2 border-stone-100 rounded-3xl hover:border-amber-500 transition-all flex flex-col items-center gap-6 shadow-sm hover:shadow-xl group"
          >
            <div className="w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Zap size={40} />
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-stone-900">SNEL</div>
              <div className="text-sm text-stone-400 mt-1">Électricité</div>
            </div>
          </button>
        </div>
      </motion.div>
    );
  }

  const activeReports = reports.filter(r => 
    r.status !== 'resolved' && 
    (profile.role === 'admin' || r.type === profile.techType)
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">
            {profile.techType === 'water' ? 'Pannes d\'eau (REGIDESO)' : profile.techType === 'electricity' ? 'Pannes d\'électricité (SNEL)' : 'Gestion Globale'}
          </h2>
          <p className="text-stone-500">Parcourez les zones pour voir les signalements actifs.</p>
        </div>
        {profile.role !== 'admin' && (
          <button 
            onClick={resetTechType}
            className="text-sm font-medium text-stone-400 hover:text-stone-900 transition-colors flex items-center gap-2 px-4 py-2 bg-stone-100 rounded-xl"
          >
            <Settings size={14} /> Changer de service
          </button>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {ZONES.map(zone => {
          const count = activeReports.filter(r => r.zone === zone).length;
          return (
            <button 
              key={zone}
              onClick={() => setSelectedZone(zone)}
              className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${selectedZone === zone ? 'border-stone-900 bg-stone-900 text-white shadow-xl' : 'border-stone-100 bg-white hover:border-stone-200 text-stone-900'}`}
            >
              <span className="font-bold">{zone}</span>
              <Badge variant={count > 0 ? 'danger' : 'info'}>{count} en cours</Badge>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {selectedZone && (
          <motion.div 
            key={selectedZone}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Signalements à {selectedZone}</h3>
              <button onClick={() => setSelectedZone(null)} className="text-stone-400 hover:text-stone-900 transition-colors">Fermer</button>
            </div>
            <div className="space-y-4">
              {activeReports.filter(r => r.zone === selectedZone).map(r => <AgentReportItem key={r.id} report={r} />)}
              {activeReports.filter(r => r.zone === selectedZone).length === 0 && <div className="p-12 text-center bg-white rounded-xl border border-dashed text-stone-400">Aucune panne active dans cette zone.</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const AgentReportItem = ({ report }: { report: Report, key?: string }) => {
  const [comment, setComment] = useState("");
  const [updating, setUpdating] = useState(false);

  const updateStatus = async (status: string) => {
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'reports', report.id), { 
        status, 
        isConfirmed: status === 'validating' || status === 'repair',
        updatedAt: serverTimestamp()
      });
      if (comment) {
        await addDoc(collection(db, 'reports', report.id, 'comments'), {
          text: comment,
          authorId: auth.currentUser?.uid,
          authorRole: 'agent',
          createdAt: serverTimestamp()
        });
        setComment("");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${report.id}`);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card className="flex flex-col lg:flex-row gap-6 items-start relative overflow-hidden">
      {report.urgency === 'urgent' && <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant={report.type === 'water' ? 'info' : 'warning'}>{report.type.toUpperCase()}</Badge>
            {report.urgency === 'urgent' && <Badge variant="danger">URGENT</Badge>}
          </div>
          <span className="text-[10px] text-stone-400 italic">ID: {report.id.slice(0, 8)}</span>
        </div>
        
        <div>
          <h4 className="font-bold text-lg">{report.quartier} - {report.avenue}</h4>
          <p className="text-stone-600 text-sm mt-1">{report.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {['validating', 'repair', 'resolved'].map((s: any) => (
            <button 
              key={s}
              onClick={() => updateStatus(s)}
              disabled={updating || report.status === s}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                report.status === s 
                ? 'bg-stone-900 text-white cursor-default' 
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {s === 'validating' ? 'Confirmer' : s === 'repair' ? 'En Réparation' : 'Marquer Résolu'}
            </button>
          ))}
        </div>
      </div>
      <div className="w-full lg:w-72 bg-stone-50 p-4 rounded-xl space-y-3">
        <label className="text-[10px] uppercase font-bold text-stone-400">Ajouter un commentaire client</label>
        <textarea 
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Ex: Équipe en route vers Nguba..."
          className="w-full text-xs p-3 rounded-xl border border-stone-100 h-24 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
        />
      </div>
    </Card>
  );
};

const AdminDashboard = () => {
  const { isAppEnabled, reports } = useContext(AppContext)!;
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => d.data() as UserProfile));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });
  }, []);

  const toggleApp = async () => {
    setChanging(true);
    try {
      await setDoc(doc(db, 'config', 'global'), { isAppEnabled: !isAppEnabled });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'config/global');
    } finally {
      setChanging(false);
    }
  };

  const changeRole = async (uid: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const deleteUser = async (uid: string) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ?")) {
      try {
        await setDoc(doc(db, 'users', uid), { role: 'deleted' });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
      }
    }
  };

  const resetSystem = async () => {
    if (window.confirm("DANGER: Voulez-vous vraiment TOUT réinitialiser ? Cela effacera tous les rapports et forcera tous les utilisateurs à recréer leur profil.")) {
      setChanging(true);
      try {
        // Clear reports
        const qReports = query(collection(db, 'reports'));
        const snapReports = await getDocs(qReports);
        const deleteReports = snapReports.docs.map(d => deleteDoc(d.ref));
        
        // Clear users
        const qUsers = query(collection(db, 'users'));
        const snapUsers = await getDocs(qUsers);
        const deleteUsers = snapUsers.docs.map(d => deleteDoc(d.ref));

        await Promise.all([...deleteReports, ...deleteUsers]);
        alert("Système réinitialisé avec succès. L'application redémarrera pour tout le monde.");
      } catch (err) {
        console.error(err);
        alert("Erreur lors de la réinitialisation.");
      } finally {
        setChanging(false);
      }
    }
  };

  const stats = {
    total: reports.length,
    active: reports.filter(r => r.status !== 'resolved').length,
    resolved: reports.filter(r => r.status === 'resolved').length
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Administration EcoSignal</h2>
          <p className="text-stone-500">Supervision globale et gestion des accès.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={resetSystem}
            disabled={changing}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all bg-stone-100 text-stone-600 hover:bg-rose-50 hover:text-rose-600"
          >
            <RefreshCw size={20} className={changing ? "animate-spin" : ""} /> Réinitialiser
          </button>
          <button 
            onClick={toggleApp}
            disabled={changing}
            className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all ${
              isAppEnabled 
              ? 'bg-rose-500 text-white shadow-rose-200 hover:bg-rose-600' 
              : 'bg-emerald-500 text-white shadow-emerald-200 hover:bg-emerald-600'
            }`}
          >
            <Power size={20} /> {isAppEnabled ? "Suspendre" : "Activer"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-stone-900 text-white border-none">
          <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mb-1">Total Historique</p>
          <h4 className="text-4xl font-bold">{stats.total}</h4>
        </Card>
        <Card className="bg-amber-500 text-white border-none">
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-1">Pannes Actives</p>
          <h4 className="text-4xl font-bold">{stats.active}</h4>
        </Card>
        <Card className="bg-emerald-500 text-white border-none">
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-1">Total Résolues</p>
          <h4 className="text-4xl font-bold">{stats.resolved}</h4>
        </Card>
      </div>

      <Card>
        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
          <UserIcon className="text-stone-400" /> Gestion des Comptes
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase font-bold text-stone-400 border-b border-stone-100">
                <th className="pb-4 px-2">Utilisateur</th>
                <th className="pb-4 px-2">Rôle</th>
                <th className="pb-4 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.uid} className="border-b border-stone-50 hover:bg-stone-50 transition-colors">
                  <td className="py-4 px-2">
                    <div className="font-semibold text-sm">{u.displayName}</div>
                    <div className="text-[10px] text-stone-400">{u.email}</div>
                  </td>
                  <td className="py-4 px-2">
                    <select 
                      value={u.role} 
                      onChange={e => changeRole(u.uid, e.target.value as any)}
                      disabled={u.email === 'jeanmatengo5@gmail.com'}
                      className="text-xs font-bold bg-stone-100 rounded-lg px-3 py-1.5 outline-none border-none"
                    >
                      <option value="user">Simple Utilisateur</option>
                      <option value="technician">Technicien</option>
                      <option value="admin">Administrateur</option>
                    </select>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <button 
                      onClick={() => deleteUser(u.uid)}
                      disabled={u.email === 'jeanmatengo5@gmail.com'}
                      className="p-2 text-stone-300 hover:text-rose-500 transition-colors disabled:opacity-0"
                    >
                      <X size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
};

const SplashScreen = () => (
  <div className="h-screen w-full flex items-center justify-center bg-white">
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6"
    >
      <div className="relative">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], rotate: [0, 360] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="w-24 h-24 bg-blue-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-blue-200"
        >
          <Droplets className="text-white w-12 h-12" />
        </motion.div>
        <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-amber-500 rounded-2xl flex items-center justify-center shadow-xl border-4 border-white">
          <Zap className="text-white w-5 h-5" />
        </div>
      </div>
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tighter text-stone-900">EcoSignal</h1>
        <p className="text-stone-400 font-medium text-sm mt-1">Bukavu Connectée</p>
      </div>
      <div className="mt-8 flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div 
            key={i}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            className="w-1.5 h-1.5 bg-blue-500 rounded-full"
          />
        ))}
      </div>
    </motion.div>
  </div>
);

const RoleSelectionScreen = ({ user, onComplete }: { user: User, onComplete: (profile: UserProfile) => void }) => {
  const [role, setRole] = useState<'user' | 'technician'>('user');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const p: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Citoyen',
        role: role
      };
      await setDoc(doc(db, 'users', user.uid), p);
      onComplete(p);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-8">
        <h2 className="text-2xl font-bold mb-2">Presque fini !</h2>
        <p className="text-stone-500 mb-8">Choisissez votre rôle pour personnaliser votre expérience sur EcoSignal.</p>
        
        <div className="space-y-4 mb-8">
          <button 
            onClick={() => setRole('user')}
            className={`w-full p-5 rounded-2xl border-2 transition-all text-left flex items-center gap-4 ${role === 'user' ? 'border-blue-600 bg-blue-50' : 'border-stone-100 hover:border-stone-200'}`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${role === 'user' ? 'bg-blue-600 text-white' : 'bg-stone-100 text-stone-500'}`}>
              <UserIcon size={24} />
            </div>
            <div>
              <div className="font-bold text-stone-900">Simple Utilisateur</div>
              <div className="text-sm text-stone-500">Signalez les pannes dans votre zone.</div>
            </div>
          </button>

          <button 
            onClick={() => setRole('technician')}
            className={`w-full p-5 rounded-2xl border-2 transition-all text-left flex items-center gap-4 ${role === 'technician' ? 'border-amber-600 bg-amber-50' : 'border-stone-100 hover:border-stone-200'}`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${role === 'technician' ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-500'}`}>
              <Settings size={24} />
            </div>
            <div>
              <div className="font-bold text-stone-900">Technicien SNEL/REGIDESO</div>
              <div className="text-sm text-stone-500">Gérez les interventions et réparations.</div>
            </div>
          </button>
        </div>

        <button 
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-stone-900 text-white py-4 rounded-xl font-bold shadow-xl shadow-stone-100 disabled:opacity-50"
        >
          {loading ? "Chargement..." : "Commencer l'aventure"}
        </button>
      </Card>
    </div>
  );
};

const LoginScreen = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col lg:flex-row">
      <div className="hidden lg:flex flex-1 bg-stone-900 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-500 rounded-full blur-[120px]" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-12">
            <Logo size={64} />
            <span className="text-3xl font-bold tracking-tightener text-white">EcoSignal</span>
          </div>
          <h1 className="text-6xl font-bold text-white max-w-lg leading-tight mb-6">
            Bukavu <span className="text-blue-400">connectée</span> contre les coupures.
          </h1>
          <p className="text-stone-400 text-lg max-w-md">
            Signalez en temps réel les pannes d'eau et d'électricité. L'IA analyse pour vous et les agents interviennent plus vite.
          </p>
        </div>
        <div className="relative z-10 flex gap-8">
           <div className="text-white"><div className="text-2xl font-bold">24/7</div><div className="text-[10px] text-stone-500 uppercase font-bold tracking-widest">Surveillance</div></div>
           <div className="text-white"><div className="text-2xl font-bold">100%</div><div className="text-[10px] text-stone-500 uppercase font-bold tracking-widest">Transparence</div></div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <Logo size={32} />
            <span className="text-xl font-bold tracking-tight">EcoSignal</span>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-stone-900 tracking-tight">{isRegister ? "Créer un compte" : "Bienvenue sur EcoSignal"}</h2>
            <p className="text-stone-500 mt-2">Accédez au portail de signalement citoyen de Bukavu.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Adresse Email</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jean@example.com"
                className="w-full px-5 py-4 rounded-xl border border-stone-200 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                required 
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Mot de passe</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-5 py-4 rounded-xl border border-stone-200 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                required 
              />
            </div>
            {error && <p className="text-rose-500 text-xs font-medium">{error}</p>}
            
            <button 
              disabled={loading}
              className="w-full bg-stone-900 text-white py-4 rounded-xl font-bold hover:bg-stone-800 transition-all shadow-xl shadow-stone-100 disabled:opacity-50"
            >
              {loading ? "Chargement..." : isRegister ? "S'inscrire" : "Se connecter"}
            </button>
          </form>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-stone-100" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-stone-50 px-4 text-stone-400 font-bold tracking-widest">ou continuer avec</span></div>
          </div>

          <button 
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white border border-stone-200 py-4 rounded-xl font-bold hover:bg-stone-50 transition-all shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-5 h-5" />
            Compte Google
          </button>

          <p className="text-center text-sm text-stone-500">
            {isRegister ? "Déjà un compte ?" : "Nouveau sur EcoSignal ?"} {" "}
            <button onClick={() => setIsRegister(!isRegister)} className="text-blue-600 font-bold hover:underline underline-offset-4">
              {isRegister ? "Se connecter" : "Créer un compte"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
