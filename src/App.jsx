import { useState, useRef, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, sendEmailVerification, deleteUser } from "firebase/auth";
import { getDatabase, ref as rtdbRef, set as rtdbSet, onDisconnect, onValue } from "firebase/database";
import { getMessaging, getToken } from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

// ── Firebase ────────────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://linkhire-d4118-default-rtdb.firebaseio.com",
};

let _fireDb = null, _fireAuth = null, _fireRtdb = null;
function getFireDb() {
  if (_fireDb) return _fireDb;
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  _fireDb = getFirestore(app);
  return _fireDb;
}
function getFireAuth() {
  if (_fireAuth) return _fireAuth;
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  _fireAuth = getAuth(app);
  return _fireAuth;
}
function getFireRtdb() {
  if (_fireRtdb) return _fireRtdb;
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    _fireRtdb = getDatabase(app);
  } catch(e) { console.warn("RTDB not available:", e.message); }
  return _fireRtdb;
}
let _fireMsg = null;
function getFireMsg() {
  if (_fireMsg) return _fireMsg;
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    _fireMsg = getMessaging(app);
  } catch(e) { console.warn("FCM not available:", e.message); }
  return _fireMsg;
}
let _fireFn = null, _fireStore = null;
function getFireFn() {
  if (_fireFn) return _fireFn;
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    _fireFn = getFunctions(app, "europe-west1");
  } catch(e) { console.warn("Functions not available:", e.message); }
  return _fireFn;
}
function getFireStore() {
  if (_fireStore) return _fireStore;
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    _fireStore = getStorage(app);
  } catch(e) { console.warn("Storage not available:", e.message); }
  return _fireStore;
}
const AUTH_ERRORS = {
  "auth/email-already-in-use": "E-Mail bereits registriert.",
  "auth/user-not-found":       "Kein Account mit dieser E-Mail.",
  "auth/wrong-password":       "Falsches Passwort.",
  "auth/invalid-credential":   "E-Mail oder Passwort falsch.",
  "auth/weak-password":        "Passwort mindestens 6 Zeichen.",
  "auth/invalid-email":        "Ungültige E-Mail-Adresse.",
};

const db = {
  async get(k) {
    try {
      const snap = await getDoc(doc(getFireDb(), "hinker", k));
      return snap.exists() ? JSON.parse(snap.data().json) : null;
    } catch (e) { console.error("db.get:", e); return null; }
  },
  async set(k, v) {
    try { await setDoc(doc(getFireDb(), "hinker", k), { json: JSON.stringify(v) }); }
    catch (e) { console.error("db.set:", e); }
  },
  async del(k) {
    try { await deleteDoc(doc(getFireDb(), "hinker", k)); }
    catch (e) { console.error("db.del:", e); }
  },
};

// ── Constants ───────────────────────────────────────────────────────────────────
const INDUSTRIES  = ["Automotive","IT / Cloud","Robotik / KI","Maschinenbau","Technologie","Finanzen","Gesundheit","Logistik"];
const COMPANY_TYPES = ["GmbH","AG","UG (haftungsbeschränkt)","GbR","KG","OHG","e.K.","Freiberufler","Startup","Sonstige"];
const WORK_TYPES  = ["Remote","Hybrid","Vor Ort"];
const LEVELS      = ["Junior","Senior","Lead","Direktor"];
const RADII       = ["5 km","10 km","25 km","50 km","100 km","Überall"];
const CITIES      = ["Augsburg","München","Stuttgart","Nürnberg","Frankfurt","Berlin","Hamburg","Köln"];
const CITY_DIST   = {"Augsburg-München":70,"Augsburg-Stuttgart":155,"Augsburg-Nürnberg":120,"Augsburg-Frankfurt":295,"Augsburg-Berlin":520,"Augsburg-Hamburg":700,"Augsburg-Köln":455,"München-Stuttgart":215,"München-Nürnberg":170,"München-Frankfurt":340,"München-Berlin":580,"München-Hamburg":775,"München-Köln":500,"Stuttgart-Nürnberg":205,"Stuttgart-Frankfurt":195,"Stuttgart-Berlin":630,"Stuttgart-Hamburg":690,"Stuttgart-Köln":380,"Nürnberg-Frankfurt":225,"Nürnberg-Berlin":430,"Nürnberg-Hamburg":630,"Nürnberg-Köln":390,"Frankfurt-Berlin":545,"Frankfurt-Hamburg":490,"Frankfurt-Köln":190,"Berlin-Hamburg":290,"Berlin-Köln":570,"Hamburg-Köln":420};
const cityDist    = (a,b) => { if (!a||!b||a===b) return 0; return CITY_DIST[`${a}-${b}`]||CITY_DIST[`${b}-${a}`]||9999; };
const radiusKm    = r => r==="Überall" ? 9999 : (parseInt(r)||25);
const ACCENT      = "#ff5f57";   // Hinker Coral
const ACCENT2     = "#00c9a7";   // Hinker Teal
const PURPLE      = "#8e24aa";
const COLORS_LIST = ["#ff5f57","#00c9a7","#8e24aa","#378ADD","#BA7517","#2D6BE4","#ff5f57","#00c9a7"];
const BG_LIST     = ["#fff0ef","#e0faf5","#f5e8fb","#E6F1FB","#FAEEDA","#E4EDFB","#fff0ef","#e0faf5"];

// ── Hinker Brand Components ──────────────────────────────────────────────────────
const HinkerIcon = ({ size = 40 }) => (
  <div style={{ width:size, height:size, borderRadius:size*0.26, flexShrink:0,
    background:`linear-gradient(135deg,${ACCENT} 0%,#c0392b 50%,${PURPLE} 100%)`,
    display:"flex", alignItems:"center", justifyContent:"center",
    boxShadow:`0 ${size*0.15}px ${size*0.4}px rgba(255,95,87,0.45)` }}>
    <svg width={size*0.58} height={size*0.58} viewBox="0 0 34 34" fill="none">
      <rect x="4" y="5" width="5" height="24" rx="2.5" fill="white"/>
      <rect x="25" y="5" width="5" height="24" rx="2.5" fill="white"/>
      <rect x="9" y="14" width="7" height="6" rx="3" fill="none" stroke="white" strokeWidth="2"/>
      <rect x="18" y="14" width="7" height="6" rx="3" fill="none" stroke={ACCENT2} strokeWidth="2"/>
    </svg>
  </div>
);
// Header wordmark: clean, only k in coral
const HinkerWordmark = ({ size = 22, color = "#111827" }) => (
  <span style={{ fontWeight:900, fontSize:size, letterSpacing:"-0.05em", color, lineHeight:1 }}>
    Hin<span style={{ color:ACCENT }}>k</span>er
  </span>
);
// Full etymology wordmark for splash: Hi(coral) nk(teal) er(purple)
const HinkerWordmarkFull = ({ size = 46 }) => (
  <span style={{ fontWeight:900, fontSize:size, letterSpacing:"-0.05em", lineHeight:1 }}>
    <span style={{ color:ACCENT }}>Hi</span><span style={{ color:ACCENT2 }}>nk</span><span style={{ color:PURPLE }}>er</span>
  </span>
);
const SplashScreen = ({ onDone }) => {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 900);
    const t3 = setTimeout(() => setPhase(3), 2300);
    const t4 = setTimeout(onDone, 2750);
    return () => [t1,t2,t3,t4].forEach(clearTimeout);
  }, []);
  return (
    <div style={{ width:"100%", minHeight:"100vh", background:"linear-gradient(160deg,#0d0d0d,#1a0a1a)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16,
      opacity:phase===3?0:1, transition:"opacity 0.45s ease", overflow:"hidden", position:"relative" }}>
      {/* glow */}
      <div style={{ position:"absolute", width:260, height:260, borderRadius:"50%", pointerEvents:"none",
        background:`radial-gradient(circle,${ACCENT}22 0%,transparent 70%)` }}/>
      {/* icon */}
      <div style={{ opacity:phase>=0?1:0, transform:phase>=0?"scale(1)":"scale(0.4)",
        transition:"all 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s" }}>
        <HinkerIcon size={88}/>
      </div>
      {/* etymology wordmark */}
      <div style={{ opacity:phase>=1?1:0, transform:phase>=1?"translateY(0)":"translateY(22px)",
        transition:"all 0.4s ease 0.08s", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
        <HinkerWordmarkFull size={50}/>
      </div>
      {/* tagline: shows the three source words */}
      <div style={{ opacity:phase>=2?1:0, transition:"opacity 0.4s ease",
        display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
        <div style={{ fontSize:12, fontWeight:700, letterSpacing:"0.16em", textTransform:"uppercase",
          display:"flex", gap:10, alignItems:"center" }}>
          <span><span style={{ color:ACCENT, fontWeight:900 }}>Hi</span><span style={{ color:"rgba(255,255,255,0.3)" }}>re</span></span>
          <span style={{ color:"rgba(255,255,255,0.18)" }}>·</span>
          <span><span style={{ color:"rgba(255,255,255,0.3)" }}>li</span><span style={{ color:ACCENT2, fontWeight:900 }}>nk</span></span>
          <span style={{ color:"rgba(255,255,255,0.18)" }}>·</span>
          <span><span style={{ color:"rgba(255,255,255,0.3)" }}>tind</span><span style={{ color:PURPLE, fontWeight:900 }}>er</span></span>
        </div>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.2)", letterSpacing:"0.25em", textTransform:"uppercase", fontWeight:500 }}>
          Swipe · Match · Hire
        </div>
      </div>
    </div>
  );
};

const DEMO_JOBS = [
  { id:"j1",employerId:"emp_demo",company:"MAN Truck & Bus",title:"HR Managerin",name:"Sarah Müller",industry:"Automotive",location:"Augsburg",workType:"Hybrid",level:"Senior",hiring:"Software Engineers, Projektmanager",avatar:"MT",color:"#6C63FF",bg:"#EEEDFE",open:3,salary:"60–80k €",desc:"Wir suchen engagierte Talente für unser wachsendes Team." },
  { id:"j2",employerId:"emp_demo",company:"Kärcher GmbH",title:"Geschäftsführer",name:"Thomas Bauer",industry:"Maschinenbau",location:"Winnenden",workType:"Vor Ort",level:"Lead",hiring:"Vertriebsleiter, Marketing Manager",avatar:"KG",color:"#1D9E75",bg:"#E1F5EE",open:2,salary:"80–100k €",desc:"Innovation trifft Tradition." },
  { id:"j3",employerId:"emp_demo",company:"Siemens AG",title:"Tech Recruiting Lead",name:"Julia Weber",industry:"Technologie",location:"Augsburg",workType:"Remote",level:"Junior",hiring:"Frontend Entwickler, UX Designer",avatar:"SA",color:"#D4537E",bg:"#FBEAF0",open:5,salary:"45–65k €",desc:"Remote-first Kultur mit viel Gestaltungsfreiheit." },
  { id:"j4",employerId:"emp_demo",company:"KUKA Robotics",title:"Head of People",name:"Markus Hoffmann",industry:"Robotik / KI",location:"Augsburg",workType:"Hybrid",level:"Senior",hiring:"Robotik Ingenieure, Data Scientists",avatar:"KR",color:"#378ADD",bg:"#E6F1FB",open:4,salary:"70–90k €",desc:"Gestalten Sie die Zukunft der Robotik mit uns." },
  { id:"j5",employerId:"emp_demo",company:"Fujitsu DE",title:"Talent Acquisition",name:"Anna Schneider",industry:"IT / Cloud",location:"Augsburg",workType:"Remote",level:"Junior",hiring:"Cloud Architects, DevOps Engineers",avatar:"FD",color:"#BA7517",bg:"#FAEEDA",open:2,salary:"55–75k €",desc:"Cloud-native Umgebung, internationale Teams." },
  { id:"j6",employerId:"emp_demo",company:"BMW Group",title:"Engineering Manager",name:"Leon Fischer",industry:"Automotive",location:"München",workType:"Hybrid",level:"Lead",hiring:"Embedded Engineers, Scrum Master",avatar:"BG",color:"#2D6BE4",bg:"#E4EDFB",open:6,salary:"85–110k €",desc:"Premiumqualität von der ersten Zeile Code an." },
];

const initColor = name => COLORS_LIST[(name || "A").charCodeAt(0) % COLORS_LIST.length];

// ── Claude AI match scoring — via Cloud Function (API key stays server-side) ───
async function fetchScore(user, job) {
  try {
    const fn = getFireFn();
    if (!fn) throw new Error("no functions");
    const call = httpsCallable(fn, "scoreMatch");
    const res  = await call({ user, job });
    return res.data;
  } catch {
    return { score: Math.floor(Math.random() * 30 + 55), reason: "Gute Übereinstimmung mit Anforderungen" };
  }
}

const resizeImg = (file, max = 300) => new Promise(res => {
  const r = new FileReader();
  r.onload = e => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(max / img.width, max / img.height, 1);
      const c = document.createElement("canvas");
      c.width = img.width * ratio; c.height = img.height * ratio;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.75));
    };
    img.src = e.target.result;
  };
  r.readAsDataURL(file);
});

// ── Shared styles ───────────────────────────────────────────────────────────────
const S = {
  card:  { background:"#fff", borderRadius:16, border:"1px solid #E5E7EB", padding:"1.25rem 1.5rem" },
  inp:   { width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", color:"#111827", fontSize:16, boxSizing:"border-box", fontFamily:"inherit" },
  label: { fontSize:12, color:"#6B7280", display:"block", marginBottom:5, fontWeight:500 },
};

// ── Atoms ───────────────────────────────────────────────────────────────────────
const Av = ({ src, initials, color, size = 44, fs = 15 }) => (
  <div style={{ width:size, height:size, borderRadius:"50%", background:src?"#eee":color, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:fs, flexShrink:0, overflow:"hidden", border:"2px solid #fff", boxShadow:"0 0 0 1px #E5E7EB" }}>
    {src ? <img src={src} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt="" /> : initials}
  </div>
);

const Badge = ({ children, color = "#6C63FF", bg = "#EEEDFE" }) => (
  <span style={{ background:bg, color, fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:99, whiteSpace:"nowrap" }}>{children}</span>
);

const Btn = ({ onClick, children, variant = "primary", style = {}, disabled = false, small = false }) => {
  const vs = {
    primary: { background:ACCENT,  color:"#fff", border:"none" },
    green:   { background:ACCENT2, color:"#fff", border:"none" },
    outline: { background:"#fff",  color:"#374151", border:"1.5px solid #E5E7EB" },
    danger:  { background:"#FEF2F2", color:"#DC2626", border:"1px solid #FECACA" },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding:small?"7px 14px":"12px 20px", borderRadius:10, fontSize:small?13:14, fontWeight:600, cursor:disabled?"not-allowed":"pointer", width:small?"auto":"100%", opacity:disabled?0.5:1, transition:"all .15s", ...vs[variant], ...style }}>
      {children}
    </button>
  );
};

const InfoRow = ({ icon, label, value, last = false }) => (
  <div style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0", borderBottom:last?"none":"1px solid #F3F4F6" }}>
    <span style={{ fontSize:16, width:20, textAlign:"center" }}>{icon}</span>
    <div style={{ flex:1 }}>
      <p style={{ margin:0, fontSize:11, color:"#9CA3AF", fontWeight:500 }}>{label}</p>
      <p style={{ margin:0, fontSize:14, color:"#111827", fontWeight:500 }}>{value}</p>
    </div>
  </div>
);

const StatCard = ({ icon, value, label, color = ACCENT }) => (
  <div style={{ background:"#F9FAFB", borderRadius:14, padding:"14px 10px", textAlign:"center", flex:1 }}>
    <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
    <div style={{ fontWeight:700, fontSize:20, color, lineHeight:1 }}>{value}</div>
    <div style={{ fontSize:11, color:"#9CA3AF", marginTop:3, fontWeight:500 }}>{label}</div>
  </div>
);

