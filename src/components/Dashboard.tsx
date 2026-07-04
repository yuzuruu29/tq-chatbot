// TQ ChatBot #1 - Dashboard Component
import React, { useState, useEffect } from "react";
import type { Lead, DashboardMetrics, LeadScore } from "../types";
import { leadService } from "../services/leadService";
import { calendlyService } from "../services/calendlyService";

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

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // In production, this would fetch from Supabase
      // For now, we'll use the in-memory data from services
      
      // Get leads (in-memory storage)
      const allLeads = await leadService.getLeadsByTenant("default");
      setLeads(allLeads);

      // Calculate metrics based on time range
      const now = new Date();
      let startDate: Date;

      switch (timeRange) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }

      // Filter leads by time range
      const filteredLeads = allLeads.filter(lead => {
        const leadDate = new Date(lead.created_at);
        return leadDate >= startDate;
      });

      // Calculate score split
      const scoreSplit: Record<LeadScore, number> = {
        low: 0,
        medium: 0,
        high: 0
      };

      filteredLeads.forEach(lead => {
        scoreSplit[lead.score]++;
      });

      // Get Calendly metrics
      const calendlyMetrics = calendlyService.getMetrics();

      setMetrics({
        leads_today: timeRange === "today" ? filteredLeads.length : 0,
        leads_week: timeRange === "week" ? filteredLeads.length : 0,
        leads_month: timeRange === "month" ? filteredLeads.length : 0,
        score_split: scoreSplit,
        calendly_shown: calendlyMetrics.shown,
        calendly_clicked: calendlyMetrics.clicked,
        calendly_booked: calendlyMetrics.booked,
        funnel_steps: {},
        recent_conversations: []
      });
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: LeadScore): string => {
    switch (score) {
      case "high":
        return "#22c55e"; // Green
      case "medium":
        return "#f59e0b"; // Amber
      case "low":
        return "#ef4444"; // Red
      default:
        return "#6b7280"; // Gray
    }
  };

  const getRouteLabel = (route: string): string => {
    switch (route) {
      case "calendly":
        return "Calendly";
      case "soft_booking":
        return "Soft Booking";
      case "nurture":
        return "Nurture";
      case "helpful_guidance":
        return "Guidance";
      default:
        return route;
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="tq-dashboard">
      <header className="tq-dashboard-header">
        <h1>Funnel Dashboard</h1>
        <div className="tq-dashboard-time-range">
          <button 
            className={timeRange === "today" ? "active" : ""} 
            onClick={() => setTimeRange("today")}
          >
            Today
          </button>
          <button 
            className={timeRange === "week" ? "active" : ""} 
            onClick={() => setTimeRange("week")}
          >
            Last 7 Days
          </button>
          <button 
            className={timeRange === "month" ? "active" : ""} 
            onClick={() => setTimeRange("month")}
          >
            Last 30 Days
          </button>
        </div>
      </header>

      {loading ? (
        <div className="tq-dashboard-loading">
          <div className="tq-spinner"></div>
          <p>Loading dashboard data...</p>
        </div>
      ) : (
        <>
          {/* Metrics Overview */}
          <section className="tq-dashboard-metrics">
            <div className="tq-metric-card">
              <h3>Total Leads</h3>
              <div className="tq-metric-value">
                {timeRange === "today" ? metrics.leads_today : 
                 timeRange === "week" ? metrics.leads_week : metrics.leads_month}
              </div>
              <p className="tq-metric-label">
                {timeRange === "today" ? "Today" : 
                 timeRange === "week" ? "Last 7 Days" : "Last 30 Days"}
              </p>
            </div>

            <div className="tq-metric-card">
              <h3>Qualified</h3>
              <div className="tq-metric-value" style={{ color: getScoreColor("high") }}>
                {metrics.score_split.high}
              </div>
              <p className="tq-metric-label">Routed to Calendly</p>
            </div>

            <div className="tq-metric-card">
              <h3>Nurture</h3>
              <div className="tq-metric-value" style={{ color: getScoreColor("medium") }}>
                {metrics.score_split.medium}
              </div>
              <p className="tq-metric-label">In follow-up sequence</p>
            </div>

            <div className="tq-metric-card">
              <h3>Low Priority</h3>
              <div className="tq-metric-value" style={{ color: getScoreColor("low") }}>
                {metrics.score_split.low}
              </div>
              <p className="tq-metric-label">Received guidance</p>
            </div>
          </section>

          {/* Calendly Metrics */}
          <section className="tq-dashboard-section">
            <h2>Calendly Funnel</h2>
            <div className="tq-calendly-metrics">
              <div className="tq-calendly-metric">
                <h4>Calendly Shown</h4>
                <p>{metrics.calendly_shown}</p>
              </div>
              <div className="tq-calendly-metric">
                <h4>Calendly Clicked</h4>
                <p>{metrics.calendly_clicked}</p>
              </div>
              <div className="tq-calendly-metric">
                <h4>Booked</h4>
                <p>{metrics.calendly_booked}</p>
              </div>
              <div className="tq-calendly-metric">
                <h4>Conversion Rate</h4>
                <p>{metrics.calendly_shown > 0 ? 
                  `${Math.round((metrics.calendly_booked / metrics.calendly_shown) * 100)}%` : "0%"}</p>
              </div>
            </div>
          </section>

          {/* Score Distribution Chart */}
          <section className="tq-dashboard-section">
            <h2>Score Distribution</h2>
            <div className="tq-score-chart">
              {Object.entries(metrics.score_split).map(([score, count]) => (
                <div key={score} className="tq-score-bar">
                  <div className="tq-score-label">
                    <span 
                      className="tq-score-dot" 
                      style={{ backgroundColor: getScoreColor(score as LeadScore) }}
                    />
                    {score.charAt(0).toUpperCase() + score.slice(1)}
                  </div>
                  <div className="tq-score-bar-container">
                    <div 
                      className="tq-score-bar-fill"
                      style={{
                        width: `${count > 0 ? (count / Math.max(...Object.values(metrics.score_split)) * 100) : 0}%`,
                        backgroundColor: getScoreColor(score as LeadScore)
                      }}
                    />
                  </div>
                  <div className="tq-score-count">{count}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Leads */}
          <section className="tq-dashboard-section">
            <h2>Recent Conversations</h2>
            <div className="tq-leads-table-container">
              {leads.length === 0 ? (
                <p className="tq-no-data">No leads yet. Start chatting to see data here!</p>
              ) : (
                <table className="tq-leads-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Score</th>
                      <th>Route</th>
                      <th>Contact</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.slice(0, 10).map((lead) => (
                      <tr key={lead.id} className="tq-lead-row">
                        <td>{formatDate(lead.created_at)}</td>
                        <td>
                          <span 
                            className="tq-score-badge" 
                            style={{ backgroundColor: getScoreColor(lead.score) }}
                          >
                            {lead.score.toUpperCase()}
                          </span>
                        </td>
                        <td>{getRouteLabel(lead.route)}</td>
                        <td>
                          {lead.contact_info.name || "Anonymous"} <br />
                          {lead.contact_info.email ? <small>{lead.contact_info.email}</small> : "No email"}
                        </td>
                        <td>
                          <span className={`tq-status-badge tq-status-${lead.status}`}>
                            {lead.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Scoring Insights with Summary */}
          <section className="tq-dashboard-section">
            <h2>Scoring Insights</h2>
            <div className="tq-scoring-insights">
              {leads
                .filter(lead => lead.scoring_result?.score_reason)
                .slice(0, 5)
                .map((lead) => (
                  <div key={lead.id} className="tq-scoring-insight">
                    <div className="tq-scoring-insight-header">
                      <span
                        className="tq-score-badge"
                        style={{ backgroundColor: getScoreColor(lead.score) }}
                      >
                        {lead.score.toUpperCase()}
                      </span>
                      <span className="tq-scoring-insight-route">
                        → {getRouteLabel(lead.route)}
                      </span>
                      {lead.scoring_result?.score_value !== undefined && (
                        <span className="tq-score-numeric">
                          {lead.scoring_result.score_value}/100
                        </span>
                      )}
                    </div>
                    <p className="tq-scoring-insight-reason">
                      {lead.scoring_result?.score_reason}
                    </p>
                    {lead.scoring_result?.summary && (
                      <div className="tq-scoring-summary">
                        <span><strong>Business:</strong> {lead.scoring_result.summary.business_type}</span>
                        <span><strong>Pain:</strong> {lead.scoring_result.summary.pain_point}</span>
                        <span><strong>Urgency:</strong> {lead.scoring_result.summary.urgency}</span>
                        <span><strong>Next:</strong> {lead.scoring_result.summary.next_action}</span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Dashboard;
