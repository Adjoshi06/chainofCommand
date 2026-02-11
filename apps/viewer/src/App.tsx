import { useEffect, useMemo, useState } from "react";

type TraceListItem = {
  trace_id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  verification_verdict: string | null;
  participant_roles: string[];
};

type EventRecord = {
  event_id: string;
  event_type: string;
  created_at: string;
  actor: { agent_id: string; role: string; key_id: string };
  prev_event_hash: string;
  event_hash: string;
  payload_hash: string;
  payload_type: string;
  payload: unknown;
  artifacts: Array<{ artifact_hash: string }>;
};

type VerificationReport = {
  verification_status: string;
  checks: Array<{ check_id: string; status: string }>;
  failures: Array<{ failure_code: string; severity: string; message: string; event_id?: string }>;
  warnings: Array<{ warning_code: string; severity: string; message: string; event_id?: string }>;
};

const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:4310";

const badgeClass = (value: string): string => {
  if (value.includes("fail")) {
    return "badge badge-fail";
  }
  if (value.includes("warning")) {
    return "badge badge-warn";
  }
  return "badge badge-pass";
};

export const App = (): JSX.Element => {
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/traces`)
      .then((response) => response.json())
      .then((payload: { items: TraceListItem[] }) => {
        setTraces(payload.items ?? []);
        if (payload.items?.length) {
          setActiveTraceId(payload.items[0].trace_id);
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Failed to load traces"));
  }, []);

  useEffect(() => {
    if (!activeTraceId) {
      return;
    }

    const query = new URLSearchParams();
    if (roleFilter) {
      query.set("role", roleFilter);
    }
    if (typeFilter) {
      query.set("type", typeFilter);
    }
    query.set("limit", "500");

    fetch(`${apiBase}/api/traces/${activeTraceId}/events?${query.toString()}`)
      .then((response) => response.json())
      .then((payload: { items: EventRecord[] }) => {
        setEvents(payload.items ?? []);
        setSelectedEventId(payload.items?.[0]?.event_id ?? null);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Failed to load events"));

    fetch(`${apiBase}/api/traces/${activeTraceId}/reports/latest`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setReport(payload))
      .catch(() => setReport(null));
  }, [activeTraceId, roleFilter, typeFilter]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.event_id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const distinctRoles = useMemo(
    () => Array.from(new Set(events.map((event) => event.actor.role))).sort(),
    [events]
  );
  const distinctTypes = useMemo(
    () => Array.from(new Set(events.map((event) => event.event_type))).sort(),
    [events]
  );

  return (
    <div className="page-shell">
      <header className="topbar">
        <h1>Chain of Command</h1>
        <p>Trace Viewer</p>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <main className="layout">
        <section className="panel trace-list">
          <h2>Trace List</h2>
          <div className="trace-items">
            {traces.map((trace) => (
              <button
                key={trace.trace_id}
                className={trace.trace_id === activeTraceId ? "trace-item active" : "trace-item"}
                onClick={() => setActiveTraceId(trace.trace_id)}
              >
                <div className="trace-head">
                  <span>{trace.trace_id}</span>
                  <span className={badgeClass(trace.verification_verdict ?? trace.status)}>
                    {trace.verification_verdict ?? trace.status}
                  </span>
                </div>
                <div className="trace-meta">task: {trace.task_id}</div>
                <div className="trace-meta">{trace.participant_roles.join(", ")}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel timeline">
          <div className="panel-head">
            <h2>Event Timeline</h2>
            <div className="filters">
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="">All roles</option>
                {distinctRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="">All event types</option>
                {distinctTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="timeline-list">
            {events.map((event) => (
              <button
                key={event.event_id}
                className={event.event_id === selectedEventId ? "timeline-item active" : "timeline-item"}
                onClick={() => setSelectedEventId(event.event_id)}
              >
                <span className="event-time">{new Date(event.created_at).toLocaleString()}</span>
                <span className="event-type">{event.event_type}</span>
                <span className="event-role">{event.actor.role}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel detail">
          <h2>Event Detail</h2>
          {selectedEvent ? (
            <div className="detail-body">
              <div>
                <strong>event_id</strong>
                <p>{selectedEvent.event_id}</p>
              </div>
              <div>
                <strong>signature key</strong>
                <p>{selectedEvent.actor.key_id}</p>
              </div>
              <div>
                <strong>payload hash</strong>
                <p>{selectedEvent.payload_hash}</p>
              </div>
              <div>
                <strong>artifacts</strong>
                <p>{selectedEvent.artifacts.map((artifact) => artifact.artifact_hash).join(", ") || "none"}</p>
              </div>
              <pre>{JSON.stringify(selectedEvent.payload, null, 2)}</pre>
            </div>
          ) : (
            <p>No event selected.</p>
          )}
        </section>

        <section className="panel report">
          <h2>Verification Report</h2>
          {report ? (
            <div className="report-body">
              <div className={badgeClass(report.verification_status)}>{report.verification_status}</div>
              <h3>Checks</h3>
              <ul>
                {report.checks.map((check) => (
                  <li key={check.check_id}>
                    {check.check_id}: {check.status}
                  </li>
                ))}
              </ul>
              <h3>Failures</h3>
              <ul>
                {report.failures.length === 0 ? <li>No failures.</li> : null}
                {report.failures.map((entry, index) => (
                  <li key={`${entry.failure_code}-${index}`}>
                    [{entry.severity}] {entry.failure_code}: {entry.message}
                  </li>
                ))}
              </ul>
              <h3>Warnings</h3>
              <ul>
                {report.warnings.length === 0 ? <li>No warnings.</li> : null}
                {report.warnings.map((entry, index) => (
                  <li key={`${entry.warning_code}-${index}`}>
                    [{entry.severity}] {entry.warning_code}: {entry.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>No report found.</p>
          )}
        </section>
      </main>
    </div>
  );
};