const PageHeader = ({ back, title, right }) => (
  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:22 }}>
    {back && <button onClick={back} style={{ background:"#F3F4F6", border:"none", borderRadius:10, width:36, height:36, cursor:"pointer", fontSize:18, color:"#6B7280", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>←</button>}
    <span style={{ fontWeight:700, fontSize:17, color:"#111827", flex:1 }}>{title}</span>
    {right}
  </div>
);

const Bell = ({ count, onClick }) => (
  <button onClick={onClick} style={{ position:"relative", background:"#F3F4F6", border:"none", borderRadius:10, width:36, height:36, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>
    🔔{count > 0 && <span style={{ position:"absolute", top:-4, right:-4, background:"#DC2626", color:"#fff", borderRadius:99, fontSize:9, padding:"2px 5px", fontWeight:700, minWidth:16, textAlign:"center" }}>{count}</span>}
  </button>
);

const Overlay = ({ open, onClose, bottom = false, children }) => {
  if (!open) return null;
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:"fixed", inset:0, background:"rgba(17,24,39,0.5)", zIndex:200, display:"flex", alignItems:bottom?"flex-end":"center", justifyContent:"center", padding:bottom?0:"1rem" }}>
      <div style={{ background:"#fff", borderRadius:bottom?"20px 20px 0 0":20, width:"100%", maxWidth:bottom?520:460, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.15)", padding:bottom?"1.5rem 1.5rem 2.5rem":"1.5rem" }}>
        {children}
      </div>
    </div>
  );
};

const ModalHead = ({ title, onClose }) => (
  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
    <span style={{ fontWeight:700, fontSize:17, color:"#111827" }}>{title}</span>
    <button onClick={onClose} style={{ background:"#F3F4F6", border:"none", borderRadius:"50%", width:32, height:32, cursor:"pointer", fontSize:18, color:"#6B7280", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
  </div>
);

// ── Modals ──────────────────────────────────────────────────────────────────────
const LocationModal = ({ open, onClose, user, saveU }) => {
  const [custom, setCustom] = useState("");
  return (
    <Overlay open={open} onClose={onClose} bottom>
      <ModalHead title="📍 Standort ändern" onClose={onClose} />
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
        {CITIES.map(city => (
          <button key={city} onClick={async () => { await saveU({ ...user, location:city }); onClose(); }}
            style={{ padding:"12px 16px", borderRadius:12, border:user?.location === city ? `2px solid ${ACCENT}` : "1.5px solid #E5E7EB", background:user?.location === city ? "#EEEDFE" : "#fff", color:user?.location === city ? ACCENT : "#374151", textAlign:"left", cursor:"pointer", fontSize:14, fontWeight:user?.location === city ? 600 : 400 }}>
            {user?.location === city ? "✓  " : ""}{city}
          </button>
        ))}
      </div>
      <div style={{ borderTop:"1px solid #F3F4F6", paddingTop:14 }}>
        <label style={S.label}>Eigene Stadt eingeben</label>
        <div style={{ display:"flex", gap:8 }}>
          <input style={{ ...S.inp, flex:1 }} placeholder="z.B. Ingolstadt" value={custom} onChange={e => setCustom(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && custom.trim()) { saveU({ ...user, location:custom.trim() }); onClose(); setCustom(""); } }} />
          <button onClick={() => { if (!custom.trim()) return; saveU({ ...user, location:custom.trim() }); onClose(); setCustom(""); }}
            style={{ padding:"10px 18px", borderRadius:10, border:"none", background:ACCENT, color:"#fff", cursor:"pointer", fontWeight:600 }}>OK</button>
        </div>
      </div>
    </Overlay>
  );
};

const RadiusModal = ({ open, onClose, user, saveU }) => (
  <Overlay open={open} onClose={onClose} bottom>
    <ModalHead title="📏 Suchradius" onClose={onClose} />
    <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:8 }}>
      {RADII.map(r => (
        <button key={r} onClick={async () => { await saveU({ ...user, radius:r }); onClose(); }}
          style={{ padding:"12px 16px", borderRadius:12, border:user?.radius === r ? `2px solid ${ACCENT2}` : "1.5px solid #E5E7EB", background:user?.radius === r ? "#E6F9F3" : "#fff", color:user?.radius === r ? ACCENT2 : "#374151", textAlign:"left", cursor:"pointer", fontSize:14, fontWeight:user?.radius === r ? 600 : 400 }}>
          {user?.radius === r ? "✓  " : ""}{r}
        </button>
      ))}
    </div>
  </Overlay>
);

