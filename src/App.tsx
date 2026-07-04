import React from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import LandingPage from "./components/LandingPage";
import Dashboard from "./components/Dashboard";
import AuthGate from "./components/AuthGate";
import { supabaseService } from "./lib/supabase";
import { messageService } from "./services/messageService";
import { leadService } from "./services/leadService";
import "./App.css";

const initializeServices = async () => {
  try {
    const supabaseInitialized = await supabaseService.initialize();
    console.log(`Supabase initialized: ${supabaseInitialized}`);
    messageService.reinitializeStorage();
    leadService.reinitializeStorage();
    console.log("All services initialized successfully");
  } catch (error) {
    console.error("Failed to initialize services:", error);
  }
};

initializeServices();

const Navigation: React.FC = () => {
  const location = useLocation();

  return (
    <nav className="tq-main-nav">
      <div className="tq-nav-container">
        <Link to="/" className="tq-nav-brand">
          <span className="tq-nav-logo">TQ</span>
          <span className="tq-nav-brand-text">
            <span className="tq-nav-brand-main">Tech Quarters</span>
            <span className="tq-nav-brand-sub">Funnel ChatBot</span>
          </span>
        </Link>
        <div className="tq-nav-links">
          <Link to="/" className={location.pathname === "/" ? "active" : ""}>Home</Link>
          <Link to="/dashboard" className={location.pathname === "/dashboard" ? "active" : ""}>Dashboard</Link>
        </div>
      </div>
    </nav>
  );
};

const Footer: React.FC = () => (
  <footer className="tq-main-footer">
    <div className="tq-footer-container">
      <p className="tq-footer-copy">
        &copy; 2026 Tech Quarters Funnel ChatBot. Built as a reusable qualification engine.
      </p>
      <div className="tq-footer-links">
        <a href="/dashboard">Dashboard</a>
        <a href="#system">System Structure</a>
        <a href="#log">Decision Log</a>
        <a href="#privacy">Privacy</a>
      </div>
    </div>
  </footer>
);

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
