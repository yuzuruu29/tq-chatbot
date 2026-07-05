import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import LandingPage from "./components/LandingPage";
import Dashboard from "./components/Dashboard";
import AuthGate from "./components/AuthGate";
import { supabaseService } from "./lib/supabase";
import { messageService } from "./services/messageService";
import { leadService } from "./services/leadService";
import { logger } from "./lib/logger";
import "./App.css";

const initializeServices = async () => {
  try {
    const supabaseInitialized = await supabaseService.initialize();
    logger.debug("Supabase initialized", { initialized: supabaseInitialized });
    messageService.reinitializeStorage();
    leadService.reinitializeStorage();
    logger.debug("All services initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize services", error);
  }
};

initializeServices();

// ─── Smooth Scroll Link ──────────────────────────────────────
// On landing page: scrolls to section. On other pages: navigates to /#id.
const ScrollLink: React.FC<{ to: string; children: React.ReactNode; className?: string }> = ({ to, children, className }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const id = to.replace("/#", "");
    if (location.pathname === "/") {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    navigate("/" + to);
    // After navigation, scroll once the element appears
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [location.pathname, navigate, to]);

  return <a href={"/" + to} onClick={handleClick} className={className}>{children}</a>;
};

// ─── Navigation ──────────────────────────────────────────────
const Navigation: React.FC = () => {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Hide nav on dashboard route (dashboard has its own sidebar)
  if (location.pathname === "/dashboard") return null;

  return (
    <header className={`tq-main-nav${scrolled ? " scrolled" : ""}`} role="banner">
      <div className="tq-nav-container">
        <Link to="/" className="tq-nav-brand" aria-label="TQ Funnel ChatBot — Home">
          <div className="tq-nav-logo" aria-hidden="true">TQ</div>
          <div className="tq-nav-brand-text">
            <span className="tq-nav-brand-main">Tech Quarters</span>
            <span className="tq-nav-brand-sub">Funnel ChatBot</span>
          </div>
        </Link>
        <nav className="tq-nav-links" aria-label="Main navigation">
          <ScrollLink to="#system-value">System</ScrollLink>
          <ScrollLink to="#how-it-works">Pipeline</ScrollLink>
          <ScrollLink to="#config">Config Layer</ScrollLink>
          <ScrollLink to="#dashboard">Dashboard</ScrollLink>
          <ScrollLink to="#architecture">Architecture</ScrollLink>
        </nav>
        <div className="tq-nav-actions">
          <Link to="/dashboard" className="tq-btn tq-btn-ghost tq-btn-sm">Dashboard</Link>
          <button
            className="tq-btn tq-btn-primary tq-btn-sm"
            onClick={() => {
              const chatToggle = document.querySelector(".tq-chatbot-toggle") as HTMLButtonElement;
              chatToggle?.click();
            }}
          >
            Open Chat Demo
          </button>
        </div>
      </div>
    </header>
  );
};

// ─── Footer ──────────────────────────────────────────────────
const Footer: React.FC = () => {
  const location = useLocation();
  // Hide footer on dashboard route
  if (location.pathname === "/dashboard") return null;

  return (
    <footer className="tq-main-footer" role="contentinfo">
      <div className="tq-footer-container">
        <div className="tq-footer-inner">
          <div>
            <div className="tq-footer-brand">
              <div className="tq-nav-logo" style={{ width: 28, height: 28, fontSize: 12 }}>TQ</div>
              <span style={{ fontWeight: 700, fontSize: "var(--tq-text-sm)" }}>Tech Quarters</span>
            </div>
            <p className="tq-footer-copy">
              A reusable funnel operator for client sites. Qualify visitors, extract buying signals,
              score intent, and route the right leads to the calendar.
            </p>
          </div>
          <div className="tq-footer-links">
            <div className="tq-footer-col">
              <h5>System</h5>
              <ScrollLink to="#system-value">Value Proposition</ScrollLink>
              <ScrollLink to="#how-it-works">Pipeline Flow</ScrollLink>
              <ScrollLink to="#config">Config Layer</ScrollLink>
              <ScrollLink to="#architecture">Architecture</ScrollLink>
            </div>
            <div className="tq-footer-col">
              <h5>Product</h5>
              <Link to="/dashboard">Funnel Dashboard</Link>
              <a href="#" onClick={(e) => {
                e.preventDefault();
                const chatToggle = document.querySelector(".tq-chatbot-toggle") as HTMLButtonElement;
                chatToggle?.click();
              }}>Chat Demo</a>
              <a href="#">Decision Log</a>
            </div>
            <div className="tq-footer-col">
              <h5>Resources</h5>
              <a href="#">System Structure</a>
              <a href="#">Reconfiguration Guide</a>
              <a href="#">Cost Breakdown</a>
            </div>
          </div>
        </div>
        <div className="tq-footer-bottom">
          <span className="tq-footer-bottom-text">© 2026 Tech Quarters Funnel ChatBot. Built once. Reconfigured per client.</span>
          <span className="tq-footer-bottom-text" style={{ fontFamily: "var(--tq-mono)", fontSize: 11 }}>v1.0.0</span>
        </div>
      </div>
    </footer>
  );
};

// ─── App ─────────────────────────────────────────────────────
const App: React.FC = () => {
  return (
    <Router>
      <div className="tq-app">
        <Navigation />
        <main className="tq-main-content">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<AuthGate><Dashboard /></AuthGate>} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
};

export default App;