const FilterModal = ({ open, onClose, filters, onApply }) => {
  const [draft, setDraft] = useState(filters);
  useEffect(() => { if (open) setDraft(filters); }, [open]);
  return (
    <Overlay open={open} onClose={onClose} bottom>
      <ModalHead title="🔍 Erweiterte Filter" onClose={onClose} />
      {[["Branche","industry",["Alle",...INDUSTRIES]], ["Arbeitsmodell","workType",["Alle",...WORK_TYPES]], ["Level","level",["Alle",...LEVELS]], ["Suchradius","radius",["Alle",...RADII]]].map(([lbl, key, opts]) => (
        <div key={key} style={{ marginBottom:20 }}>
          <p style={{ fontSize:13, fontWeight:600, color:"#374151", margin:"0 0 10px" }}>{lbl}</p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {opts.map(o => (
              <button key={o} onClick={() => setDraft(d => ({ ...d, [key]:o }))}
                style={{ padding:"8px 16px", borderRadius:99, border:draft[key] === o ? `2px solid ${ACCENT}` : "1.5px solid #E5E7EB", background:draft[key] === o ? ACCENT : "#fff", color:draft[key] === o ? "#fff" : "#6B7280", fontSize:13, fontWeight:draft[key] === o ? 600 : 400, cursor:"pointer" }}>
                {o}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Btn onClick={() => { onApply(draft); onClose(); }}>Filter anwenden</Btn>
      <Btn variant="outline" style={{ marginTop:8 }} onClick={() => { const d = { industry:"Alle", workType:"Alle", level:"Alle", radius:"Alle" }; onApply(d); setDraft(d); onClose(); }}>Zurücksetzen</Btn>
    </Overlay>
  );
};

const ProfileEditModal = ({ open, onClose, user, role, onSave }) => {
  const [pName,    setPName]    = useState("");
  const [pJob,     setPJob]     = useState("");
  const [pSkills,  setPSkills]  = useState("");
  const [pBio,     setPBio]     = useState("");
  const [pRadius,  setPRadius]  = useState("25 km");
  const [pCompany,     setPCompany]     = useState("");
  const [pCompanyType, setPCompanyType] = useState(COMPANY_TYPES[0]);
  const [pInd,         setPInd]         = useState(INDUSTRIES[0]);
  const [pDesc,        setPDesc]        = useState("");
  const [pLoc,         setPLoc]         = useState(CITIES[0]);

  useEffect(() => {
    if (open && user) {
      setPName(user.name || ""); setPJob(user.jobTitle || ""); setPSkills(user.skills || "");
      setPBio(user.bio || ""); setPRadius(user.radius || "25 km");
      setPCompany(user.company || ""); setPCompanyType(user.companyType || COMPANY_TYPES[0]);
      setPInd(user.industry || INDUSTRIES[0]); setPDesc(user.companyDesc || "");
      setPLoc(user.location || CITIES[0]);
    }
  }, [open]);

  const handleSave = () => {
    const u = role === "applicant"
      ? { ...user, name:pName, jobTitle:pJob, skills:pSkills, bio:pBio, location:pLoc }
      : { ...user, name:pName, company:pCompany, companyType:pCompanyType, industry:pInd, companyDesc:pDesc, location:pLoc };
    onSave(u); onClose();
  };

  return (
    <Overlay open={open} onClose={onClose}>
      <ModalHead title="✏️ Profil bearbeiten" onClose={onClose} />
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div><label style={S.label}>Name</label><input style={S.inp} value={pName} onChange={e => setPName(e.target.value)} placeholder="Max Mustermann" /></div>
        {role === "applicant" ? <>
          <div><label style={S.label}>Berufsbezeichnung</label><input style={S.inp} value={pJob} onChange={e => setPJob(e.target.value)} placeholder="z.B. Software Engineer" /></div>
          <div><label style={S.label}>Skills (kommagetrennt)</label><input style={S.inp} value={pSkills} onChange={e => setPSkills(e.target.value)} placeholder="React, Python, Scrum…" /></div>
          <div><label style={S.label}>Über mich</label><textarea style={{ ...S.inp, resize:"vertical", minHeight:80 }} value={pBio} onChange={e => setPBio(e.target.value)} placeholder="Kurze Vorstellung…" /></div>
          <div><label style={S.label}>Standort</label><select style={{ ...S.inp, appearance:"none" }} value={pLoc} onChange={e => setPLoc(e.target.value)}>{CITIES.map(c => <option key={c}>{c}</option>)}</select></div>
        </> : <>
          <div><label style={S.label}>Unternehmensname</label><input style={S.inp} value={pCompany} onChange={e => setPCompany(e.target.value)} placeholder="z.B. Mustermann" /></div>
          <div><label style={S.label}>Rechtsform</label><select style={{ ...S.inp, appearance:"none" }} value={pCompanyType} onChange={e => setPCompanyType(e.target.value)}>{COMPANY_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label style={S.label}>Branche</label><select style={{ ...S.inp, appearance:"none" }} value={pInd} onChange={e => setPInd(e.target.value)}>{INDUSTRIES.map(i => <option key={i}>{i}</option>)}</select></div>
          <div><label style={S.label}>Über das Unternehmen</label><textarea style={{ ...S.inp, resize:"vertical", minHeight:80 }} value={pDesc} onChange={e => setPDesc(e.target.value)} /></div>
          <div><label style={S.label}>Standort</label><select style={{ ...S.inp, appearance:"none" }} value={pLoc} onChange={e => setPLoc(e.target.value)}>{CITIES.map(c => <option key={c}>{c}</option>)}</select></div>
        </>}
        <Btn onClick={handleSave}>Speichern</Btn>
      </div>
    </Overlay>
  );
};

const JobFormModal = ({ open, onClose, editJob, user, onSave }) => {
  const [company,  setCompany]  = useState("");
  const [hiring,   setHiring]   = useState("");
  const [desc,     setDesc]     = useState("");
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [workType, setWorkType] = useState(WORK_TYPES[0]);
  const [level,    setLevel]    = useState(LEVELS[0]);
  const [location, setLocation] = useState("");
  const [salary,   setSalary]   = useState("");
  const [openN,    setOpenN]    = useState("1");

  useEffect(() => {
    if (open && editJob) {
      setCompany(editJob.company || ""); setHiring(editJob.hiring || "");
      setDesc(editJob.desc || ""); setIndustry(editJob.industry || INDUSTRIES[0]);
      setWorkType(editJob.workType || WORK_TYPES[0]); setLevel(editJob.level || LEVELS[0]);
      setLocation(editJob.location || ""); setSalary(editJob.salary || ""); setOpenN(String(editJob.open || 1));
    } else if (open && !editJob) {
      setCompany(user?.company || ""); setHiring(""); setDesc("");
      setIndustry(user?.industry || INDUSTRIES[0]); setWorkType(WORK_TYPES[0]); setLevel(LEVELS[0]);
      setLocation(user?.location || ""); setSalary(""); setOpenN("1");
    }
  }, [open, editJob]);

  const handleSave = () => {
    const co = company || user?.company || "Mein Unternehmen";
    onSave({
      id: editJob?.id || `job_${Date.now()}`,
      employerId: user?.email || "unknown",
      company:co, hiring, desc, industry, workType, level, location, salary,
      open: Number(openN) || 1,
      avatar: co.slice(0, 2).toUpperCase(),
      color: editJob?.color || initColor(co),
      bg: editJob?.bg || BG_LIST[Math.floor(Math.random() * BG_LIST.length)],
      name: user?.name || "Recruiter",
    });
  };

  return (
    <Overlay open={open} onClose={onClose}>
      <ModalHead title={editJob ? "✏️ Stelle bearbeiten" : "📝 Neue Stelle"} onClose={onClose} />
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div><label style={S.label}>Unternehmen</label><input style={S.inp} value={company} onChange={e => setCompany(e.target.value)} /></div>
        <div><label style={S.label}>Wir suchen</label><input style={S.inp} value={hiring} onChange={e => setHiring(e.target.value)} placeholder="z.B. Frontend Developer, UX Designer" /></div>
        <div><label style={S.label}>Stellenbeschreibung</label><textarea style={{ ...S.inp, resize:"vertical", minHeight:80 }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Kurze Beschreibung…" /></div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={S.label}>Branche</label><select style={{ ...S.inp, appearance:"none" }} value={industry} onChange={e => setIndustry(e.target.value)}>{INDUSTRIES.map(i => <option key={i}>{i}</option>)}</select></div>
          <div><label style={S.label}>Arbeitsmodell</label><select style={{ ...S.inp, appearance:"none" }} value={workType} onChange={e => setWorkType(e.target.value)}>{WORK_TYPES.map(w => <option key={w}>{w}</option>)}</select></div>
          <div><label style={S.label}>Level</label><select style={{ ...S.inp, appearance:"none" }} value={level} onChange={e => setLevel(e.target.value)}>{LEVELS.map(l => <option key={l}>{l}</option>)}</select></div>
          <div><label style={S.label}>Standort</label><input style={S.inp} value={location} onChange={e => setLocation(e.target.value)} placeholder="Augsburg" /></div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={S.label}>Gehalt (optional)</label><input style={S.inp} value={salary} onChange={e => setSalary(e.target.value)} placeholder="60–80k €" /></div>
          <div><label style={S.label}>Offene Stellen</label><input style={S.inp} type="number" value={openN} onChange={e => setOpenN(e.target.value)} placeholder="1" /></div>
        </div>
        <Btn variant="green" onClick={handleSave} disabled={!company || !hiring}>{editJob ? "Änderungen speichern" : "Jetzt veröffentlichen"}</Btn>
      </div>
    </Overlay>
  );
};

const JobDetailModal = ({ open, onClose, job, score, onHire, onSkip }) => {
  if (!job) return null;
  return (
    <Overlay open={open} onClose={onClose}>
      <ModalHead title="📋 Stellendetails" onClose={onClose} />
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
        <div style={{ width:56, height:56, borderRadius:14, background:job.color||"#6C63FF", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:800, color:"#fff", flexShrink:0 }}>{job.avatar||"??"}</div>
        <div>
          <p style={{ margin:0, fontWeight:800, fontSize:18, color:"#111827" }}>{job.company}</p>
          <p style={{ margin:"3px 0 0", fontSize:13, color:"#6B7280" }}>{job.hiring}</p>
          {score && <span style={{ fontSize:11, fontWeight:700, color:score.score>=75?"#00c9a7":score.score>=50?"#ff5f57":"#DC2626", background:score.score>=75?"#e0faf5":score.score>=50?"#fff0ef":"#FEF2F2", padding:"3px 9px", borderRadius:20, display:"inline-block", marginTop:4 }}>{score.score}% Match · {score.reason}</span>}
        </div>
      </div>
      <div style={{ ...S.card, padding:"0.5rem 1rem", marginBottom:14 }}>
        {[["🏭","Branche",job.industry],["💼","Arbeitsmodell",job.workType],["⭐","Level",job.level],["📍","Standort",job.location],["💰","Gehalt",job.salary||"Auf Anfrage"],["👥","Offene Stellen",job.open]].filter(([,, v]) => v).map(([i,l,v],idx,a) => (
          <InfoRow key={l} icon={i} label={l} value={String(v)} last={idx===a.length-1}/>
        ))}
      </div>
      {job.desc && <p style={{ fontSize:14, color:"#374151", lineHeight:1.6, marginBottom:18 }}>{job.desc}</p>}
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={() => { onSkip(); onClose(); }} style={{ flex:1, padding:"13px", borderRadius:12, border:"1.5px solid rgba(255,80,80,0.3)", background:"rgba(255,80,80,0.07)", color:"#ff5f57", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>✕ Skip</button>
        <button onClick={() => { onHire(); onClose(); }} style={{ flex:2, padding:"13px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#00c9a7,#009e83)", color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>♥ Hire</button>
      </div>
    </Overlay>
  );
};

const ApplicantDetailModal = ({ open, onClose, appl, onChat, isMatched, matchStatus, onStatusChange }) => {
  if (!appl) return null;
  const APP_STATUS_COLORS = {
    "Neu":        { color:"#6B7280", bg:"#F3F4F6", icon:"🆕" },
    "Eingeladen": { color:"#2563EB", bg:"#EFF6FF", icon:"📩" },
    "Interview":  { color:"#D97706", bg:"#FFFBEB", icon:"🤝" },
    "Eingestellt":{ color:"#059669", bg:"#ECFDF5", icon:"✅" },
    "Abgelehnt":  { color:"#DC2626", bg:"#FEF2F2", icon:"❌" },
  };
  const currentStatus = matchStatus || "Neu";
  const st = APP_STATUS_COLORS[currentStatus];
  return (
    <Overlay open={open} onClose={onClose}>
      <ModalHead title="👤 Bewerber-Profil" onClose={onClose} />
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, marginBottom:20, textAlign:"center" }}>
        <Av src={appl.photo} initials={appl.initials} color={appl.color} size={72} fs={24} />
        <div>
          <p style={{ margin:0, fontWeight:700, fontSize:18, color:"#111827" }}>{appl.name}</p>
          {appl.jobTitle && <p style={{ margin:"4px 0 0", fontSize:14, color:"#6B7280" }}>{appl.jobTitle}</p>}
        </div>
        {appl.bio && <p style={{ fontSize:13, color:"#6B7280", margin:0, lineHeight:1.6 }}>{appl.bio}</p>}
        {appl.skills && <div style={{ display:"flex", gap:6, flexWrap:"wrap", justifyContent:"center" }}>{appl.skills.split(",").map(s => s.trim()).filter(Boolean).map(s => <Badge key={s}>{s}</Badge>)}</div>}
      </div>
      <div style={{ ...S.card, marginBottom:16, padding:"0.5rem 1rem" }}>
        {[["📧","E-Mail",appl.email],["📍","Standort",appl.location||"–"],["🎯","Suchradius",appl.radius||"–"]].map(([i,l,v],idx,a) => <InfoRow key={l} icon={i} label={l} value={v} last={idx === a.length - 1} />)}
      </div>

      {/* Status — only shown when matched */}
      {isMatched && onStatusChange && (
        <div style={{ marginBottom:16 }}>
          <p style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>Status</p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {Object.entries(APP_STATUS_COLORS).map(([s, c]) => (
              <button key={s} onClick={() => onStatusChange(s)}
                style={{ padding:"6px 12px", borderRadius:20, border:`2px solid ${currentStatus===s ? c.color : "transparent"}`, background:c.bg, color:c.color, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:currentStatus===s?1:0.55 }}>
                {c.icon} {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Shared documents */}
      {appl.sharedDocs?.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <p style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.08em" }}>📎 Unterlagen</p>
          {appl.sharedDocs.map((d,i) => (
            <a key={i} href={d.url || "#"} target="_blank" rel="noopener noreferrer"
              style={{ display:"flex", gap:10, alignItems:"center", padding:"10px 12px", background:"#F9FAFB", borderRadius:10, marginBottom:6, textDecoration:"none", border:"1px solid #E5E7EB" }}>
              <span style={{ fontSize:20 }}>📄</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#111827" }}>{d.name}</div>
                <div style={{ fontSize:11, color:"#9CA3AF" }}>{d.size} · {d.date}</div>
              </div>
              {d.url && <span style={{ fontSize:14, color:ACCENT2, fontWeight:700 }}>↓</span>}
            </a>
          ))}
        </div>
      )}

      {isMatched
        ? <Btn variant="green" onClick={() => { onChat(appl); onClose(); }}>💬 Nachricht schreiben</Btn>
        : <p style={{ textAlign:"center", fontSize:13, color:"#9CA3AF", margin:0 }}>💡 Chat wird nach einem Match freigeschaltet</p>}
    </Overlay>
  );
};

// ── NewMatchModal ───────────────────────────────────────────────────────────────
const NewMatchModal = ({ data, onClose, onGoToMatches }) => {
  if (!data) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(17,24,39,0.7)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem"}}>
      <div style={{background:"#fff",borderRadius:24,padding:"2.5rem 2rem",maxWidth:320,width:"100%",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,.3)",animation:"matchPop 0.5s ease"}}>
        <div style={{fontSize:52,marginBottom:12}}>🎉</div>
        <div style={{fontWeight:900,fontSize:22,color:"#111827",marginBottom:8}}>
          {data.count === 1 ? "Neues Match!" : `${data.count} neue Matches!`}
        </div>
        <div style={{fontSize:14,color:"#6B7280",lineHeight:1.6,marginBottom:24}}>
          {data.count === 1
            ? "Während du weg warst, hat jemand mit dir gematcht."
            : `Während du weg warst, haben ${data.count} Personen mit dir gematcht.`}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={onGoToMatches}
            style={{width:"100%",height:48,borderRadius:14,border:"none",background:`linear-gradient(135deg,${ACCENT2},#009e83)`,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
            Matches ansehen →
          </button>
          <button onClick={onClose}
            style={{width:"100%",height:40,borderRadius:12,border:"1.5px solid #E5E7EB",background:"#fff",color:"#6B7280",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            Später
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [showSplash,      setShowSplash]      = useState(true);
  const [loaded,          setLoaded]          = useState(false);
  const [role,            setRole]            = useState(null);
  const [user,            setUser]            = useState(null);
  const [appMatches,      setAppMatches]      = useState([]);
  const [appMsgs,         setAppMsgs]         = useState({});
  const [appDocs,         setAppDocs]         = useState([]);
  const [appSwiped,       setAppSwiped]       = useState([]);
  const [appNotifs,       setAppNotifs]       = useState([]);
  const [scores,          setScores]          = useState({});
  const [scoreLd,         setScoreLd]         = useState({});
  const [empJobs,         setEmpJobs]         = useState([]);
  const [empMsgs,         setEmpMsgs]         = useState({});
  const [empNotifs,       setEmpNotifs]       = useState([]);
  const [empSwiped,       setEmpSwiped]       = useState([]);
  const [empMatches,      setEmpMatches]      = useState([]);
  const [allApplicants,   setAllApplicants]   = useState([]);
  const [screen,          setScreen]          = useState("home");
  const [authMode,        setAuthMode]        = useState("login");
  const [authRole,        setAuthRole]        = useState("applicant");
  const [authName,        setAuthName]        = useState("");
  const [authEmail,       setAuthEmail]       = useState("");
  const [authPass,        setAuthPass]        = useState("");
  const [authErr,         setAuthErr]         = useState("");
  const [authLoading,     setAuthLoading]     = useState(false);
  const [showPasswd,      setShowPasswd]      = useState(false);
  const [resetSent,       setResetSent]       = useState(false);
  const [verifyPending,   setVerifyPending]   = useState(false);
  const [verifyErr,       setVerifyErr]       = useState("");
  const [appFavorites,    setAppFavorites]    = useState([]);
  const [showCardDetail,  setShowCardDetail]  = useState(false);
  const [cardDetailItem,  setCardDetailItem]  = useState(null);
  const [swipeFilters,    setSwipeFilters]    = useState({ industry:"Alle", workType:"Alle", level:"Alle", radius:"Alle" });
  const [newMatchModal,   setNewMatchModal]   = useState(null);
  const [onlineUsers,     setOnlineUsers]     = useState({});
  const [notifEnabled,    setNotifEnabled]    = useState(() => localStorage.getItem("hk_notif") !== "0");
  const [showLoc,         setShowLoc]         = useState(false);
  const [showRadius,      setShowRadius]      = useState(false);
  const [showFilter,      setShowFilter]      = useState(false);
  const [showEditProf,    setShowEditProf]    = useState(false);
  const [showJobForm,     setShowJobForm]     = useState(false);
  const [editJob,         setEditJob]         = useState(null);
  const [showApplicant,   setShowApplicant]   = useState(false);
  const [viewApplicant,   setViewApplicant]   = useState(null);
  const [chatOpen,        setChatOpen]        = useState(null);
  const [chatMsgs,        setChatMsgs]        = useState([]);
  const [msgInput,        setMsgInput]        = useState("");
  const [lastMatch,       setLastMatch]       = useState(null);
  const [dragX,           setDragX]           = useState(0);
  const [dragY,           setDragY]           = useState(0);
  const [dragging,        setDragging]        = useState(false);
  const [showDetail,      setShowDetail]      = useState(false);
  const [detailItem,      setDetailItem]      = useState(null);
  const [confirmCb,       setConfirmCb]       = useState(null);
  const [confirmMsg,      setConfirmMsg]      = useState("");
  const [darkMode,      setDarkMode]      = useState(() => localStorage.getItem("hk_dark") === "1");
  const [tab,           setTab]           = useState("discover");
  const [onboarded,     setOnboarded]     = useState(() => !!localStorage.getItem("hk_onboarded"));
  const [onboardIdx,    setOnboardIdx]    = useState(0);
  const [acctDeleting,  setAcctDeleting]  = useState(false);
  const [acctDeleteErr, setAcctDeleteErr] = useState("");
  const [aboToast,      setAboToast]      = useState(false);
  const [faqOpen,       setFaqOpen]       = useState(null);
  const [typingPartner, setTypingPartner] = useState(false);
  const [partnerReading,setPartnerReading]= useState(false);
  const startX          = useRef(0);
  const startY          = useRef(0);
  const hasDragged      = useRef(false);
  const photoRef        = useRef(null);
  const docRef          = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes matchPop { 0%{transform:translate(-50%,-50%) scale(0.5);opacity:0} 50%{transform:translate(-50%,-50%) scale(1.1)} 100%{transform:translate(-50%,-50%) scale(1);opacity:1} }
      @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
      @keyframes slideUp  { from{transform:translateY(100%)} to{transform:translateY(0)} }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const loadUserData = async (email) => {
    const [u,am,msgs,docs,sw,an,em,en,esw,emat,fav] = await Promise.all([
      db.get("hk_user_"+email), db.get("hk_app_matches_"+email), db.get("hk_app_msgs_"+email),
      db.get("hk_app_docs_"+email), db.get("hk_app_swiped_"+email), db.get("hk_app_notifs_"+email),
      db.get("hk_emp_msgs_"+email), db.get("hk_emp_notifs_"+email),
      db.get("hk_emp_swiped_"+email), db.get("hk_emp_matches_"+email),
      db.get("hk_app_favorites_"+email),
    ]);
    if (u) setUser(u);
    setAppMatches(am||[]); setAppMsgs(msgs||{}); setAppDocs(docs||[]); setAppSwiped(sw||[]);
    setAppNotifs(an||[]); setEmpMsgs(em||{}); setEmpNotifs(en||[]);
    setEmpSwiped(esw||[]); setEmpMatches(emat||[]); setAppFavorites(fav||[]);
    return u;
  };

  const authRoleRef = useRef("applicant");
  useEffect(() => {
    const auth = getFireAuth();
    const unsub = onAuthStateChanged(auth, async (fireUser) => {
      const [ej, aa] = await Promise.all([db.get("hk_emp_jobs"), db.get("hk_all_applicants")]);
      const jobs = ej || DEMO_JOBS; setEmpJobs(jobs); if (!ej) await db.set("hk_emp_jobs", DEMO_JOBS);
      if (aa) setAllApplicants(aa);
      if (fireUser) {
        if (!fireUser.emailVerified) {
          setVerifyPending(true);
          setLoaded(true);
          return;
        }
        setVerifyPending(false);
        const email = fireUser.email;
        const r = await db.get("hk_role_"+email) || authRoleRef.current;
        setRole(r);
        const u = await loadUserData(email);
        if (!u) {
          const nm = fireUser.displayName || email.split("@")[0];
          const fallback = { name:nm, email, initials:nm.slice(0,2).toUpperCase(), color:initColor(nm), photo:null, bio:"", jobTitle:"", skills:"", location:"Augsburg", radius:"25 km", company:"", companyType:"", companyDesc:"", industry:INDUSTRIES[0] };
          await db.set("hk_role_"+email, r);
          await db.set("hk_user_"+email, fallback);
          setUser(fallback);
        }
        // Offline match notification: check for new matches since last login
        const lastLogin = await db.get("hk_last_login_"+email);
        const matchKey = r === "applicant" ? "hk_app_matches_"+email : "hk_emp_matches_"+email;
        const currentMatches = await db.get(matchKey) || [];
        if (lastLogin) {
          const newOnes = currentMatches.filter(m => m.matchedAt && new Date(m.matchedAt) > new Date(lastLogin));
          if (newOnes.length > 0) setNewMatchModal({ count: newOnes.length });
        }
        await db.set("hk_last_login_"+email, new Date().toISOString());
        // Remove employer accounts from applicant pool (cleans up stale entries)
        if (r === "employer") {
          const all = await db.get("hk_all_applicants") || [];
          const cleaned = all.filter(a => a.email !== email);
          if (cleaned.length !== all.length) await db.set("hk_all_applicants", cleaned);
        }
        // One-time global cleanup: check all entries against stored roles
        const cleanupDone = await db.get("hk_cleanup_roles_v1");
        if (!cleanupDone) {
          await db.set("hk_cleanup_roles_v1", true);
          const all = await db.get("hk_all_applicants") || [];
          const cleaned = [];
          for (const a of all) {
            if (a.role === "employer") continue;
            const storedRole = await db.get("hk_role_" + a.email);
            if (storedRole !== "employer") cleaned.push(a);
          }
          if (cleaned.length !== all.length) await db.set("hk_all_applicants", cleaned);
        }
      } else {
        setVerifyPending(false);
        setRole(null); setUser(null);
      }
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listeners — sync matches + notifs as other users act
  useEffect(() => {
    if (!role || !user?.email) return;
    const email = user.email;
    const f = getFireDb();
    const listen = (key, setter) => onSnapshot(doc(f, "hinker", key), snap => {
      if (snap.exists()) setter(JSON.parse(snap.data().json));
    });
    const unsubs = role === "applicant"
      ? [listen("hk_app_matches_"+email, setAppMatches), listen("hk_app_notifs_"+email, setAppNotifs)]
      : [listen("hk_emp_matches_"+email, setEmpMatches), listen("hk_emp_notifs_"+email, setEmpNotifs), listen("hk_all_applicants", setAllApplicants)];
    return () => unsubs.forEach(u => u());
  }, [role, user?.email]);

  const save   = async (k, v, s) => { s(v); await db.set(k, v); };
  const chatKey = (partnerEmail) => "hk_chat_" + [user?.email, partnerEmail].sort().join("__");

  useEffect(() => {
    if (!chatOpen?.partnerEmail || !user?.email) return;
    const key = "hk_chat_" + [user.email, chatOpen.partnerEmail].sort().join("__");
    const f = getFireDb();
    const unsub = onSnapshot(doc(f, "hinker", key), snap => {
      setChatMsgs(snap.exists() ? JSON.parse(snap.data().json) : []);
    });
    return () => unsub();
  }, [chatOpen?.partnerEmail, user?.email]);

  // RTDB presence tracking
  useEffect(() => {
    if (!user?.email) return;
    const rtdb = getFireRtdb();
    if (!rtdb) return;
    const key = user.email.replace(/[@.]/g, "_");
    const ref = rtdbRef(rtdb, `presence/${key}`);
    rtdbSet(ref, { online: true, email: user.email });
    onDisconnect(ref).set({ online: false, email: user.email });
    const allRef = rtdbRef(rtdb, "presence");
    const unsub = onValue(allRef, snap => {
      const data = snap.val() || {};
      const online = {};
      Object.values(data).forEach(v => { if (v?.online && v?.email) online[v.email] = true; });
      setOnlineUsers(online);
    });
    return () => unsub();
  }, [user?.email]);

  // Typing indicator + read receipt listener per open chat
  useEffect(() => {
    if (!chatOpen?.partnerEmail || !user?.email) { setTypingPartner(false); setPartnerReading(false); return; }
    const rtdb = getFireRtdb();
    if (!rtdb) return;
    const ck  = "chat_" + [user.email, chatOpen.partnerEmail].sort().join("__").replace(/[@.]/g, "_");
    const pk  = chatOpen.partnerEmail.replace(/[@.]/g, "_");
    const mk  = user.email.replace(/[@.]/g, "_");
    // Mark self as reading this chat
    const readRef = rtdbRef(rtdb, `reading/${ck}/${mk}`);
    rtdbSet(readRef, true);
    onDisconnect(readRef).set(false);
    // Watch partner typing
    const unsub1 = onValue(rtdbRef(rtdb, `typing/${ck}/${pk}`),  snap => setTypingPartner(!!snap.val()));
    // Watch partner reading
    const unsub2 = onValue(rtdbRef(rtdb, `reading/${ck}/${pk}`), snap => setPartnerReading(!!snap.val()));
    return () => {
      rtdbSet(readRef, false);
      unsub1(); unsub2();
    };
  }, [chatOpen?.partnerEmail, user?.email]);

  // FCM push notification permission
  useEffect(() => {
    if (!user?.email || !notifEnabled || !import.meta.env.VITE_FCM_VAPID_KEY) return;
    const msg = getFireMsg();
    if (!msg) return;
    Notification.requestPermission().then(async perm => {
      if (perm !== "granted") return;
      try {
        const token = await getToken(msg, { vapidKey: import.meta.env.VITE_FCM_VAPID_KEY });
        if (token) await db.set("hk_fcm_token_"+user.email, token);
      } catch(e) { console.warn("FCM token:", e.message); }
    });
  }, [user?.email, notifEnabled]);
  const saveU  = async u => {
    setUser(u); await db.set("hk_user_"+u.email, u);
    const all = await db.get("hk_all_applicants") || [];
    if (all.some(a => a.email === u.email)) {
      const updated = all.map(a => a.email === u.email ? { ...a, ...u } : a);
      await db.set("hk_all_applicants", updated); setAllApplicants(updated);
    }
  };

  const addNotif = async (dbKey, setStore, notif) => {
    const prev = await db.get(dbKey) || [];
    const next = [{ ...notif, id:Date.now(), read:false, time:new Date().toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" }) }, ...prev];
    await save(dbKey, next, setStore);
  };

  const sendVerifyEmail = async (fireUser) => {
    try { await sendEmailVerification(fireUser); return true; }
    catch(e) {
      if (e.code === "auth/too-many-requests") setVerifyErr("Zu viele Versuche — bitte warte etwas.");
      else setVerifyErr("Fehler: " + e.message);
      return false;
    }
  };

  const handleAuth = async () => {
    if (!authEmail || !authPass) { setAuthErr("Bitte alle Felder ausfüllen."); return; }
    if (authMode === "register" && !authName) { setAuthErr("Name fehlt."); return; }
    setAuthErr(""); setAuthLoading(true);
    authRoleRef.current = authRole;
    try {
      if (authMode === "login") {
        const cred = await signInWithEmailAndPassword(getFireAuth(), authEmail, authPass);
        if (!cred.user.emailVerified) {
          setVerifyPending(true); // show verify screen immediately — don't wait for onAuthStateChanged
          setVerifyErr("");
        }
        // if verified: onAuthStateChanged loads data
      } else {
        // Register
        const nm = authName;
        const u = { name:nm, email:authEmail, initials:nm.slice(0,2).toUpperCase(), color:initColor(nm), photo:null, bio:"", jobTitle:"", skills:"", location:"Augsburg", radius:"25 km", company:authRole==="employer"?nm:"", companyType:authRole==="employer"?"GmbH":"", companyDesc:"", industry:INDUSTRIES[0] };
        const cred = await createUserWithEmailAndPassword(getFireAuth(), authEmail, authPass);
        await db.set("hk_role_"+authEmail, authRole);
        await db.set("hk_user_"+authEmail, u);
        setVerifyPending(true); // show verify screen immediately
        setVerifyErr("");
      }
    } catch (e) {
      if (e.code === "auth/email-already-in-use") {
        try {
          const cred = await signInWithEmailAndPassword(getFireAuth(), authEmail, authPass);
          if (!cred.user.emailVerified) {
            setVerifyPending(true);
            setVerifyErr("");
          }
        } catch(_) {
          setAuthMode("login");
          setAuthErr("E-Mail bereits registriert — Passwort falsch oder vergessen?");
        }
      } else {
        setAuthErr(AUTH_ERRORS[e.code] || e.message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(getFireAuth());
    setRole(null); setUser(null); setAppMatches([]); setAppMsgs({}); setAppDocs([]); setAppSwiped([]); setAppNotifs([]); setEmpMsgs({}); setEmpNotifs([]); setEmpSwiped([]); setEmpMatches([]); setAppFavorites([]); setScreen("home");
  };

  const handleDeleteAccount = async () => {
    const email = user.email;
    const keys = [
      "hk_role_"+email, "hk_user_"+email,
      "hk_app_matches_"+email, "hk_app_docs_"+email,
      "hk_app_swiped_"+email, "hk_app_notifs_"+email,
      "hk_emp_notifs_"+email, "hk_emp_swiped_"+email,
      "hk_emp_matches_"+email, "hk_app_favorites_"+email,
      "hk_last_login_"+email, "hk_fcm_token_"+email, "likes_app_"+email,
    ];
    await Promise.all(keys.map(k => db.del(k)));
    const fireUser = getFireAuth().currentUser;
    if (fireUser) { try { await deleteUser(fireUser); } catch(e) { console.warn("deleteUser:", e.message); } }
    setRole(null); setUser(null); setAppMatches([]); setAppMsgs({}); setAppDocs([]);
    setAppSwiped([]); setAppNotifs([]); setEmpMsgs({}); setEmpNotifs([]);
    setEmpSwiped([]); setEmpMatches([]); setAppFavorites([]); setScreen("home");
  };

  const handlePasswordReset = async () => {
    if (!authEmail) { setAuthErr("Bitte E-Mail eingeben."); return; }
    try {
      await sendPasswordResetEmail(getFireAuth(), authEmail);
      setResetSent(true); setAuthErr("");
    } catch (e) {
      setAuthErr(AUTH_ERRORS[e.code] || "Fehler beim Senden der E-Mail.");
    }
  };

  const toggleFavorite = async (jobId) => {
    const next = appFavorites.includes(jobId)
      ? appFavorites.filter(id => id !== jobId)
      : [...appFavorites, jobId];
    await save("hk_app_favorites_"+user.email, next, setAppFavorites);
  };

  const available    = empJobs.filter(j => !appSwiped.includes(j.id));
  const filteredJobs = available.filter(j =>
    (swipeFilters.industry === "Alle" || j.industry === swipeFilters.industry) &&
    (swipeFilters.workType === "Alle" || j.workType === swipeFilters.workType) &&
    (swipeFilters.level    === "Alle" || j.level    === swipeFilters.level) &&
    (swipeFilters.radius   === "Alle" || cityDist(user?.location, j.location) <= radiusKm(swipeFilters.radius))
  );
  const top = filteredJobs[0];

  useEffect(() => {
    if (!top || !user || scores[top.id] || scoreLd[top.id]) return;
    setScoreLd(s => ({ ...s, [top.id]:true }));
    fetchScore(user, top).then(r => { setScores(s => ({ ...s, [top.id]:r })); setScoreLd(s => ({ ...s, [top.id]:false })); });
  }, [top?.id, user?.jobTitle, user?.skills]);

  const empAvailable = allApplicants.filter(a => !empSwiped.includes(a.id || a.email) && a.role !== "employer" && a.email !== user?.email);
  const empTop = role === "employer" ? empAvailable[0] : null;

  useEffect(() => {
    if (!empTop || !user || role !== "employer") return;
    const key = empTop.email || empTop.id;
    if (scores[key] || scoreLd[key]) return;
    setScoreLd(s => ({ ...s, [key]:true }));
    fetchScore(empTop, user).then(r => { setScores(s => ({ ...s, [key]:r })); setScoreLd(s => ({ ...s, [key]:false })); });
  }, [empTop?.email, empTop?.id, user?.company, user?.industry]);

  const draggingRef = useRef(false);
  const dragXRef    = useRef(0);
  const onPointerDown = e => {
    if (["INPUT","TEXTAREA","BUTTON","SELECT"].includes(e.target.tagName)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX; startY.current = e.clientY;
    hasDragged.current = false;
    draggingRef.current = true; setDragging(true);
  };
  const onPointerMove = e => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) hasDragged.current = true;
    dragXRef.current = dx;
    setDragX(dx); setDragY(dy);
  };
  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false; setDragging(false);
    const dx = dragXRef.current;
    if (!hasDragged.current) { setDragX(0); setDragY(0); /* tap handled by onClick */ }
    else if (dx > 80) doSwipe("right");
    else if (dx < -80) doSwipe("left");
    else { setDragX(0); setDragY(0); }
    dragXRef.current = 0;
  };

  const doSwipe = async dir => {
    setDragX(0); setDragY(0); if (!top) return;
    const job = top;
    const ns = [...(await db.get("hk_app_swiped_"+user.email) || []), job.id];
    await save("hk_app_swiped_"+user.email, ns, setAppSwiped);
    if (dir === "right") {
      // Immediate match for applicant
      const existingAppM = await db.get("hk_app_matches_"+user.email) || [];
      if (!existingAppM.some(m => m.id === job.id)) {
        const nm = [...existingAppM, { ...job, matchedAt:new Date().toLocaleDateString("de-DE") }];
        await save("hk_app_matches_"+user.email, nm, setAppMatches);
        setLastMatch(job); setTimeout(() => setLastMatch(null), 2200);
        await addNotif("hk_app_notifs_"+user.email, setAppNotifs, { icon:"❤️", title:`Match mit ${job.company}!`, body:"Chat ist jetzt freigeschaltet." });
        // Also create employer-side match so employer sees applicant in Matches + can chat
        const empEmail = job.employerId;
        if (empEmail && empEmail !== "emp_demo") {
          const matchEntry = { candidate:{ ...user, matchedAt:new Date().toLocaleDateString("de-DE") }, job };
          const existingEmpM = await db.get("hk_emp_matches_"+empEmail) || [];
          if (!existingEmpM.some(m => m.candidate?.email === user.email && m.job?.id === job.id)) {
            await db.set("hk_emp_matches_"+empEmail, [...existingEmpM, matchEntry]);
            await addNotif("hk_emp_notifs_"+empEmail, setEmpNotifs, { icon:"💼", title:`Neue Bewerbung!`, body:`${user.name} hat sich beworben.` });
          }
        }
      }
      // Add to employer's candidate pool (only applicants)
      if (role === "applicant") {
        const prev = await db.get("hk_all_applicants") || [];
        if (!prev.find(a => a.email === user.email && a.jobId === job.id)) {
          await save("hk_all_applicants", [...prev, { ...user, role:"applicant", jobId:job.id, company_job:job.company, matchedAt:new Date().toLocaleDateString("de-DE"), id:Date.now() + Math.random() }], setAllApplicants);
        }
      }
    }
  };

  const handleUnmatch = ({ appEmail, jobId, empEmail }) => {
    setConfirmMsg("Match wirklich entfernen? Der Chat wird gelöscht.");
    setConfirmCb(() => async () => {
      setConfirmCb(null);
      setScreen("home"); setTab("matches");
    // Remove from applicant matches
    const appM = await db.get("hk_app_matches_"+appEmail) || [];
    await save("hk_app_matches_"+appEmail, appM.filter(m => m.id !== jobId), setAppMatches);
    // Remove from employer matches
    const empM = await db.get("hk_emp_matches_"+empEmail) || [];
    await save("hk_emp_matches_"+empEmail, empM.filter(m => !(m.candidate?.email === appEmail && m.job?.id === jobId)), setEmpMatches);
    // Remove likes
    const appL = await db.get("likes_app_"+appEmail) || [];
    await db.set("likes_app_"+appEmail, appL.filter(id => id !== jobId));
    const empL = await db.get("likes_emp_"+jobId) || [];
    await db.set("likes_emp_"+jobId, empL.filter(e => e !== appEmail));
    // Delete shared chat
    await db.del("hk_chat_" + [appEmail, empEmail].sort().join("__"));
    });
  };

  const sendMsg = async () => {
    if (!msgInput.trim() || !chatOpen?.partnerEmail) return;
    const txt = msgInput; setMsgInput("");
    const key = chatKey(chatOpen.partnerEmail);
    const prev = await db.get(key) || [];
    const time = new Date().toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" });
    const myMsg = { from:user.email, text:txt, t:time };
    const next = [...prev, myMsg];
    await db.set(key, next); setChatMsgs(next);
    // Clear own typing indicator
    clearTimeout(typingTimeoutRef.current);
    const rtdb = getFireRtdb();
    if (rtdb) {
      const ck = "chat_" + [user.email, chatOpen.partnerEmail].sort().join("__").replace(/[@.]/g, "_");
      await rtdbSet(rtdbRef(rtdb, `typing/${ck}/${user.email.replace(/[@.]/g, "_")}`), false);
    }
    // Store last message preview in match entries so InboxTab can show it
    const preview = { text:txt, t:time, from:user.email };
    if (role === "applicant") {
      const matches = await db.get("hk_app_matches_"+user.email) || [];
      const updated = matches.map(m => m.employerId === chatOpen.partnerEmail ? { ...m, lastMsg:preview } : m);
      await save("hk_app_matches_"+user.email, updated, setAppMatches);
    } else {
      const matches = await db.get("hk_emp_matches_"+user.email) || [];
      const updated = matches.map(m => m.candidate?.email === chatOpen.partnerEmail ? { ...m, lastMsg:preview } : m);
      await save("hk_emp_matches_"+user.email, updated, setEmpMatches);
    }
  };

  const handlePhoto  = async e => { const f = e.target.files?.[0]; if (!f) return; const b = await resizeImg(f); await saveU({ ...user, photo:b }); };
  const handleDoc = async e => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    const storage = getFireStore();
    const prev = await db.get("hk_app_docs_"+user.email) || [];
    const newDocs = await Promise.all(files.map(async f => {
      const id   = Date.now() + Math.random();
      const path = `docs/${user.email}/${id}_${f.name}`;
      let url = null;
      if (storage) {
        try {
          const ref = storageRef(storage, path);
          await uploadBytes(ref, f);
          url = await getDownloadURL(ref);
        } catch(err) { console.warn("Storage upload:", err.message); }
      }
      return { name:f.name, size:Math.round(f.size/1024)+"KB", type:f.type, date:new Date().toLocaleDateString("de-DE"), id, url, path };
    }));
    await save("hk_app_docs_"+user.email, [...prev, ...newDocs], setAppDocs);
  };
  const removeDoc = async id => {
    const d = appDocs.find(doc => doc.id === id);
    if (d?.path) {
      const storage = getFireStore();
      if (storage) await deleteObject(storageRef(storage, d.path)).catch(() => {});
    }
    await save("hk_app_docs_"+user.email, appDocs.filter(d => d.id !== id), setAppDocs);
  };
  const handleSaveJob = async job => {
    const prev = await db.get("hk_emp_jobs") || [];
    const isNew = !editJob;
    const next = isNew ? [...prev, job] : prev.map(j => j.id === job.id ? job : j);
    await save("hk_emp_jobs", next, setEmpJobs);
    if (isNew) await save("hk_emp_swiped_"+user.email, [], setEmpSwiped);
    await addNotif("hk_emp_notifs_"+user.email, setEmpNotifs, { icon:"📝", title:isNew ? "Neue Stelle veröffentlicht" : "Stelle aktualisiert", body:job.company + " – " + job.hiring.slice(0,40) });
  };
  const deleteJob = async id => save("hk_emp_jobs", empJobs.filter(j => j.id !== id), setEmpJobs);

  const APP_STATUS = {
    "Neu":        { color:"#6B7280", bg:"#F3F4F6", icon:"🆕" },
    "Eingeladen": { color:"#2563EB", bg:"#EFF6FF", icon:"📩" },
    "Interview":  { color:"#D97706", bg:"#FFFBEB", icon:"🤝" },
    "Eingestellt":{ color:"#059669", bg:"#ECFDF5", icon:"✅" },
    "Abgelehnt":  { color:"#DC2626", bg:"#FEF2F2", icon:"❌" },
  };

  const setMatchStatus = async (appEmail, jobId, empEmail, status) => {
    const empM = await db.get("hk_emp_matches_"+empEmail) || [];
    await save("hk_emp_matches_"+empEmail, empM.map(m => m.candidate?.email === appEmail && m.job?.id === jobId ? { ...m, status } : m), setEmpMatches);
    const appM = await db.get("hk_app_matches_"+appEmail) || [];
    await db.set("hk_app_matches_"+appEmail, appM.map(m => m.id === jobId ? { ...m, empStatus:status } : m));
    if (status !== "Neu") {
      const icons = { "Eingeladen":"📩","Interview":"🤝","Eingestellt":"✅","Abgelehnt":"❌" };
      await addNotif("hk_app_notifs_"+appEmail, ()=>{}, { icon:icons[status]||"📋", title:`Status geändert: ${status}`, body:`Neue Rückmeldung von ${empEmail}` });
    }
  };

  const shareDocsWithMatch = async (m) => {
    const docs = appDocs.map(d => ({ name:d.name, size:d.size, type:d.type, url:d.url||null, date:d.date }));
    const matches = await db.get("hk_app_matches_"+user.email) || [];
    await save("hk_app_matches_"+user.email, matches.map(x => x.id === m.id ? { ...x, sharedDocs:docs } : x), setAppMatches);
    const empM = await db.get("hk_emp_matches_"+m.employerId) || [];
    await db.set("hk_emp_matches_"+m.employerId, empM.map(x => x.candidate?.email === user.email ? { ...x, candidate:{ ...x.candidate, sharedDocs:docs } } : x));
    await addNotif("hk_emp_notifs_"+m.employerId, setEmpNotifs, { icon:"📎", title:`${user.name} hat Unterlagen geteilt`, body:"Öffne das Bewerber-Profil zum Ansehen." });
  };

  const unreadApp = appNotifs.filter(n => !n.read).length;
  const unreadEmp = empNotifs.filter(n => !n.read).length;
  const unread    = role === "applicant" ? unreadApp : unreadEmp;

  // ── Theme ─────────────────────────────────────────────────────────────────────
  const t = darkMode
    ? { bg:"#0d0d0d", bg2:"#161620", bg3:"#1e1e2e", card:"#1a1a2a", border:"rgba(255,255,255,0.07)", text:"#f0f0f0", text2:"rgba(255,255,255,0.5)", text3:"rgba(255,255,255,0.25)", nav:"rgba(13,13,13,0.97)" }
    : { bg:"#f4f4f8", bg2:"#ffffff", bg3:"#eeeef5", card:"#ffffff", border:"rgba(0,0,0,0.07)",          text:"#111111", text2:"rgba(0,0,0,0.5)",          text3:"rgba(0,0,0,0.25)",          nav:"rgba(244,244,248,0.97)" };

  const ScoreBadge = ({ id }) => {
    if (scoreLd[id]) return <span style={{fontSize:11,fontWeight:600,color:t.text3}}>⏳…</span>;
    if (!scores[id]) return null;
    const s = scores[id].score;
    const [bg, tc] = s >= 75 ? [`${ACCENT2}25`,ACCENT2] : s >= 50 ? [`${ACCENT}20`,ACCENT] : ["rgba(220,38,38,0.1)","#DC2626"];
    return <span style={{fontSize:11,fontWeight:700,color:tc,background:bg,padding:"3px 9px",borderRadius:20}}>{s}% Match</span>;
  };


  // ── Onboarding Slide ─────────────────────────────────────────────────────────
  const OnboardingSlide = ({ title, sub, icon, color, onNext, onSkip, isLast }) => {
    const [anim, setAnim] = useState(false);
    useEffect(() => { const tm = setTimeout(() => setAnim(true), 40); return () => clearTimeout(tm); }, []);
    const Icon = () => {
      if (icon === "swipe") return (
        <svg width="130" height="130" viewBox="0 0 130 130" fill="none">
          <rect x="20" y="45" width="80" height="62" rx="14" fill="#1e1e2e" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
          <rect x="26" y="36" width="80" height="62" rx="14" fill="#23233a" transform="rotate(-5 66 67)" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
          <rect x="22" y="41" width="80" height="62" rx="14" fill="#1a1a2e" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
          <circle cx="62" cy="71" r="16" fill={`${ACCENT}25`} stroke={ACCENT} strokeWidth="1.5"/>
          <circle cx="62" cy="66" r="6" fill={ACCENT} opacity="0.8"/>
          <path d="M49 82 Q62 74 75 82" stroke={ACCENT} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
          <path d="M95 50 L108 43 L105 56" fill={ACCENT2} opacity="0.9"/>
        </svg>
      );
      if (icon === "link") return (
        <svg width="130" height="130" viewBox="0 0 130 130" fill="none">
          <circle cx="65" cy="65" r="16" fill={`${ACCENT2}20`} stroke={ACCENT2} strokeWidth="2"/>
          {[[65,65,28,36],[65,65,102,36],[65,65,18,94],[65,65,112,94],[65,65,65,108]].map(([x1,y1,x2,y2],i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ACCENT2} strokeWidth="1.5" opacity="0.35" strokeDasharray="4 3"/>
          ))}
          {[[28,36],[102,36],[18,94],[112,94],[65,108]].map(([cx,cy],i) => (
            <circle key={i} cx={cx} cy={cy} r="9" fill={`${ACCENT2}15`} stroke={`${ACCENT2}70`} strokeWidth="1.5"/>
          ))}
          <rect x="56" y="58" width="7" height="14" rx="3.5" fill={ACCENT2} opacity="0.9"/>
          <rect x="67" y="58" width="7" height="14" rx="3.5" fill={ACCENT2} opacity="0.9"/>
        </svg>
      );
      return (
        <svg width="130" height="130" viewBox="0 0 130 130" fill="none">
          <rect x="32" y="32" width="66" height="60" rx="30" fill={`${PURPLE}20`} stroke={`${PURPLE}50`} strokeWidth="2"/>
          <rect x="46" y="46" width="38" height="32" rx="16" fill={PURPLE} opacity="0.65"/>
          <path d="M53 62 L61 70 L78 53" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="24" cy="50" r="4" fill={ACCENT} opacity="0.6"/>
          <circle cx="106" cy="65" r="3" fill={ACCENT2} opacity="0.6"/>
        </svg>
      );
    };
    return (
      <div style={{width:"100%",height:"100%",background:"linear-gradient(180deg,#0d0d0d,#13101a)",display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
        {!isLast && (
          <button onClick={onSkip} style={{position:"absolute",top:16,right:20,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.3)",fontSize:13,fontWeight:600,fontFamily:"inherit",zIndex:10}}>Skip</button>
        )}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
          opacity:anim?1:0,transform:anim?"translateY(0)":"translateY(20px)",transition:"all 0.5s cubic-bezier(0.34,1.2,0.64,1)"}}>
          <div style={{width:200,height:200,borderRadius:"50%",background:`radial-gradient(circle,${color}18 0%,transparent 70%)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon/>
          </div>
        </div>
        <div style={{padding:"0 28px 24px",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{opacity:anim?1:0,transform:anim?"translateY(0)":"translateY(16px)",transition:"all 0.5s ease 0.1s"}}>
            <div style={{fontSize:28,fontWeight:900,color:"#f0f0f0",letterSpacing:"-0.03em",lineHeight:1.1}}>{title}</div>
            <div style={{fontSize:15,color:"rgba(255,255,255,0.45)",lineHeight:1.6,marginTop:10,fontWeight:500}}>{sub}</div>
          </div>
          <div style={{display:"flex",gap:6,marginTop:4}}>
            {[0,1,2].map(i => (
              <div key={i} style={{height:4,borderRadius:2,background:i===([{icon:"swipe"},{icon:"link"},{icon:"win"}].findIndex(s=>s.icon===icon))?color:"rgba(255,255,255,0.15)",width:i===([{icon:"swipe"},{icon:"link"},{icon:"win"}].findIndex(s=>s.icon===icon))?24:6,transition:"all 0.3s ease"}}/>
            ))}
          </div>
          <button onClick={onNext} style={{width:"100%",height:52,borderRadius:14,border:"none",background:`linear-gradient(135deg,${color},${color}bb)`,color:"white",fontSize:16,fontWeight:800,fontFamily:"inherit",cursor:"pointer",boxShadow:`0 8px 20px ${color}44`,marginTop:4,marginBottom:6}}>
            {isLast ? "Loslegen →" : "Weiter →"}
          </button>
        </div>
      </div>
    );
  };

  // ── Confirm Dialog ─────────────────────────────────────────────────────────────
  const ConfirmDialog = () => !confirmCb ? null : (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem"}}>
      <div style={{background:t.card,borderRadius:20,padding:"2rem 1.5rem",maxWidth:320,width:"100%",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <p style={{margin:"0 0 20px",fontSize:15,color:t.text,fontWeight:500,lineHeight:1.5}}>{confirmMsg}</p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={() => setConfirmCb(null)} style={{flex:1,padding:"12px",borderRadius:10,border:`1px solid ${t.border}`,background:t.bg3,color:t.text,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Abbrechen</button>
          <button onClick={() => confirmCb()} style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:"#DC2626",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Entfernen</button>
        </div>
      </div>
    </div>
  );

  const Modals = () => (
    <>
      <LocationModal    open={showLoc}      onClose={() => setShowLoc(false)}      user={user}    saveU={saveU} />
      <RadiusModal      open={showRadius}   onClose={() => setShowRadius(false)}   user={user}    saveU={saveU} />
      <FilterModal      open={showFilter}   onClose={() => setShowFilter(false)}   filters={swipeFilters} onApply={f => setSwipeFilters(f)} />
      <ProfileEditModal open={showEditProf} onClose={() => setShowEditProf(false)} user={user}    role={role}  onSave={async u => { await saveU(u); setShowEditProf(false); }} />
      <JobFormModal     open={showJobForm}  onClose={() => { setShowJobForm(false); setEditJob(null); }} editJob={editJob} user={user} onSave={async j => { await handleSaveJob(j); setShowJobForm(false); setEditJob(null); }} />
      <JobDetailModal   open={showCardDetail && role==="applicant"} onClose={() => setShowCardDetail(false)} job={cardDetailItem}
        score={cardDetailItem ? scores[cardDetailItem.id] : null}
        onHire={() => { setShowCardDetail(false); doSwipe("right"); }}
        onSkip={() => { setShowCardDetail(false); doSwipe("left"); }} />
      <ApplicantDetailModal open={showApplicant} onClose={() => setShowApplicant(false)} appl={viewApplicant}
        isMatched={!!viewApplicant && empMatches.some(m => m.candidate?.email === viewApplicant.email)}
        matchStatus={viewApplicant ? (empMatches.find(m => m.candidate?.email === viewApplicant.email)?.status || "Neu") : "Neu"}
        onStatusChange={async (status) => {
          if (!viewApplicant) return;
          const m = empMatches.find(x => x.candidate?.email === viewApplicant.email);
          if (m) await setMatchStatus(viewApplicant.email, m.job?.id, user.email, status);
        }}
        onChat={a => { setChatOpen({ id:a.email, name:a.name, company:a.email, avatar:a.initials, color:a.color, partnerEmail:a.email }); setScreen("emp_chat"); }} />
      <ConfirmDialog />
      <NewMatchModal data={newMatchModal} onClose={() => setNewMatchModal(null)} onGoToMatches={() => { setTab("matches"); setNewMatchModal(null); }} />
    </>
  );

  // ── Bottom Nav ─────────────────────────────────────────────────────────────────
  const NavBar = () => {
    const tabs = [
      { id:"discover", icon:"⚡", label:"Discover" },
      { id:"matches",  icon:"💬", label:"Nachrichten" },
      { id:"profile",  icon:"👤", label:"Profil"   },
    ];
    return (
      <div style={{display:"flex",borderTop:`1px solid ${t.border}`,background:t.nav,flexShrink:0,height:58}}>
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:"8px 0 6px",fontFamily:"inherit",position:"relative"}}>
            {tb.id === "matches" && unread > 0 && <span style={{position:"absolute",top:6,right:"calc(50% - 14px)",width:8,height:8,borderRadius:"50%",background:ACCENT,border:`2px solid ${t.nav}`}}/>}
            <span style={{fontSize:18,lineHeight:1}}>{tb.icon}</span>
            <span style={{fontSize:10,fontWeight:700,color:tab===tb.id?ACCENT:t.text3,transition:"color 0.2s",letterSpacing:"0.03em"}}>{tb.label}</span>
          </button>
        ))}
      </div>
    );
  };

  // ── Discover tab ───────────────────────────────────────────────────────────────
  const DiscoverTab = () => {
    const isApp = role === "applicant";
    const available = isApp
      ? empJobs.filter(j => !appSwiped.includes(j.id))
      : allApplicants.filter(a => !empSwiped.includes(a.id || a.email) && a.role !== "employer" && a.email !== user.email);
    const filtered = isApp ? available.filter(j =>
      (swipeFilters.industry === "Alle" || j.industry === swipeFilters.industry) &&
      (swipeFilters.workType === "Alle" || j.workType === swipeFilters.workType) &&
      (swipeFilters.level    === "Alle" || j.level    === swipeFilters.level) &&
      (swipeFilters.radius   === "Alle" || cityDist(user?.location, j.location) <= radiusKm(swipeFilters.radius))
    ) : available;
    const dTop  = filtered[0];
    const dNext = filtered[1];

    const doEmpSwipe = async dir => {
      setDragX(0); setDragY(0);
      if (!dTop) return;
      const item = dTop;
      const id   = item.id || item.email;
      const ns   = [...(await db.get("hk_emp_swiped_"+user.email) || []), id];
      await save("hk_emp_swiped_"+user.email, ns, setEmpSwiped);
      if (dir === "right") {
        const jobId = "emp_" + Date.now();
        const matchEntry = { candidate:item, job:{ id:jobId, company:user.company||user.name } };
        const existing   = await db.get("hk_emp_matches_"+user.email) || [];
        if (!existing.some(m => m.candidate?.email === item.email)) {
          await save("hk_emp_matches_"+user.email, [...existing, matchEntry], setEmpMatches);
          setLastMatch(item); setTimeout(() => setLastMatch(null), 2200);
          // Also create match entry on the applicant's side so chat works both ways
          const appEmail = item.email;
          if (appEmail) {
            const appJobEntry = {
              id: jobId, employerId: user.email,
              company: user.company || user.name,
              hiring: user.companyDesc || "",
              avatar: (user.company || user.name || "??").slice(0,2).toUpperCase(),
              color: user.color || ACCENT2,
              bg: "#E6F9F3",
              matchedAt: new Date().toLocaleDateString("de-DE"),
            };
            const existingAppM = await db.get("hk_app_matches_"+appEmail) || [];
            if (!existingAppM.some(m => m.employerId === user.email)) {
              await db.set("hk_app_matches_"+appEmail, [...existingAppM, appJobEntry]);
            }
            await addNotif("hk_app_notifs_"+appEmail, setAppNotifs, { icon:"❤️", title:`Match mit ${user.company||user.name}!`, body:"Chat ist jetzt freigeschaltet." });
          }
          await addNotif("hk_emp_notifs_"+user.email, setEmpNotifs, { icon:"❤️", title:`Match mit ${item.name}!`, body:"Chat ist jetzt freigeschaltet." });
        }
      }
    };

    const handleSwipe = dir => { isApp ? doSwipe(dir) : doEmpSwipe(dir); };

    return (
      <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",background:t.bg,overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"14px 20px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <HinkerIcon size={30}/>
            <HinkerWordmark size={20} color={t.text}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {(isApp ? appMatches : empMatches).length > 0 &&
              <span style={{fontSize:12,fontWeight:700,color:ACCENT2}}>{(isApp?appMatches:empMatches).length} Match{(isApp?appMatches:empMatches).length>1?"es":""} ✓</span>}
            <button onClick={() => setScreen(isApp ? "notifications" : "emp_notifs")}
              style={{position:"relative",background:t.bg3,border:"none",borderRadius:10,width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
              🔔
              {unread > 0 && <span style={{position:"absolute",top:-2,right:-2,width:8,height:8,borderRadius:"50%",background:ACCENT,border:`2px solid ${t.bg}`}}/>}
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{padding:"0 20px 8px",flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:12,fontWeight:600,color:t.text3}}>
            {filtered.length > 0 ? `${filtered.length} ${isApp ? "Jobs" : "Kandidaten"} für dich` : "Alle gesehen!"}
          </span>
          <button onClick={() => setShowFilter(true)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:ACCENT,fontFamily:"inherit",padding:0}}>⚙️ Filter</button>
        </div>

        {/* Card stack */}
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"0 20px 12px",overflow:"hidden"}}>
          <div style={{position:"relative",width:"100%",height:252,flexShrink:0,marginBottom:16}}>
            {!dTop ? (
              <div style={{width:"100%",height:242,borderRadius:20,background:t.bg3,border:`1px dashed ${t.border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}>
                <div style={{fontSize:36}}>🎉</div>
                <div style={{fontSize:14,color:t.text2,fontWeight:700}}>Alle gesehen!</div>
                <button onClick={async () => { isApp ? await save("hk_app_swiped_"+user.email, appMatches.map(m=>m.id), setAppSwiped) : await save("hk_emp_swiped_"+user.email, [], setEmpSwiped); }}
                  style={{padding:"8px 20px",borderRadius:12,border:"none",background:isApp?ACCENT:ACCENT2,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                  🔄 Nochmal
                </button>
              </div>
            ) : (
              <>
                {dNext && (
                  <div style={{position:"absolute",left:"50%",top:10,transform:"translateX(-50%) scale(0.93) rotate(2deg)",width:"88%",height:230,borderRadius:20,background:t.bg3,border:`1px solid ${t.border}`,zIndex:0}}/>
                )}
                <div
                  onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}     onPointerCancel={onPointerUp}
                  onClick={() => { if (!hasDragged.current) { if (isApp) { setCardDetailItem(dTop); setShowCardDetail(true); } else { setViewApplicant(dTop); setShowApplicant(true); } } }}
                  style={{position:"absolute",left:"50%",top:0,
                    transform:`translateX(calc(-50% + ${dragX}px)) translateY(${dragY*0.15}px) rotate(${dragX/18}deg)`,
                    width:"92%",height:242,borderRadius:20,background:t.card,
                    border:`1px solid ${t.border}`,zIndex:1,padding:20,
                    display:"flex",flexDirection:"column",justifyContent:"space-between",
                    boxShadow:darkMode?"0 20px 60px rgba(0,0,0,0.5)":"0 8px 32px rgba(0,0,0,0.12)",
                    cursor:dragging?"grabbing":"grab",touchAction:"none",userSelect:"none",
                    transition:dragging?"none":"transform 0.3s ease"}}>
                  {/* Swipe overlays */}
                  {dragX > 60  && <div style={{position:"absolute",top:20,left:16,border:`3px solid ${ACCENT2}`,borderRadius:8,padding:"4px 10px",transform:"rotate(-10deg)",color:ACCENT2,fontWeight:900,fontSize:16}}>HIRE ✓</div>}
                  {dragX < -60 && <div style={{position:"absolute",top:20,right:16,border:`3px solid ${ACCENT}`,borderRadius:8,padding:"4px 10px",transform:"rotate(10deg)",color:ACCENT,fontWeight:900,fontSize:16}}>SKIP ✕</div>}
                  {/* Top row */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    {isApp ? (
                      <div style={{width:52,height:52,borderRadius:14,background:dTop.color||ACCENT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff",flexShrink:0}}>{dTop.avatar||"??"}</div>
                    ) : (
                      <Av src={dTop.photo} initials={dTop.initials} color={dTop.color} size={52} fs={18}/>
                    )}
                    {(scores[isApp ? dTop.id : (dTop.email||dTop.id)] || scoreLd[isApp ? dTop.id : (dTop.email||dTop.id)]) && (
                      <div style={{background:`${ACCENT2}20`,border:`1px solid ${ACCENT2}40`,borderRadius:20,padding:"4px 10px",fontSize:11,fontWeight:700,color:ACCENT2}}>
                        <ScoreBadge id={isApp ? dTop.id : (dTop.email||dTop.id)}/>
                      </div>
                    )}
                  </div>
                  {/* Bottom: name + tags */}
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    <div style={{fontSize:22,fontWeight:900,color:t.text,letterSpacing:"-0.02em",lineHeight:1.1}}>
                      {isApp ? dTop.hiring : dTop.name}
                    </div>
                    <div style={{fontSize:13,color:t.text2,fontWeight:500}}>
                      {isApp ? `${dTop.company} · ${dTop.workType||""}` : `${dTop.jobTitle||"Bewerber"} · ${dTop.location||"–"}`}
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                      {isApp
                        ? [dTop.industry, dTop.level, dTop.location].filter(Boolean).map((tag,i) => (
                            <span key={i} style={{fontSize:11,color:ACCENT,fontWeight:600,background:`${ACCENT}15`,padding:"3px 9px",borderRadius:20}}>{tag}</span>
                          ))
                        : (dTop.skills||"").split(",").slice(0,3).map(s=>s.trim()).filter(Boolean).map((s,i) => (
                            <span key={i} style={{fontSize:11,color:dTop.color||ACCENT,fontWeight:600,background:`${dTop.color||ACCENT}15`,padding:"3px 9px",borderRadius:20}}>{s}</span>
                          ))
                      }
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Action buttons */}
          {dTop && (
            <div style={{display:"flex",gap:14,alignItems:"center",justifyContent:"center"}}>
              <button onClick={() => handleSwipe("left")}
                onPointerDown={e => e.currentTarget.style.transform="scale(0.88)"}
                onPointerUp={e => e.currentTarget.style.transform="scale(1)"}
                style={{width:56,height:56,borderRadius:"50%",border:"1.5px solid rgba(255,80,80,0.3)",background:"rgba(255,80,80,0.07)",cursor:"pointer",fontSize:22,display:"flex",alignItems:"center",justifyContent:"center",transition:"transform 0.15s",userSelect:"none"}}>✕</button>
              <button onClick={() => handleSwipe("right")}
                onPointerDown={e => e.currentTarget.style.transform="scale(0.88)"}
                onPointerUp={e => e.currentTarget.style.transform="scale(1)"}
                style={{width:68,height:68,borderRadius:"50%",border:"none",background:`linear-gradient(135deg,${ACCENT2},#009e83)`,cursor:"pointer",fontSize:26,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 8px 24px ${ACCENT2}55`,transition:"transform 0.15s",userSelect:"none"}}>♥</button>
              {isApp && dTop && (
                <button onClick={() => toggleFavorite(dTop.id)}
                  onPointerDown={e => e.currentTarget.style.transform="scale(0.88)"}
                  onPointerUp={e => e.currentTarget.style.transform="scale(1)"}
                  style={{width:56,height:56,borderRadius:"50%",border:`1.5px solid ${appFavorites.includes(dTop.id)?"#f59e0b":t.border}`,background:appFavorites.includes(dTop.id)?"rgba(245,158,11,0.12)":t.bg3,cursor:"pointer",fontSize:22,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",userSelect:"none"}}>
                  {appFavorites.includes(dTop.id) ? "⭐" : "☆"}
                </button>
              )}
              {(!isApp || !dTop) && (
                <button
                  onPointerDown={e => e.currentTarget.style.transform="scale(0.88)"}
                  onPointerUp={e => e.currentTarget.style.transform="scale(1)"}
                  style={{width:56,height:56,borderRadius:"50%",border:`1.5px solid ${t.border}`,background:t.bg3,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",transition:"transform 0.15s",userSelect:"none"}}>⭐</button>
              )}
            </div>
          )}
        </div>

        {/* Match toast */}
        {lastMatch && (
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:999,background:`linear-gradient(135deg,${ACCENT2},#009e83)`,color:"#fff",padding:"2rem 3rem",borderRadius:24,boxShadow:`0 12px 48px ${ACCENT2}70`,fontSize:18,fontWeight:700,textAlign:"center",animation:"matchPop 0.5s ease"}}>
            <div style={{fontSize:48,marginBottom:8}}>🎉</div>
            <div>Es ist ein Match!</div>
          </div>
        )}
      </div>
    );
  };

  // ── Inbox tab (unified Matches + Messages) ─────────────────────────────────────
  const MatchesTab = () => {
    const isApp = role === "applicant";
    const items = isApp ? appMatches : empMatches;
    const isOnline = (email) => !!onlineUsers[email];
    return (
      <div style={{width:"100%",display:"flex",flexDirection:"column",background:t.bg,minHeight:"100%"}}>
        <div style={{padding:"14px 20px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <HinkerIcon size={30}/><HinkerWordmark size={20} color={t.text}/>
          </div>
          <span style={{fontSize:13,color:t.text3,fontWeight:500}}>{items.length} Match{items.length !== 1 ? "es" : ""}</span>
        </div>
        <div style={{padding:"0 20px",flex:1,overflowY:"auto"}}>
          {/* Saved jobs — applicant only */}
          {isApp && appFavorites.length > 0 && (
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",marginBottom:12,letterSpacing:"0.1em",textTransform:"uppercase"}}>⭐ Gespeichert</div>
              {empJobs.filter(j => appFavorites.includes(j.id)).map((job,i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${t.border}`}}>
                  <div style={{width:46,height:46,borderRadius:12,background:job.color||ACCENT,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff",flexShrink:0}}>{job.avatar||"??"}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:700,color:t.text}}>{job.company}</div>
                    <div style={{fontSize:12,color:"#f59e0b",fontWeight:600}}>{job.hiring?.slice(0,40)}</div>
                  </div>
                  <button onClick={() => toggleFavorite(job.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,padding:4}}>⭐</button>
                </div>
              ))}
            </div>
          )}

          <div style={{fontSize:11,fontWeight:700,color:t.text3,marginBottom:14,letterSpacing:"0.1em",textTransform:"uppercase"}}>
            {isApp ? "Deine Matches" : "Kandidaten"}
          </div>

          {items.length === 0 ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:220,gap:10}}>
              <div style={{fontSize:40}}>💬</div>
              <div style={{fontSize:14,color:t.text2,fontWeight:700,textAlign:"center"}}>Noch keine Matches.<br/>Jetzt swipen!</div>
              <button onClick={() => setTab("discover")} style={{padding:"10px 24px",borderRadius:12,border:"none",background:isApp?ACCENT:ACCENT2,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                {isApp ? "Jobs entdecken" : "Kandidaten finden"}
              </button>
            </div>
          ) : items.map((m,i) => {
            const name     = isApp ? (m.company||m.hiring) : (m.candidate?.name||"?");
            const sub      = isApp ? (m.hiring||"")        : (m.candidate?.jobTitle||"Bewerber");
            const color    = isApp ? (m.color||ACCENT)     : (m.candidate?.color||ACCENT2);
            const initials = isApp ? (m.avatar||"??")      : (m.candidate?.initials||"??");
            const photo    = isApp ? null : m.candidate?.photo;
            const partner  = isApp ? m.employerId          : m.candidate?.email;
            const online   = isOnline(partner);
            const isNew    = !m.lastMsg;
            const mStatus  = !isApp ? (m.status || "Neu") : null;
            const mStInfo  = mStatus ? APP_STATUS[mStatus] : null;
            const hasShared = isApp && m.sharedDocs?.length > 0;
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${t.border}`}}>
                {/* Avatar with online indicator */}
                <div style={{position:"relative",flexShrink:0}}>
                  <Av src={photo} initials={initials} color={color} size={46} fs={16}/>
                  {online && <div style={{position:"absolute",bottom:1,right:1,width:11,height:11,borderRadius:"50%",background:ACCENT2,border:`2px solid ${t.bg}`}}/>}
                </div>
                {/* Content — click opens chat */}
                <div onClick={() => { setChatOpen({ id:partner, name, color, avatar:initials, partnerEmail:partner, jobId: isApp ? m.id : m.job?.id }); setScreen(isApp?"app_chat":"emp_chat"); }}
                  style={{flex:1,minWidth:0,cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <div style={{fontSize:15,fontWeight:700,color:t.text}}>{name}</div>
                    {isNew && <span style={{fontSize:10,fontWeight:700,background:`${ACCENT}15`,color:ACCENT,padding:"2px 7px",borderRadius:20,flexShrink:0}}>Neu</span>}
                    {mStInfo && mStatus !== "Neu" && (
                      <span style={{fontSize:10,fontWeight:700,background:mStInfo.bg,color:mStInfo.color,padding:"2px 7px",borderRadius:20,flexShrink:0}}>
                        {mStInfo.icon} {mStatus}
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:12,color:t.text2,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:1}}>
                    {m.lastMsg
                      ? (m.lastMsg.from === user.email ? "Du: " : "") + m.lastMsg.text
                      : (sub || "Sag Hallo 👋")}
                  </div>
                </div>
                {/* Right actions */}
                <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                  {!isApp && (
                    <button onClick={e => { e.stopPropagation(); setViewApplicant(m.candidate); setShowApplicant(true); }}
                      style={{background:`${ACCENT2}15`,border:`1px solid ${ACCENT2}30`,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:700,color:ACCENT2,fontFamily:"inherit"}}>
                      Profil
                    </button>
                  )}
                  {isApp && (
                    <>
                      {hasShared ? (
                        <span style={{fontSize:10,fontWeight:700,color:ACCENT2,background:`${ACCENT2}15`,border:`1px solid ${ACCENT2}30`,borderRadius:8,padding:"4px 8px",flexShrink:0}}>📎 geteilt</span>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); shareDocsWithMatch(m); }}
                          style={{background:"rgba(0,201,167,0.08)",border:"1px solid rgba(0,201,167,0.25)",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:700,color:ACCENT2,fontFamily:"inherit",flexShrink:0}}>
                          📎 Teilen
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleUnmatch({ appEmail:user.email, jobId:m.id, empEmail:m.employerId }); }}
                        style={{background:"rgba(255,80,80,0.08)",border:"1px solid rgba(255,80,80,0.2)",borderRadius:8,width:28,height:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>✕</button>
                    </>
                  )}
                  <span style={{fontSize:16,color:t.text3}}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Messages tab ───────────────────────────────────────────────────────────────
  const MessagesTab = () => {
    const isApp = role === "applicant";
    const matches = isApp ? appMatches : empMatches;
    const convos = matches.map(m => {
      const name     = isApp ? (m.company||m.hiring) : (m.candidate?.name||"?");
      const color    = isApp ? (m.color||ACCENT)     : (m.candidate?.color||ACCENT2);
      const initials = isApp ? (m.avatar||"??")      : (m.candidate?.initials||"??");
      const photo    = isApp ? null : m.candidate?.photo;
      const partner  = isApp ? m.employerId          : m.candidate?.email;
      return { name, color, initials, photo, partner };
    });
    return (
      <div style={{width:"100%",display:"flex",flexDirection:"column",background:t.bg,minHeight:"100%"}}>
        <div style={{padding:"14px 20px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <HinkerIcon size={30}/><HinkerWordmark size={20} color={t.text}/>
          </div>
        </div>
        <div style={{padding:"0 20px",flex:1,overflowY:"auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:t.text3,marginBottom:14,letterSpacing:"0.1em",textTransform:"uppercase"}}>Nachrichten</div>
          {convos.length === 0 ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:220,gap:10}}>
              <div style={{fontSize:40}}>💬</div>
              <div style={{fontSize:14,color:t.text2,fontWeight:700,textAlign:"center"}}>Noch keine Chats.<br/>Erst matchen!</div>
            </div>
          ) : convos.map((c,i) => (
            <div key={i}
              onClick={() => { setChatOpen({ id:c.partner, name:c.name, color:c.color, avatar:c.initials, partnerEmail:c.partner }); setScreen(isApp?"app_chat":"emp_chat"); }}
              style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${t.border}`,cursor:"pointer"}}>
              <Av src={c.photo} initials={c.initials} color={c.color} size={46} fs={16}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:15,fontWeight:700,color:t.text}}>{c.name}</div>
                </div>
                <div style={{fontSize:13,color:t.text2,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:1}}>Sag Hallo 👋</div>
              </div>
              <span style={{fontSize:16,color:t.text3}}>›</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Profile tab ────────────────────────────────────────────────────────────────
  const ProfileTab = () => {
    const isApp = role === "applicant";
    const stats = isApp
      ? [{ label:"Swipes", val:appSwiped.length }, { label:"Matches", val:appMatches.length }, { label:"Docs", val:appDocs.length }]
      : [{ label:"Stellen", val:empJobs.filter(j=>j.employerId===user.email).length }, { label:"Matches", val:empMatches.length }, { label:"Chats", val:Object.keys(empMsgs).length }];

    const strengthItems = isApp ? [
      { label:"Name",            done: !!user.name },
      { label:"Berufsbezeichnung", done: !!user.jobTitle },
      { label:"Skills",          done: !!user.skills },
      { label:"Bio / Vorstellung", done: !!user.bio },
      { label:"Standort",        done: !!user.location },
      { label:"Profilfoto",      done: !!user.photo },
      { label:"Dokument hochgeladen", done: appDocs.length > 0 },
    ] : [
      { label:"Name",            done: !!user.name },
      { label:"Unternehmen",     done: !!user.company },
      { label:"Branche",         done: !!user.industry },
      { label:"Unternehmensinfo", done: !!user.companyDesc },
      { label:"Standort",        done: !!user.location },
      { label:"Profilfoto",      done: !!user.photo },
      { label:"Stelle veröffentlicht", done: empJobs.some(j => j.employerId === user.email) },
    ];
    const doneCount = strengthItems.filter(x => x.done).length;
    const strengthPct = Math.round((doneCount / strengthItems.length) * 100);
    const strengthColor = strengthPct >= 80 ? ACCENT2 : strengthPct >= 50 ? "#f59e0b" : ACCENT;
    return (
      <div style={{width:"100%",display:"flex",flexDirection:"column",background:t.bg,minHeight:"100%"}}>
        <div style={{padding:"14px 20px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <HinkerIcon size={30}/><HinkerWordmark size={20} color={t.text}/>
          </div>
          <input ref={photoRef} type="file" accept="image/*" style={{display:"none"}} onChange={handlePhoto}/>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"0 20px 20px"}}>
          {/* Profile card */}
          <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:20,padding:20,display:"flex",flexDirection:"column",alignItems:"center",gap:12,marginBottom:16}}>
            <button onClick={() => photoRef.current?.click()} style={{background:"none",border:"none",cursor:"pointer",padding:0,borderRadius:"50%"}}>
              <Av src={user.photo} initials={user.initials} color={user.color} size={68} fs={24}/>
            </button>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:800,color:t.text}}>{user.name}</div>
              <div style={{fontSize:13,color:t.text2,marginTop:2}}>{isApp?"👤 Bewerber":"🏢 Arbeitgeber"}</div>
            </div>
            <div style={{display:"flex",width:"100%",borderTop:`1px solid ${t.border}`,paddingTop:12}}>
              {stats.map((s,i) => (
                <div key={i} style={{flex:1,textAlign:"center",borderRight:i<2?`1px solid ${t.border}`:undefined}}>
                  <div style={{fontSize:22,fontWeight:900,color:t.text}}>{s.val}</div>
                  <div style={{fontSize:11,color:t.text3,fontWeight:600}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Profile strength */}
          <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:16,padding:"16px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:700,color:t.text}}>Profilstärke</span>
              <span style={{fontSize:13,fontWeight:800,color:strengthColor}}>{strengthPct}%</span>
            </div>
            <div style={{height:6,borderRadius:99,background:t.bg3,overflow:"hidden",marginBottom:10}}>
              <div style={{height:"100%",borderRadius:99,width:`${strengthPct}%`,background:`linear-gradient(90deg,${strengthColor},${strengthColor}cc)`,transition:"width 0.6s ease"}}/>
            </div>
            {strengthPct < 100 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {strengthItems.filter(x => !x.done).map((x,i) => (
                  <span key={i} style={{fontSize:11,fontWeight:600,color:t.text3,background:t.bg3,border:`1px solid ${t.border}`,borderRadius:20,padding:"3px 9px"}}>+ {x.label}</span>
                ))}
              </div>
            )}
          </div>

          {/* Recruiter: Post a Job */}
          {!isApp && (
            <button onClick={() => { setEditJob(null); setShowJobForm(true); }}
              style={{width:"100%",padding:"14px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${ACCENT2},#009e83)`,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",marginBottom:12,boxShadow:`0 8px 24px ${ACCENT2}44`}}>
              + Stelle veröffentlichen
            </button>
          )}

          {/* Edit buttons */}
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button onClick={() => setShowEditProf(true)}
              style={{flex:1,padding:"12px",borderRadius:12,border:`1px solid ${t.border}`,background:t.bg3,color:t.text,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✏️ Profil</button>
            {isApp && (
              <button onClick={() => setScreen("documents")}
                style={{flex:1,padding:"12px",borderRadius:12,border:`1px solid ${t.border}`,background:t.bg3,color:t.text,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📎 Docs</button>
            )}
          </div>

          {/* Settings rows */}
          {[
            { icon:"🌙", label:"Dark Mode",         toggle:true,  val:darkMode, onToggle:() => { const v=!darkMode; setDarkMode(v); localStorage.setItem("hk_dark",v?"1":"0"); } },
            { icon:"🔔", label:"Benachrichtigungen", toggle:true,  val:notifEnabled, onToggle:() => { const v=!notifEnabled; setNotifEnabled(v); localStorage.setItem("hk_notif",v?"1":"0"); } },
            { icon:"🔒", label:"Datenschutz",        toggle:false, onClick:() => setScreen("datenschutz") },
            { icon:"💳", label:"Abo",                toggle:false, badge:"Pro", onClick:() => setScreen("abo") },
            { icon:"❓", label:"Hilfe & Support",    toggle:false, onClick:() => setScreen("support") },
          ].map((row,i) => (
            <div key={i} onClick={row.onClick} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 0",borderBottom:`1px solid ${t.border}`,cursor:"pointer"}}>
              <span style={{fontSize:18,width:28,textAlign:"center"}}>{row.icon}</span>
              <span style={{flex:1,fontSize:15,fontWeight:600,color:t.text}}>{row.label}</span>
              {row.badge && <span style={{fontSize:10,fontWeight:700,background:`${ACCENT}20`,color:ACCENT,padding:"2px 8px",borderRadius:10}}>{row.badge}</span>}
              {row.toggle ? (
                <div onClick={row.onToggle} style={{width:44,height:26,borderRadius:13,cursor:"pointer",background:row.val?ACCENT:"rgba(128,128,128,0.2)",position:"relative",transition:"background 0.3s",flexShrink:0}}>
                  <div style={{position:"absolute",top:3,left:row.val?20:3,width:20,height:20,borderRadius:"50%",background:"white",transition:"left 0.3s",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}/>
                </div>
              ) : <span style={{color:t.text3,fontSize:16}}>›</span>}
            </div>
          ))}

          <button onClick={handleLogout}
            style={{width:"100%",marginTop:20,padding:"14px 0",borderRadius:14,border:"1.5px solid rgba(255,80,80,0.3)",background:"rgba(255,80,80,0.06)",color:ACCENT,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
            Abmelden
          </button>
        </div>
      </div>
    );
  };

  // ── Chat screen ────────────────────────────────────────────────────────────────
  const ChatUI = () => {
    const isPartnerOnline = chatOpen?.partnerEmail ? !!onlineUsers[chatOpen.partnerEmail] : false;
    const lastSentIdx = chatMsgs.reduce((acc, m, i) => m.from === user.email ? i : acc, -1);

    const handleTyping = (e) => {
      setMsgInput(e.target.value);
      if (!chatOpen?.partnerEmail || !user?.email) return;
      const rtdb = getFireRtdb(); if (!rtdb) return;
      const ck = "chat_" + [user.email, chatOpen.partnerEmail].sort().join("__").replace(/[@.]/g, "_");
      const mk = user.email.replace(/[@.]/g, "_");
      rtdbSet(rtdbRef(rtdb, `typing/${ck}/${mk}`), true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => rtdbSet(rtdbRef(rtdb, `typing/${ck}/${mk}`), false), 2000);
    };

    return (
      <div style={{width:"100%",height:"100vh",display:"flex",flexDirection:"column",background:t.bg}}>
        <div style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
          <button onClick={() => setScreen("home")} style={{background:"none",border:"none",cursor:"pointer",color:t.text2,fontSize:22,padding:"4px",display:"flex",alignItems:"center"}}>‹</button>
          <Av initials={chatOpen?.avatar} color={chatOpen?.color} size={36} fs={13}/>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:t.text}}>{chatOpen?.name}</div>
            <div style={{fontSize:11,fontWeight:600,color:typingPartner?ACCENT:isPartnerOnline?ACCENT2:t.text3,transition:"color 0.2s"}}>
              {typingPartner ? "tippt…" : isPartnerOnline ? "Online" : "Offline"}
            </div>
          </div>
          <button onClick={() => {
            const isApp = role === "applicant";
            handleUnmatch({
              appEmail: isApp ? user.email : chatOpen.partnerEmail,
              jobId:    chatOpen.jobId,
              empEmail: isApp ? chatOpen.partnerEmail : user.email,
            });
          }} style={{background:"rgba(255,80,80,0.08)",border:"1px solid rgba(255,80,80,0.22)",borderRadius:10,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700,color:ACCENT,fontFamily:"inherit",flexShrink:0}}>
            Unmatch
          </button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
          {chatMsgs.length === 0 && <p style={{color:t.text3,fontSize:14,textAlign:"center",marginTop:60}}>Schreib die erste Nachricht 👋</p>}
          {chatMsgs.map((m,i) => {
            const isOwn = m.from === user.email;
            const isLast = i === lastSentIdx;
            return (
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:isOwn?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"78%",padding:"10px 14px",
                  borderRadius:16,
                  borderBottomRightRadius:isOwn?4:16,
                  borderBottomLeftRadius:!isOwn?4:16,
                  background:isOwn?`linear-gradient(135deg,${ACCENT},${ACCENT}bb)`:t.bg3,
                  color:isOwn?"#fff":t.text,
                  fontSize:14,fontWeight:500,lineHeight:1.5}}>
                  {m.text}
                  <div style={{fontSize:10,opacity:0.55,marginTop:3,textAlign:"right"}}>{m.t}</div>
                </div>
                {isOwn && isLast && (
                  <div style={{fontSize:10,color:partnerReading?ACCENT2:t.text3,marginTop:2,fontWeight:600}}>
                    {partnerReading ? "✓✓ gelesen" : "✓ gesendet"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{padding:"10px 12px",borderTop:`1px solid ${t.border}`,display:"flex",gap:8,flexShrink:0,background:t.bg}}>
          <input value={msgInput} onChange={handleTyping}
            onKeyDown={e => e.key==="Enter" && msgInput.trim() && sendMsg()}
            placeholder="Nachricht schreiben…"
            style={{flex:1,height:42,borderRadius:21,border:`1.5px solid ${t.border}`,background:t.bg3,color:t.text,fontSize:14,padding:"0 16px",outline:"none",fontFamily:"inherit"}}/>
          <button onClick={sendMsg} disabled={!msgInput.trim()}
            style={{width:42,height:42,borderRadius:"50%",border:"none",background:`linear-gradient(135deg,${ACCENT},${ACCENT}bb)`,cursor:msgInput.trim()?"pointer":"not-allowed",opacity:msgInput.trim()?1:0.5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>↑</button>
        </div>
      </div>
    );
  };

  // ── Notifications screen ───────────────────────────────────────────────────────
  const NotifUI = () => {
    const isApp = role === "applicant";
    const notifs  = isApp ? appNotifs : empNotifs;
    const setN    = isApp ? setAppNotifs : setEmpNotifs;
    const dbKey   = isApp ? "hk_app_notifs_"+user.email : "hk_emp_notifs_"+user.email;
    const unreadN = notifs.filter(n => !n.read).length;
    const markAll = async () => { const next = notifs.map(n => ({ ...n, read:true })); await save(dbKey, next, setN); };
    return (
      <div style={{width:"100%",minHeight:"100vh",display:"flex",flexDirection:"column",background:t.bg}}>
        <div style={{padding:"12px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
          <button onClick={() => setScreen("home")} style={{background:"none",border:"none",cursor:"pointer",color:t.text2,fontSize:22,padding:4}}>‹</button>
          <div style={{flex:1,fontSize:17,fontWeight:800,color:t.text}}>Benachrichtigungen</div>
          {unreadN > 0 && <button onClick={markAll} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:700,color:ACCENT,fontFamily:"inherit"}}>Alle gelesen</button>}
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {notifs.length === 0 ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:280,gap:12}}>
              <div style={{fontSize:40}}>🔔</div>
              <div style={{fontSize:14,color:t.text2,fontWeight:600}}>Keine Benachrichtigungen</div>
            </div>
          ) : notifs.map((n,i) => (
            <div key={n.id||i}
              onClick={async () => { const nx = notifs.map((x,j) => j===i ? { ...x, read:true } : x); await save(dbKey, nx, setN); }}
              style={{display:"flex",alignItems:"flex-start",gap:12,padding:"14px 20px",borderBottom:`1px solid ${t.border}`,cursor:"pointer",
                background:!n.read?(darkMode?"rgba(255,95,87,0.04)":"rgba(255,95,87,0.03)"):"transparent"}}>
              <div style={{width:44,height:44,borderRadius:12,background:`${ACCENT}18`,border:`1.5px solid ${ACCENT}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                {n.icon}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div style={{fontSize:14,fontWeight:n.read?600:800,color:t.text}}>{n.title}</div>
                  <div style={{fontSize:11,color:t.text3,flexShrink:0}}>{n.time}</div>
                </div>
                <div style={{fontSize:13,color:t.text2,fontWeight:500,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{n.body}</div>
              </div>
              {!n.read && <div style={{width:8,height:8,borderRadius:"50%",background:ACCENT,flexShrink:0,marginTop:4}}/>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Documents screen ───────────────────────────────────────────────────────────
  const DocsUI = () => (
    <div style={{width:"100%",minHeight:"100vh",display:"flex",flexDirection:"column",background:t.bg}}>
      <div style={{padding:"12px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
        <button onClick={() => setScreen("home")} style={{background:"none",border:"none",cursor:"pointer",color:t.text2,fontSize:22,padding:4}}>‹</button>
        <div style={{flex:1,fontSize:17,fontWeight:800,color:t.text}}>📎 Unterlagen</div>
        <button onClick={() => docRef.current?.click()}
          style={{padding:"8px 14px",borderRadius:10,border:"none",background:ACCENT2,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Hinzufügen</button>
        <input ref={docRef} type="file" multiple style={{display:"none"}} onChange={handleDoc}/>
      </div>
      <div style={{flex:1,padding:"20px",display:"flex",flexDirection:"column",gap:10}}>
        {appDocs.length === 0 ? (
          <div style={{textAlign:"center",padding:"3rem",color:t.text3}}>
            <div style={{fontSize:48,marginBottom:12}}>📄</div>
            <p style={{margin:0,fontWeight:600}}>Noch keine Dokumente</p>
          </div>
        ) : appDocs.map(d => (
          <div key={d.id} style={{background:t.card,borderRadius:14,padding:"14px 16px",display:"flex",gap:12,alignItems:"center",border:`1px solid ${t.border}`}}>
            <div style={{fontSize:28}}>📄</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
              <div style={{fontSize:12,color:t.text3}}>{d.size} · {d.date}</div>
            </div>
            {d.url && (
              <a href={d.url} target="_blank" rel="noreferrer"
                style={{background:`${ACCENT2}15`,border:`1px solid ${ACCENT2}30`,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:700,color:ACCENT2,textDecoration:"none",flexShrink:0}}>
                ↓
              </a>
            )}
            <button onClick={() => removeDoc(d.id)} style={{background:"rgba(255,80,80,0.08)",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:ACCENT,flexShrink:0}}>×</button>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Datenschutz screen ─────────────────────────────────────────────────────────
  const DatenschutzUI = () => {
    const deleting  = acctDeleting;
    const deleteErr = acctDeleteErr;
    const sections = [
      { icon:"📋", title:"Was wir speichern", body:"Name, E-Mail-Adresse, Profilfoto, Berufsbezeichnung, Skills, Standort, Bewerbungsunterlagen (Dateinamen) sowie deine Match- und Chat-Verläufe. Keine Zahlungsdaten." },
      { icon:"🔒", title:"Datenspeicherung", body:"Alle Daten liegen verschlüsselt in Google Firebase (EU-Rechenzentrum, Frankfurt). Firebase ist ISO 27001 zertifiziert und DSGVO-konform." },
      { icon:"⚖️", title:"Deine Rechte (DSGVO)", body:"Du hast das Recht auf Auskunft, Berichtigung und Löschung deiner Daten. Du kannst deinen Account jederzeit vollständig löschen — alle Daten werden sofort und dauerhaft entfernt." },
      { icon:"📧", title:"Kontakt & Anfragen", body:"Für Datenschutzanfragen wende dich an: datenschutz@hinker.app\nWir antworten innerhalb von 72 Stunden." },
    ];
    return (
      <div style={{width:"100%",minHeight:"100vh",display:"flex",flexDirection:"column",background:t.bg}}>
        <div style={{padding:"12px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
          <button onClick={() => setScreen("home")} style={{background:"none",border:"none",cursor:"pointer",color:t.text2,fontSize:22,padding:4}}>‹</button>
          <div style={{flex:1,fontSize:17,fontWeight:800,color:t.text}}>🔒 Datenschutz</div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"20px"}}>
          {sections.map((s,i) => (
            <div key={i} style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:16,padding:"16px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <span style={{fontSize:20}}>{s.icon}</span>
                <span style={{fontSize:15,fontWeight:700,color:t.text}}>{s.title}</span>
              </div>
              <p style={{margin:0,fontSize:13,color:t.text2,lineHeight:1.65,whiteSpace:"pre-line"}}>{s.body}</p>
            </div>
          ))}

          {/* Contact button */}
          <button onClick={() => { window.location.href = "mailto:datenschutz@hinker.app"; }}
            style={{width:"100%",padding:"13px",borderRadius:14,border:`1.5px solid ${t.border}`,background:t.card,color:t.text,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",marginBottom:24,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            ✉️ datenschutz@hinker.app
          </button>

          {/* Danger zone */}
          <div style={{background:"rgba(220,38,38,0.05)",border:"1.5px solid rgba(220,38,38,0.2)",borderRadius:16,padding:"16px"}}>
            <div style={{fontSize:13,fontWeight:800,color:"#DC2626",marginBottom:6}}>⚠️ Gefahrenzone</div>
            <p style={{margin:"0 0 14px",fontSize:13,color:t.text2,lineHeight:1.6}}>
              Account löschen entfernt dauerhaft alle deine Daten, Matches und Chats. Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            {deleteErr && <div style={{fontSize:12,color:"#DC2626",marginBottom:10,fontWeight:600}}>{deleteErr}</div>}
            <button disabled={deleting} onClick={() => {
              setConfirmMsg("Account wirklich löschen? Alle Daten, Matches und Chats werden dauerhaft entfernt.");
              setConfirmCb(() => async () => {
                setConfirmCb(null); setAcctDeleting(true);
                try { await handleDeleteAccount(); }
                catch(e) { setAcctDeleteErr("Fehler: " + e.message); setAcctDeleting(false); }
              });
            }} style={{width:"100%",padding:"12px",borderRadius:12,border:"1.5px solid rgba(220,38,38,0.4)",background:"rgba(220,38,38,0.08)",color:"#DC2626",fontWeight:700,fontSize:14,cursor:deleting?"default":"pointer",fontFamily:"inherit",opacity:deleting?0.6:1}}>
              {deleting ? "Wird gelöscht…" : "Account unwiderruflich löschen"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Abo screen ─────────────────────────────────────────────────────────────────
  const AboUI = () => {
    const showToast = aboToast;
    const proFeatures = [
      { icon:"🤖", label:"Unbegrenzte KI-Match-Scores" },
      { icon:"⚡", label:"Priorität in der Discover-Liste" },
      { icon:"✨", label:"Profilhervorhebung für Arbeitgeber" },
      { icon:"🔍", label:"Erweiterte Filter & Suchoptionen" },
      { icon:"📊", label:"Detaillierte Match-Analysen" },
      { icon:"💬", label:"Unbegrenzte Chats & Matches" },
    ];
    return (
      <div style={{width:"100%",minHeight:"100vh",display:"flex",flexDirection:"column",background:t.bg}}>
        <div style={{padding:"12px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
          <button onClick={() => setScreen("home")} style={{background:"none",border:"none",cursor:"pointer",color:t.text2,fontSize:22,padding:4}}>‹</button>
          <div style={{flex:1,fontSize:17,fontWeight:800,color:t.text}}>💳 Mein Abo</div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"20px"}}>
          {/* Current plan */}
          <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:20,padding:"20px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:48,height:48,borderRadius:14,background:`${ACCENT2}20`,border:`2px solid ${ACCENT2}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🆓</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:t.text3,fontWeight:600,marginBottom:2}}>Aktueller Plan</div>
              <div style={{fontSize:20,fontWeight:900,color:t.text}}>Free</div>
              <div style={{fontSize:12,color:t.text2,marginTop:1}}>Swipen, matchen & chatten kostenlos</div>
            </div>
            <span style={{fontSize:11,fontWeight:700,background:`${ACCENT2}20`,color:ACCENT2,padding:"4px 10px",borderRadius:20}}>Aktiv</span>
          </div>

          {/* Pro plan */}
          <div style={{background:`linear-gradient(135deg,#1a0a1a,#0d0d1a)`,border:`2px solid ${ACCENT}60`,borderRadius:20,padding:"20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",background:`${ACCENT}15`,pointerEvents:"none"}}/>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <div style={{width:48,height:48,borderRadius:14,background:`linear-gradient(135deg,${ACCENT},${PURPLE})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>⭐</div>
              <div>
                <div style={{fontSize:22,fontWeight:900,color:"#fff",letterSpacing:"-0.02em"}}>Hinker Pro</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.45)"}}>Alles, was du brauchst</div>
              </div>
              <div style={{marginLeft:"auto",textAlign:"right"}}>
                <div style={{fontSize:22,fontWeight:900,color:ACCENT}}>9,99 €</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.35)"}}>pro Monat</div>
              </div>
            </div>
            {proFeatures.map((f,i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i < proFeatures.length-1 ? "1px solid rgba(255,255,255,0.06)" : "none"}}>
                <span style={{fontSize:16,width:24,textAlign:"center"}}>{f.icon}</span>
                <span style={{fontSize:13,color:"rgba(255,255,255,0.7)",fontWeight:500}}>{f.label}</span>
                <span style={{marginLeft:"auto",fontSize:14,color:ACCENT2}}>✓</span>
              </div>
            ))}
            <button onClick={() => { setAboToast(true); setTimeout(() => setAboToast(false), 3000); }}
              style={{width:"100%",marginTop:18,padding:"14px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${ACCENT},${ACCENT}bb)`,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 8px 24px ${ACCENT}44`}}>
              Pro freischalten →
            </button>
          </div>

          <p style={{fontSize:12,color:t.text3,textAlign:"center",lineHeight:1.6}}>
            Hinker Pro erscheint bald. Wir benachrichtigen dich, sobald es verfügbar ist.
          </p>
        </div>

        {/* Toast */}
        {showToast && (
          <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"#1a1a2a",color:"#fff",padding:"12px 20px",borderRadius:12,fontSize:13,fontWeight:600,whiteSpace:"nowrap",boxShadow:"0 8px 24px rgba(0,0,0,0.4)",zIndex:999}}>
            🚀 Bald verfügbar — du wirst benachrichtigt!
          </div>
        )}
      </div>
    );
  };

  // ── Support screen ─────────────────────────────────────────────────────────────
  const SupportUI = () => {
    const openFaq = faqOpen;
    const faqs = [
      { q:"Wie funktioniert das Swipen?", a:"Wische eine Karte nach rechts (♥ Hire), um Interesse zu zeigen, oder nach links (✕ Skip), um sie zu überspringen. Du kannst auch die Schaltflächen unter der Karte nutzen." },
      { q:"Wie entsteht ein Match?", a:"Ein Match entsteht sofort, wenn du eine Stelle nach rechts swipest (als Bewerber). Arbeitgeber können ebenfalls Kandidaten liken — sobald beide Interesse zeigen, wird der Chat freigeschaltet." },
      { q:"Warum sehe ich keine neuen Jobs?", a:'Wenn alle Jobs gesehen wurden, erscheint die Meldung „Alle gesehen!". Klicke auf 🔄 Nochmal oder passe deine Filter an. Neue Jobs tauchen auf, sobald Arbeitgeber sie veröffentlichen.' },
      { q:"Wie ändere ich mein Passwort?", a:'Tippe auf der Anmeldeseite auf „Passwort vergessen?" — du erhältst eine E-Mail mit einem Reset-Link. Der Link ist 1 Stunde gültig.' },
      { q:"Wie lösche ich meinen Account?", a:'Gehe zu Profil → Datenschutz → „Account unwiderruflich löschen". Alle deine Daten, Matches und Chats werden sofort und dauerhaft entfernt.' },
      { q:"Kann ich mein Profil später noch ändern?", a:'Ja. Tippe auf Profil → ✏️ Profil, um Name, Berufsbezeichnung, Skills, Standort und Foto zu aktualisieren. Änderungen sind sofort sichtbar.' },
      { q:"Warum kommt kein Bestätigungs-E-Mail?", a:'Prüfe deinen Spam-Ordner. Bei Yahoo-Adressen kann es länger dauern. Du kannst auf dem Verifizierungsbildschirm erneut auf „Bestätigungslink senden" tippen.' },
    ];
    return (
      <div style={{width:"100%",minHeight:"100vh",display:"flex",flexDirection:"column",background:t.bg}}>
        <div style={{padding:"12px 20px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
          <button onClick={() => setScreen("home")} style={{background:"none",border:"none",cursor:"pointer",color:t.text2,fontSize:22,padding:4}}>‹</button>
          <div style={{flex:1,fontSize:17,fontWeight:800,color:t.text}}>❓ Hilfe & Support</div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"20px"}}>
          {/* FAQ */}
          <div style={{fontSize:11,fontWeight:700,color:t.text3,marginBottom:12,letterSpacing:"0.1em",textTransform:"uppercase"}}>Häufige Fragen</div>
          <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:16,overflow:"hidden",marginBottom:20}}>
            {faqs.map((f,i) => (
              <div key={i} style={{borderBottom:i < faqs.length-1 ? `1px solid ${t.border}` : "none"}}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  style={{width:"100%",padding:"14px 16px",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,fontFamily:"inherit",textAlign:"left"}}>
                  <span style={{flex:1,fontSize:14,fontWeight:600,color:t.text}}>{f.q}</span>
                  <span style={{fontSize:16,color:t.text3,flexShrink:0,transition:"transform 0.2s",transform:openFaq===i?"rotate(90deg)":"none"}}>›</span>
                </button>
                {openFaq === i && (
                  <div style={{padding:"0 16px 14px",fontSize:13,color:t.text2,lineHeight:1.7}}>{f.a}</div>
                )}
              </div>
            ))}
          </div>

          {/* Contact */}
          <div style={{fontSize:11,fontWeight:700,color:t.text3,marginBottom:12,letterSpacing:"0.1em",textTransform:"uppercase"}}>Kontakt</div>
          <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:16,padding:"16px",marginBottom:12}}>
            <p style={{margin:"0 0 14px",fontSize:13,color:t.text2,lineHeight:1.6}}>
              Keine Antwort gefunden? Schreib uns — wir antworten innerhalb von 24 Stunden.
            </p>
            <button onClick={() => { window.location.href = "mailto:support@hinker.app?subject=Hinker Support"; }}
              style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${ACCENT2},#009e83)`,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              ✉️ support@hinker.app
            </button>
          </div>

          {/* App info */}
          <div style={{textAlign:"center",padding:"16px 0"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:6}}>
              <HinkerIcon size={22}/>
              <HinkerWordmark size={16} color={t.text3}/>
            </div>
            <div style={{fontSize:11,color:t.text3}}>Version 0.1.0 · © 2025 Hinker</div>
          </div>
        </div>
      </div>
    );
  };

  // ── Routing ────────────────────────────────────────────────────────────────────
  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)}/>;
  if (!loaded)    return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0d0d0d"}}><div style={{width:36,height:36,border:`3px solid ${ACCENT}30`,borderTopColor:ACCENT,borderRadius:"50%"}}/></div>;

  if (!onboarded) {
    const slides = [
      { title:"Swipe to Hire",  sub:"Entdecke Top-Talente — swipe rechts für Kandidaten, die du liebst.", icon:"swipe", color:ACCENT  },
      { title:"Link. Connect.", sub:"Baue dein professionelles Netzwerk auf. Jeder Match ist eine neue Chance.", icon:"link", color:ACCENT2 },
      { title:"Hired.",         sub:"Vom ersten Swipe bis zum Vertragsabschluss — schnell, smart, menschlich.", icon:"win",  color:PURPLE  },
    ];
    const sl = slides[onboardIdx];
    const isLast = onboardIdx === slides.length - 1;
    return (
      <div style={{height:"100vh",overflow:"hidden"}}>
        <OnboardingSlide {...sl} isLast={isLast}
          onNext={() => { if (!isLast) setOnboardIdx(i => i+1); else { localStorage.setItem("hk_onboarded","1"); setOnboarded(true); } }}
          onSkip={() => { localStorage.setItem("hk_onboarded","1"); setOnboarded(true); }}/>
      </div>
    );
  }

  // Show verify screen if verifyPending OR if Firebase has an unverified user signed in
  const _cu = getFireAuth().currentUser;
  if (verifyPending || (_cu && !_cu.emailVerified)) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:t.bg,padding:"2rem"}}>
      <div style={{maxWidth:360,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:18,textAlign:"center"}}>
        <div style={{fontSize:56}}>✉️</div>
        <HinkerWordmark size={28} color={t.text}/>
        <div>
          <p style={{fontWeight:800,fontSize:18,color:t.text,margin:"0 0 8px"}}>E-Mail bestätigen</p>
          <p style={{fontSize:14,color:t.text2,margin:0,lineHeight:1.6}}>
            Sende dir den Bestätigungslink, klicke ihn an und kehre dann hierher zurück.
          </p>
        </div>

        {/* Status message */}
        {verifyErr && (
          <div style={{fontSize:13,fontWeight:600,padding:"10px 14px",borderRadius:10,width:"100%",textAlign:"left",
            color: verifyErr.startsWith("✓") ? ACCENT2 : ACCENT,
            background: verifyErr.startsWith("✓") ? `${ACCENT2}15` : `${ACCENT}10`}}>
            {verifyErr}
          </div>
        )}

        {/* Step 1: Send email */}
        <button onClick={async () => {
          const cu = getFireAuth().currentUser;
          if (!cu) { setVerifyErr("Sitzung abgelaufen — bitte melde dich erneut an."); return; }
          const ok = await sendVerifyEmail(cu);
          if (ok) setVerifyErr("✓ E-Mail wurde gesendet — bitte prüfe auch den Spam-Ordner.");
        }} style={{width:"100%",height:52,borderRadius:14,border:"none",background:`linear-gradient(135deg,${ACCENT2},${ACCENT2}cc)`,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>
          ✉️ Bestätigungslink senden
        </button>

        {/* Step 2: Confirm after clicking link */}
        <button onClick={async () => {
          setVerifyErr("");
          const cu = getFireAuth().currentUser;
          if (!cu) { setVerifyErr("Sitzung abgelaufen — bitte melde dich erneut an."); return; }
          try {
            await cu.reload();
            if (getFireAuth().currentUser?.emailVerified) {
              await signOut(getFireAuth());
              setVerifyPending(false);
            } else {
              setVerifyErr("Noch nicht bestätigt — bitte klicke zuerst den Link in der E-Mail.");
            }
          } catch(e) { setVerifyErr(e.message); }
        }} style={{width:"100%",height:46,borderRadius:12,border:`1.5px solid ${t.border}`,background:t.bg2,color:t.text,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          ✓ Ich habe den Link angeklickt
        </button>

        {/* Back to login */}
        <button onClick={async () => { await signOut(getFireAuth()); setVerifyPending(false); setVerifyErr(""); }}
          style={{background:"none",border:"none",cursor:"pointer",color:t.text3,fontSize:13,fontFamily:"inherit"}}>
          Zurück zur Anmeldung
        </button>
      </div>
    </div>
  );

  if (!role || !user) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:t.bg,overflow:"auto"}}>
      <div style={{padding:"36px 28px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <HinkerIcon size={56}/>
        <HinkerWordmark size={32} color={t.text}/>
        <p style={{fontSize:14,color:t.text2,textAlign:"center",fontWeight:500,margin:0}}>
          {authMode==="login" ? "Willkommen zurück 👋" : "Erstelle deinen Account 🚀"}
        </p>
      </div>
      <div style={{display:"flex",margin:"0 24px",background:t.bg3,borderRadius:12,padding:4,gap:4}}>
        {[["login","Anmelden"],["register","Registrieren"]].map(([m,lbl]) => (
          <button key={m} onClick={() => { setAuthMode(m); setAuthErr(""); setResetSent(false); setShowPasswd(false); }}
            style={{flex:1,height:38,borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:14,transition:"all 0.2s",background:authMode===m?t.card:"transparent",color:authMode===m?t.text:t.text2,boxShadow:authMode===m?`0 2px 8px ${t.border}`:"none"}}>{lbl}</button>
        ))}
      </div>
      <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:14}}>
        {authMode==="register" && (
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <span style={{fontSize:12,fontWeight:600,color:t.text2,letterSpacing:"0.04em"}}>Name</span>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:16,opacity:0.4}}>👤</span>
              <input value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Max Mustermann"
                style={{width:"100%",height:48,borderRadius:12,border:`1.5px solid ${t.border}`,background:t.bg2,color:t.text,fontSize:15,fontWeight:500,padding:"0 16px 0 42px",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <span style={{fontSize:12,fontWeight:600,color:t.text2,letterSpacing:"0.04em"}}>E-Mail</span>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:16,opacity:0.4}}>✉️</span>
            <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="du@firma.de"
              style={{width:"100%",height:48,borderRadius:12,border:`1.5px solid ${t.border}`,background:t.bg2,color:t.text,fontSize:15,fontWeight:500,padding:"0 16px 0 42px",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <span style={{fontSize:12,fontWeight:600,color:t.text2,letterSpacing:"0.04em"}}>Passwort</span>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:16,opacity:0.4}}>🔒</span>
            <input type={showPasswd?"text":"password"} value={authPass} onChange={e => setAuthPass(e.target.value)} placeholder="••••••••"
              onKeyDown={e => e.key==="Enter" && handleAuth()}
              style={{width:"100%",height:48,borderRadius:12,border:`1.5px solid ${t.border}`,background:t.bg2,color:t.text,fontSize:15,fontWeight:500,padding:"0 48px 0 42px",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
            <button onClick={() => setShowPasswd(p => !p)} type="button"
              style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",padding:4,fontSize:18,opacity:0.5,lineHeight:1}}>
              {showPasswd ? "🙈" : "👁️"}
            </button>
          </div>
        </div>
        {authMode==="register" && (
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <span style={{fontSize:12,fontWeight:600,color:t.text2,letterSpacing:"0.04em"}}>Ich bin…</span>
            <div style={{display:"flex",gap:8}}>
              {[["applicant","👤 Bewerber"],["employer","🏢 Arbeitgeber"]].map(([id,lbl]) => (
                <button key={id} onClick={() => setAuthRole(id)}
                  style={{flex:1,height:44,borderRadius:12,border:`1.5px solid ${authRole===id?ACCENT:t.border}`,background:authRole===id?`${ACCENT}15`:t.bg3,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,color:authRole===id?ACCENT:t.text2,transition:"all 0.2s"}}>{lbl}</button>
              ))}
            </div>
          </div>
        )}
        {authErr && <div style={{fontSize:13,color:ACCENT,fontWeight:600,textAlign:"center",padding:"8px 12px",background:`${ACCENT}10`,borderRadius:8}}>{authErr}</div>}
        {resetSent && <div style={{fontSize:13,color:ACCENT2,fontWeight:600,textAlign:"center",padding:"8px 12px",background:`${ACCENT2}10`,borderRadius:8}}>✅ E-Mail gesendet — bitte prüfe deinen Posteingang.</div>}
        <button onClick={handleAuth} disabled={authLoading}
          style={{width:"100%",height:52,borderRadius:14,border:"none",background:`linear-gradient(135deg,${ACCENT},${ACCENT}bb)`,color:"white",fontSize:16,fontWeight:800,fontFamily:"inherit",cursor:authLoading?"default":"pointer",boxShadow:`0 8px 20px ${ACCENT}44`,marginTop:4,opacity:authLoading?0.7:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {authLoading
            ? <><div style={{width:18,height:18,border:"2px solid rgba(255,255,255,0.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/> Bitte warten…</>
            : (authMode==="login" ? "Anmelden →" : "Account erstellen →")
          }
        </button>
        {authMode==="login" && (
          <button onClick={handlePasswordReset}
            style={{background:"none",border:"none",cursor:"pointer",color:t.text2,fontSize:13,fontWeight:600,fontFamily:"inherit",textAlign:"center",padding:"4px 0"}}>
            Passwort vergessen?
          </button>
        )}
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,height:1,background:t.border}}/>
          <span style={{fontSize:12,color:t.text3,fontWeight:500}}>oder</span>
          <div style={{flex:1,height:1,background:t.border}}/>
        </div>
      </div>
    </div>
  );

  // Overlay screens (full-screen, no bottom nav)
  if (screen==="notifications" || screen==="emp_notifs") return <><Modals/>{NotifUI()}</>;
  if ((screen==="app_chat" || screen==="emp_chat") && chatOpen) return <><Modals/>{ChatUI()}</>;
  if (screen==="documents")   return <><Modals/>{DocsUI()}</>;
  if (screen==="datenschutz") return <><Modals/>{DatenschutzUI()}</>;
  if (screen==="abo")         return <><Modals/>{AboUI()}</>;
  if (screen==="support")     return <><Modals/>{SupportUI()}</>;


  // Main app with bottom nav
  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",background:t.bg}}>
      <Modals/>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch"}}>
        {tab==="discover"  && DiscoverTab()}
        {tab==="matches"   && MatchesTab()}
        {tab==="profile"   && ProfileTab()}
      </div>
      {NavBar()}
    </div>
  );
}
