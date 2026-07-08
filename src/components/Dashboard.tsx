// TQ ChatBot — Dashboard Component
// Sidebar layout matching the Open Design reference
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { Lead, DashboardMetrics, LeadScore } from "../types";
import { dashboardService } from "../services/dashboardService";
import { supabaseService } from "../lib/supabase";
import { logger } from "../lib/logger";

// ─── Sidebar Icons ───────────────────────────────────────────
const IconGrid = () => <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
const IconChatSidebar = () => <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
const IconUsers = () => <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
const IconActivity = () => <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const IconBarChart = () => <svg viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>;
const IconCalendar = () => <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconSettings = () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
const IconFile = () => <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
const IconHome = () => <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IconMenu = () => <svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
const IconDownload = () => <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;

export const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    leads_today: 0,
    leads_week: 0,
    leads_month: 0,
    score_split: { low: 0, medium: 0, high: 0 },
    calendly_shown: 0,
    calendly_clicked: 0,
    calendly_booked: 0,
    funnel_steps: {},
    recent_conversations: []
  });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"today" | "week" | "month">("week");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [funnelSteps, setFunnelSteps] = useState<Array<{ name: string; value: number; drop?: string }>>([]);
  const [hasRealFunnelData, setHasRealFunnelData] = useState(false);
  const [connected] = useState<boolean>(supabaseService.isInitialized());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(leads.length / PAGE_SIZE) || 1;

  // Reset page when data changes so it never exceeds available pages.
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [leads.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadCsv = () => {
    if (leads.length === 0) return;
    const headers = ["Name", "Email", "Company", "Score", "Route", "Status", "Created"];
    const rows = leads.map((l) => [
      l.contact_info?.name || "",
      l.contact_info?.email || "",
      l.contact_info?.company || "",
      l.score,
      l.route,
      l.status,
      l.created_at,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tq-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const tenantId = "00000000-0000-0000-0000-000000000000";
      const data = await dashboardService.getDashboardData(tenantId);
      setLeads(data.leads);

      const now = new Date();
      let startDate: Date;
      switch (timeRange) {
        case "today": startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
        case "week": startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
        case "month": startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
      }

      const filteredLeads = data.leads.filter(lead => new Date(lead.created_at) >= startDate);
      const scoreSplit: Record<LeadScore, number> = { low: 0, medium: 0, high: 0 };
      filteredLeads.forEach(lead => { scoreSplit[lead.score]++; });

      setFunnelSteps(data.funnelSteps);
      setHasRealFunnelData(data.hasRealData);

      setMetrics({
        leads_today: timeRange === "today" ? filteredLeads.length : 0,
        leads_week: timeRange === "week" ? filteredLeads.length : 0,
        leads_month: timeRange === "month" ? filteredLeads.length : 0,
        score_split: scoreSplit,
        calendly_shown: data.calendly.shown,
        calendly_clicked: data.calendly.clicked,
        calendly_booked: data.calendly.booked,
        funnel_steps: {},
        recent_conversations: []
      });
    } catch (error) {
      logger.error("Failed to load dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  const getRouteLabel = (route: string): string => {
    switch (route) {
      case "calendly": return "Calendly";
      case "soft_booking": return "Soft Booking";
      case "nurture": return "Nurture";
      case "helpful_guidance": return "Guidance";
      default: return route;
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  const totalLeads = timeRange === "today" ? metrics.leads_today : timeRange === "week" ? metrics.leads_week : metrics.leads_month;

  return (
    <div className="tq-dashboard-app">
      {/* Mobile sidebar toggle */}
      <button
        className="tq-sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        <IconMenu />
      </button>

      {/* Sidebar */}
      <aside className={`tq-sidebar${sidebarOpen ? " open" : ""}`} role="navigation" aria-label="Dashboard navigation">
        <div className="tq-sidebar-brand">
          <div className="tq-sidebar-mark">TQ</div>
          <div className="tq-sidebar-brand-text">
            <div className="tq-sidebar-brand-name">Tech Quarters</div>
            <div className="tq-sidebar-brand-sub">Funnel ChatBot</div>
          </div>
        </div>
        <nav className="tq-sidebar-nav">
          <div className="tq-sidebar-section-label">Overview</div>
          <Link to="/dashboard" className="tq-sidebar-link tq-sidebar-link-active">
            <IconGrid /> Dashboard
          </Link>
          <a href="#conversations-table" className="tq-sidebar-link">
            <IconChatSidebar /> Conversations
          </a>
          <a href="#leads-overview" className="tq-sidebar-link">
            <IconUsers /> Leads
          </a>

          <div className="tq-sidebar-section-label" style={{ marginTop: "var(--tq-sp-4)" }}>Analytics</div>
          <span className="tq-sidebar-link tq-sidebar-link-disabled" aria-disabled="true">
            <IconActivity /> Funnel Steps
          </span>
          <span className="tq-sidebar-link tq-sidebar-link-disabled" aria-disabled="true">
            <IconBarChart /> Score Analysis
          </span>
          <span className="tq-sidebar-link tq-sidebar-link-disabled" aria-disabled="true">
            <IconCalendar /> Booking Calendar
          </span>

          <div className="tq-sidebar-section-label" style={{ marginTop: "var(--tq-sp-4)" }}>System</div>
          <span className="tq-sidebar-link tq-sidebar-link-disabled" aria-disabled="true">
            <IconSettings /> Configuration
          </span>
          <span className="tq-sidebar-link tq-sidebar-link-disabled" aria-disabled="true">
            <IconFile /> Decision Log
          </span>
          <Link to="/" className="tq-sidebar-link">
            <IconHome /> Landing Page
          </Link>
        </nav>
        <div className="tq-sidebar-footer">
          <div className="tq-sidebar-status">
            <span className="tq-sidebar-status-dot" />
            {connected ? "Supabase connected" : "Local / Mock mode"}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="tq-dashboard-main" role="main" aria-label="Dashboard content">
        <div className="tq-topbar">
          <div>
            <div className="tq-topbar-title">Funnel Dashboard</div>
            <div className="tq-topbar-subtitle">Where is the funnel leaking? Lead qualification, routing, and booking visibility.</div>
          </div>
          <div className="tq-topbar-actions">
            <div className="tq-topbar-tabs">
              {(["today", "week", "month"] as const).map((range) => (
                <button
                  key={range}
                  className={`tq-topbar-tab${timeRange === range ? " tq-topbar-tab-active" : ""}`}
                  onClick={() => setTimeRange(range)}
                >
                  {range === "today" ? "Today" : range === "week" ? "This Week" : "This Month"}
                </button>
              ))}
            </div>
            <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={downloadCsv}>
              <svg className="tq-btn-icon" viewBox="0 0 24 24"><IconDownload /></svg>
              Export
            </button>
          </div>
        </div>

        <div className="tq-dashboard-content">
          {loading ? (
            <div className="tq-dashboard-content">
              <div className="tq-dashboard-kpi-grid">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="tq-dashboard-kpi-card">
                    <div className="tq-skeleton tq-skeleton-text-short" style={{ marginBottom: 8 }} />
                    <div className="tq-skeleton tq-skeleton-block" style={{ height: 32, width: "60%", marginTop: 8 }} />
                  </div>
                ))}
              </div>
              <div className="tq-dashboard-card">
                <div className="tq-skeleton tq-skeleton-text" style={{ width: "50%", marginBottom: 16 }} />
                <div className="tq-skeleton tq-skeleton-card" />
              </div>
              <div className="tq-dashboard-card">
                <div className="tq-skeleton tq-skeleton-text" style={{ width: "50%", marginBottom: 16 }} />
                <div className="tq-skeleton tq-skeleton-block" style={{ height: 200 }} />
              </div>
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="tq-dashboard-kpi-grid" id="leads-overview">
                <div className="tq-dashboard-kpi-card">
                  <div className="tq-dashboard-kpi-header">
                    <span className="tq-dashboard-kpi-label">Leads Today</span>
                    <div className="tq-dashboard-kpi-icon tq-dashboard-kpi-icon-blue"><IconUsers /></div>
                  </div>
                  <div className="tq-dashboard-kpi-value">{totalLeads}</div>
                  <div className="tq-dashboard-kpi-change tq-kpi-up">
                    {timeRange === "today" ? "Today" : timeRange === "week" ? "This Week" : "This Month"}
                  </div>
                </div>
                <div className="tq-dashboard-kpi-card">
                  <div className="tq-dashboard-kpi-header">
                    <span className="tq-dashboard-kpi-label">Qualified</span>
                    <div className="tq-dashboard-kpi-icon tq-dashboard-kpi-icon-green">
                      <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                  </div>
                  <div className="tq-dashboard-kpi-value">{metrics.score_split.high}</div>
                  <div className="tq-dashboard-kpi-change tq-kpi-up">
                    {totalLeads > 0 ? `${Math.round((metrics.score_split.high / totalLeads) * 100)}% rate` : "0% rate"}
                  </div>
                </div>
                <div className="tq-dashboard-kpi-card">
                  <div className="tq-dashboard-kpi-header">
                    <span className="tq-dashboard-kpi-label">Nurture</span>
                    <div className="tq-dashboard-kpi-icon tq-dashboard-kpi-icon-amber"><IconActivity /></div>
                  </div>
                  <div className="tq-dashboard-kpi-value">{metrics.score_split.medium}</div>
                  <div className="tq-dashboard-kpi-change" style={{ color: "var(--tq-warning)" }}>
                    {totalLeads > 0 ? `${Math.round((metrics.score_split.medium / totalLeads) * 100)}% of total` : "0%"}
                  </div>
                </div>
                <div className="tq-dashboard-kpi-card">
                  <div className="tq-dashboard-kpi-header">
                    <span className="tq-dashboard-kpi-label">Booked</span>
                    <div className="tq-dashboard-kpi-icon tq-dashboard-kpi-icon-green"><IconCalendar /></div>
                  </div>
                  <div className="tq-dashboard-kpi-value">{metrics.calendly_booked}</div>
                  <div className="tq-dashboard-kpi-change tq-kpi-up">
                    {metrics.calendly_shown > 0 ? `${Math.round((metrics.calendly_booked / metrics.calendly_shown) * 100)}% of shown` : "0%"}
                  </div>
                </div>
              </div>

              {/* Score Distribution */}
              <div className="tq-dashboard-card">
                <div className="tq-dashboard-card-header">
                  <div>
                    <div className="tq-dashboard-card-title">Score Distribution</div>
                    <div className="tq-dashboard-card-subtitle">Lead intent scoring breakdown</div>
                  </div>
                </div>
                <div className="tq-dashboard-card-body">
                  <div className="tq-dashboard-score-split">
                    {([
                      { key: "high" as LeadScore, label: "High — Qualified", dot: "high" },
                      { key: "medium" as LeadScore, label: "Medium — Nurture", dot: "medium" },
                      { key: "low" as LeadScore, label: "Low — Low Priority", dot: "low" },
                    ]).map((item) => (
                      <div key={item.key} className="tq-dashboard-score-split-item">
                        <span className={`tq-dashboard-score-dot tq-dashboard-score-dot-${item.dot}`} />
                        <span className="tq-dashboard-score-split-label">{item.label}</span>
                        <span className="tq-dashboard-score-split-value">{metrics.score_split[item.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Funnel Steps */}
              <div className="tq-dashboard-card">
                <div className="tq-dashboard-card-header">
                  <div>
                    <div className="tq-dashboard-card-title">Funnel Steps</div>
                    <div className="tq-dashboard-card-subtitle">
                      {hasRealFunnelData ? "Real event-based funnel data" : "Where is the funnel leaking? (estimated)"}
                    </div>
                  </div>
                  <button className="tq-btn tq-btn-ghost tq-btn-sm">View Details →</button>
                </div>
                <div className="tq-dashboard-card-body">
                  {!hasRealFunnelData && (
                    <div style={{ marginBottom: "var(--tq-sp-3)", fontSize: "var(--tq-text-xs)", color: "var(--tq-warning)", background: "var(--tq-warning-bg)", padding: "4px 10px", borderRadius: "var(--tq-radius-pill)", display: "inline-block", fontWeight: 600 }}>
                      Dev / Mock Data
                    </div>
                  )}
                  <div className="tq-dashboard-funnel-grid">
                    {funnelSteps.map((step) => (
                      <div key={step.name} className="tq-dashboard-funnel-step">
                        <div className="tq-dashboard-funnel-value">{step.value}</div>
                        <div className="tq-dashboard-funnel-name">{step.name}</div>
                        <div className="tq-dashboard-funnel-bar" style={{ width: `${Math.min(100, totalLeads > 0 ? (step.value / totalLeads) * 100 : 0)}%` }} />
                        {step.drop && <div className="tq-dashboard-funnel-drop">{step.drop}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Conversations */}
              <div className="tq-dashboard-card" id="conversations-table">
                <div className="tq-dashboard-card-header">
                  <div>
                    <div className="tq-dashboard-card-title">Recent Conversations</div>
                    <div className="tq-dashboard-card-subtitle">Latest lead qualification activity</div>
                  </div>
                  <div style={{ display: "flex", gap: "var(--tq-sp-2)" }}>
                    <button className="tq-btn tq-btn-ghost tq-btn-sm" disabled>Filter</button>
                    <button className="tq-btn tq-btn-ghost tq-btn-sm" onClick={downloadCsv}>Export CSV</button>
                  </div>
                </div>
                <div className="tq-dashboard-table">
                  {leads.length === 0 ? (
                    <p className="tq-no-data">No leads yet. Start chatting to see data here!</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Lead</th>
                          <th>Business</th>
                          <th>Score</th>
                          <th>Route</th>
                          <th>Score Reason</th>
                          <th>Booking</th>
                          <th>Last Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((lead) => (
                          <tr key={lead.id}>
                            <td><span className="tq-lead-name">{lead.contact_info.name || "Anonymous"}</span></td>
                            <td><span className="tq-lead-business">{lead.contact_info.company || "—"}</span></td>
                            <td>
                              <span className={`tq-score-badge-sm tq-score-badge-${lead.score}`}>
                                {lead.score.charAt(0).toUpperCase() + lead.score.slice(1)}
                              </span>
                            </td>
                            <td>
                              <span
                                className="tq-route-badge-sm"
                                style={lead.score === "medium" ? { background: "var(--tq-warning-bg)", color: "var(--tq-warning)" } : lead.score === "low" ? { background: "var(--tq-danger-bg)", color: "var(--tq-danger)" } : undefined}
                              >
                                {getRouteLabel(lead.route)}
                              </span>
                            </td>
                            <td className="tq-reason-cell">{lead.scoring_result?.score_reason || "—"}</td>
                            <td>
                              <span className={`tq-booking-badge tq-booking-${lead.status === "booked" ? "yes" : lead.status === "contacted" ? "pending" : "no"}`}>
                                {lead.status === "booked" ? "Booked" : lead.status === "contacted" ? "Pending" : "—"}
                              </span>
                            </td>
                            <td className="tq-time-cell">{formatDate(lead.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {leads.length > PAGE_SIZE && (
                  <div className="tq-pagination">
                    <span className="tq-pagination-info">
                      Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, leads.length)} of {leads.length} leads
                    </span>
                    <div className="tq-pagination-buttons">
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button
                          key={i + 1}
                          className={`tq-pagination-btn${page === i + 1 ? " tq-pagination-btn-active" : ""}`}
                          onClick={() => setPage(i + 1)}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
